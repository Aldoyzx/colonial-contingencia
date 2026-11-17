import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.js';
import {
  DECISIONS,
  INITIAL_STAGE,
  MAX_ERADICATION_ATTEMPTS,
  MIN_LESSONS_LENGTH,
  SERVICE_EFFECT,
  STAGE_TYPE,
  getBranch,
  getStage,
} from '../domain/flow.js';
import { assertCanAdvance, assertCanDecide } from '../domain/permissions.js';
import { countOpenActions, insertAction, listActions } from './actionService.js';
import { listIncidentHistory, recordHistory } from './historyService.js';
import { applyServiceStatus } from './serviceStatusService.js';
import { findUserByRole, requireActiveUserById } from './userService.js';

// ---------------------------------------------------------------- lecturas

function getIncidentRow(db, incidentId) {
  const incident = db.prepare('SELECT * FROM incidentes WHERE id = ?').get(incidentId);
  if (!incident) throw new NotFoundError('Incidente', incidentId);
  return incident;
}

function getOpenIncidentRow(db, incidentId) {
  const incident = getIncidentRow(db, incidentId);
  if (incident.estado !== 'abierto') throw new BusinessRuleError(`El incidente ${incident.codigo} ya está cerrado`);
  return incident;
}

function listIncidentServices(db, incidentId) {
  return db.prepare(
    `SELECT s.* FROM servicios s
       JOIN incidente_servicios isv ON isv.servicio_id = s.id
      WHERE isv.incidente_id = ?
      ORDER BY s.tipo DESC, s.criticidad DESC`
  ).all(incidentId);
}

function listDecisions(db, incidentId) {
  return db.prepare(
    `SELECT d.*, u.nombre AS usuario_nombre FROM decisiones d
       JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.incidente_id = ? ORDER BY d.id`
  ).all(incidentId).map((d) => ({ ...d, respuesta: Boolean(d.respuesta) }));
}

/** Qué puede hacerse ahora con el incidente; el cliente lo usa para pintar los controles. */
function describeNextStep(incident) {
  const stage = getStage(incident.etapa);
  if (incident.estado === 'cerrado' || stage.tipo === STAGE_TYPE.FINAL) {
    return { tipo: STAGE_TYPE.FINAL };
  }
  if (stage.tipo === STAGE_TYPE.DECISION) {
    const decision = DECISIONS[stage.decision];
    return {
      tipo: STAGE_TYPE.DECISION,
      codigo: stage.decision,
      pregunta: decision.pregunta,
      si: { destino: decision.si.destino, accion: decision.si.accion?.descripcion ?? null },
      no: { destino: decision.no.destino, accion: decision.no.accion?.descripcion ?? null },
    };
  }
  return {
    tipo: STAGE_TYPE.ACTION,
    siguiente: stage.siguiente,
    requiereLecciones: Boolean(stage.requiereLecciones),
    esReintento: Boolean(stage.esReintento),
  };
}

export function listIncidents(db, { estado } = {}) {
  const where = estado ? 'WHERE i.estado = ?' : '';
  return db.prepare(
    `SELECT i.id, i.codigo, i.titulo, i.severidad, i.etapa, i.estado, i.detectado_en, i.cerrado_en,
            i.intentos_erradicacion, u.nombre AS responsable_nombre,
            (SELECT COUNT(*) FROM acciones a
              WHERE a.incidente_id = i.id AND a.estado IN ('pendiente','en_progreso')) AS acciones_abiertas
       FROM incidentes i JOIN usuarios u ON u.id = i.responsable_id
       ${where}
      ORDER BY i.id DESC`
  ).all(...(estado ? [estado] : []));
}

export function getIncidentDetail(db, incidentId) {
  const incident = getIncidentRow(db, incidentId);
  const responsable = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ?').get(incident.responsable_id);

  return {
    ...incident,
    responsable,
    servicios: listIncidentServices(db, incidentId),
    acciones: listActions(db, incidentId),
    decisiones: listDecisions(db, incidentId),
    historial: listIncidentHistory(db, incidentId),
    siguientePaso: describeNextStep(incident),
  };
}

// ---------------------------------------------------------------- efectos del flujo

function linkService(db, incidentId, serviceId) {
  db.prepare('INSERT OR IGNORE INTO incidente_servicios (incidente_id, servicio_id) VALUES (?, ?)').run(incidentId, serviceId);
}

function resolveAssignee(db, rol, fallbackUserId) {
  return findUserByRole(db, rol)?.id ?? fallbackUserId;
}

const stageEntryOrigin = (stageKey) => `entrada:${stageKey}`;

function createFlowAction(db, incident, etapa, origen, template, usuarioId) {
  if (!template) return;
  insertAction(db, {
    incidenteId: incident.id,
    etapa,
    origen,
    descripcion: template.descripcion,
    responsableId: resolveAssignee(db, template.rol, incident.responsable_id),
    usuarioId,
  });
}

const SERVICE_EFFECT_HANDLERS = {
  [SERVICE_EFFECT.STOP_OT]: (db, incident, usuarioId) => {
    const otServices = db.prepare(`SELECT * FROM servicios WHERE tipo = 'OT'`).all();
    otServices.forEach((service) => {
      linkService(db, incident.id, service.id);
      applyServiceStatus(db, service, 'afectado', {
        nota: 'Detenido preventivamente (aislamiento TI/OT)',
        incidenteId: incident.id,
        usuarioId,
        evento: 'detencion_preventiva',
      });
    });
  },

  [SERVICE_EFFECT.START_RECOVERY]: (db, incident, usuarioId) => {
    listIncidentServices(db, incident.id)
      .filter((service) => service.estado === 'afectado')
      .forEach((service) => applyServiceStatus(db, service, 'en_recuperacion', {
        nota: 'Reinicio progresivo en curso',
        incidenteId: incident.id,
        usuarioId,
        evento: 'inicio_recuperacion',
      }));
  },

  [SERVICE_EFFECT.RESTORE_ALL]: (db, incident, usuarioId) => {
    listIncidentServices(db, incident.id)
      .filter((service) => service.estado !== 'operativo')
      .forEach((service) => applyServiceStatus(db, service, 'operativo', {
        nota: null,
        incidenteId: incident.id,
        usuarioId,
        evento: 'servicio_restablecido',
      }));
  },
};

function applyServiceEffect(db, effect, incident, usuarioId) {
  if (!effect) return;
  SERVICE_EFFECT_HANDLERS[effect](db, incident, usuarioId);
}

/** Mueve el incidente a una etapa y ejecuta todo lo que esa etapa implica. */
function enterStage(db, incident, stageKey, usuarioId, extraDetail = null) {
  const stage = getStage(stageKey);
  const isFinal = stage.tipo === STAGE_TYPE.FINAL;

  db.prepare(
    `UPDATE incidentes
        SET etapa = ?,
            estado = CASE WHEN ? THEN 'cerrado' ELSE estado END,
            cerrado_en = CASE WHEN ? THEN datetime('now') ELSE cerrado_en END
      WHERE id = ?`
  ).run(stageKey, isFinal ? 1 : 0, isFinal ? 1 : 0, incident.id);

  recordHistory(db, {
    incidenteId: incident.id,
    evento: isFinal ? 'incidente_cerrado' : 'cambio_etapa',
    estadoAnterior: incident.etapa,
    estadoNuevo: stageKey,
    detalle: extraDetail ?? `Ingreso a la etapa ${stage.nombre}`,
    usuarioId,
  });

  createFlowAction(db, incident, stageKey, stageEntryOrigin(stageKey), stage.accionAlEntrar, usuarioId);
  applyServiceEffect(db, stage.efectoAlEntrar, incident, usuarioId);
}

function assertStageActionsClosed(db, incident) {
  const open = countOpenActions(db, incident.id, incident.etapa);
  if (open > 0) {
    throw new BusinessRuleError(
      `Hay ${open} acción(es) pendientes en la etapa "${getStage(incident.etapa).nombre}". Complétalas o márcalas como fallidas antes de continuar`
    );
  }
}

// ---------------------------------------------------------------- casos de uso

function nextIncidentCode(db) {
  const { next } = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM incidentes').get();
  return `INC-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`;
}

export function createIncident(db, { titulo, descripcion, severidad, responsableId, servicioIds }, user) {
  return db.transaction(() => {
    requireActiveUserById(db, responsableId);

    const uniqueServiceIds = [...new Set(servicioIds)];
    const services = uniqueServiceIds.map((id) => {
      const service = db.prepare('SELECT * FROM servicios WHERE id = ?').get(id);
      if (!service) throw new ValidationError(`servicioIds: el servicio ${id} no existe`);
      return service;
    });

    const codigo = nextIncidentCode(db);
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO incidentes (codigo, titulo, descripcion, severidad, etapa, responsable_id, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(codigo, titulo, descripcion, severidad, INITIAL_STAGE, responsableId, user.id);

    const incident = getIncidentRow(db, Number(lastInsertRowid));

    recordHistory(db, {
      incidenteId: incident.id,
      evento: 'incidente_registrado',
      estadoNuevo: INITIAL_STAGE,
      detalle: `${codigo}: ${titulo}`,
      usuarioId: user.id,
    });

    services.forEach((service) => {
      linkService(db, incident.id, service.id);
      if (service.estado === 'operativo') {
        applyServiceStatus(db, service, 'afectado', {
          nota: `Afectado por ${codigo}`,
          incidenteId: incident.id,
          usuarioId: user.id,
          evento: 'servicio_afectado',
        });
      }
    });

    createFlowAction(
      db, incident, INITIAL_STAGE, stageEntryOrigin(INITIAL_STAGE), getStage(INITIAL_STAGE).accionAlEntrar, user.id
    );
    return getIncidentDetail(db, incident.id);
  })();
}

export function advanceIncident(db, incidentId, { leccionesAprendidas } = {}, user) {
  return db.transaction(() => {
    const incident = getOpenIncidentRow(db, incidentId);
    assertCanAdvance(user, incident);

    const stage = getStage(incident.etapa);
    if (stage.tipo !== STAGE_TYPE.ACTION) {
      throw new BusinessRuleError(
        `La etapa "${stage.nombre}" requiere tomar la decisión ${stage.decision}; no se puede avanzar directamente`
      );
    }
    assertStageActionsClosed(db, incident);

    if (stage.requiereLecciones) {
      const lessons = leccionesAprendidas?.trim() ?? '';
      if (lessons.length < MIN_LESSONS_LENGTH) {
        throw new ValidationError(
          `leccionesAprendidas: se requieren al menos ${MIN_LESSONS_LENGTH} caracteres para cerrar el incidente`
        );
      }
      const openActions = countOpenActions(db, incident.id);
      if (openActions > 0) {
        throw new BusinessRuleError(`No se puede cerrar: quedan ${openActions} acción(es) abiertas en el incidente`);
      }
      db.prepare('UPDATE incidentes SET lecciones_aprendidas = ? WHERE id = ?').run(lessons, incident.id);
    }

    const detail = stage.esReintento
      ? `Reintento de erradicación #${incident.intentos_erradicacion + 1}`
      : null;
    enterStage(db, incident, stage.siguiente, user.id, detail);
    return getIncidentDetail(db, incident.id);
  })();
}

/**
 * El intento actual de erradicación empieza en la última acción de entrada a la etapa;
 * si cualquier acción de ese intento falló, el sistema no puede declararse seguro.
 */
function assertCurrentEradicationSucceeded(db, incident) {
  const attemptStart = db.prepare(
    `SELECT MAX(id) AS id FROM acciones WHERE incidente_id = ? AND origen = ?`
  ).get(incident.id, stageEntryOrigin('erradicacion')).id;

  const failed = db.prepare(
    `SELECT COUNT(*) AS total FROM acciones
      WHERE incidente_id = ? AND etapa = 'erradicacion' AND id >= ? AND estado = 'fallida'`
  ).get(incident.id, attemptStart ?? 0).total;

  if (failed > 0) {
    throw new BusinessRuleError(
      'No se puede validar el reinicio: hay acciones fallidas en el intento actual de erradicación. Responde "No" para ir a análisis forense'
    );
  }
}

function registerFailedEradication(db, incident, usuarioId) {
  const attempts = incident.intentos_erradicacion + 1;
  db.prepare('UPDATE incidentes SET intentos_erradicacion = ? WHERE id = ?').run(attempts, incident.id);

  if (attempts >= MAX_ERADICATION_ATTEMPTS && incident.severidad !== 'critica') {
    db.prepare(`UPDATE incidentes SET severidad = 'critica' WHERE id = ?`).run(incident.id);
    recordHistory(db, {
      incidenteId: incident.id,
      evento: 'escalamiento',
      estadoAnterior: incident.severidad,
      estadoNuevo: 'critica',
      detalle: `${attempts} validaciones fallidas: severidad escalada a crítica`,
      usuarioId,
    });
  }
}

export function decideIncident(db, incidentId, { codigo, respuesta, justificacion }, user) {
  return db.transaction(() => {
    const incident = getOpenIncidentRow(db, incidentId);
    assertCanDecide(user);

    const stage = getStage(incident.etapa);
    if (stage.tipo !== STAGE_TYPE.DECISION) {
      throw new BusinessRuleError(`La etapa "${stage.nombre}" no tiene una decisión pendiente`);
    }
    if (codigo && codigo !== stage.decision) {
      throw new BusinessRuleError(`La decisión pendiente es ${stage.decision}, no ${codigo}`);
    }
    assertStageActionsClosed(db, incident);

    const decisionCode = stage.decision;
    if (decisionCode === 'D3' && respuesta) {
      assertCurrentEradicationSucceeded(db, incident);
    }

    const decision = DECISIONS[decisionCode];
    const branch = getBranch(decisionCode, respuesta);

    db.prepare(
      `INSERT INTO decisiones (incidente_id, codigo, pregunta, respuesta, justificacion, etapa_origen, etapa_destino, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(incident.id, decisionCode, decision.pregunta, respuesta ? 1 : 0, justificacion, incident.etapa, branch.destino, user.id);

    recordHistory(db, {
      incidenteId: incident.id,
      evento: 'decision',
      estadoAnterior: incident.etapa,
      estadoNuevo: branch.destino,
      detalle: `${decisionCode} ${decision.pregunta} → ${respuesta ? 'Sí' : 'No'}. ${justificacion}`,
      usuarioId: user.id,
    });

    if (branch.cuentaComoIntentoFallido) {
      registerFailedEradication(db, incident, user.id);
    }
    applyServiceEffect(db, branch.efecto, incident, user.id);
    enterStage(db, incident, branch.destino, user.id);
    createFlowAction(db, incident, branch.destino, `${decisionCode}:${respuesta ? 'si' : 'no'}`, branch.accion, user.id);

    return getIncidentDetail(db, incident.id);
  })();
}
