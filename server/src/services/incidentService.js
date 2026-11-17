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

async function getIncidentRow(db, incidentId, { forUpdate = false } = {}) {
  const incident = await db.one(`SELECT * FROM incidentes WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [incidentId]);
  if (!incident) throw new NotFoundError('Incidente', incidentId);
  return incident;
}

/** Bloquea la fila del incidente (FOR UPDATE) para que dos usuarios no lo modifiquen a la vez. */
async function lockOpenIncident(db, incidentId) {
  const incident = await getIncidentRow(db, incidentId, { forUpdate: true });
  if (incident.estado !== 'abierto') throw new BusinessRuleError(`El incidente ${incident.codigo} ya está cerrado`);
  return incident;
}

function listIncidentServices(db, incidentId) {
  return db.many(
    `SELECT s.* FROM servicios s
       JOIN incidente_servicios isv ON isv.servicio_id = s.id
      WHERE isv.incidente_id = $1
      ORDER BY s.tipo DESC, s.criticidad DESC`,
    [incidentId]
  );
}

function listDecisions(db, incidentId) {
  return db.many(
    `SELECT d.*, u.nombre AS usuario_nombre FROM decisiones d
       JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.incidente_id = $1 ORDER BY d.id`,
    [incidentId]
  );
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
  return db.many(
    `SELECT i.id, i.codigo, i.titulo, i.severidad, i.etapa, i.estado, i.detectado_en, i.cerrado_en, i.es_simulacro,
            i.intentos_erradicacion, u.nombre AS responsable_nombre,
            (SELECT COUNT(*) FROM acciones a
              WHERE a.incidente_id = i.id AND a.estado IN ('pendiente','en_progreso')) AS acciones_abiertas
       FROM incidentes i JOIN usuarios u ON u.id = i.responsable_id
      WHERE ($1::estado_incidente IS NULL OR i.estado = $1)
      ORDER BY i.id DESC`,
    [estado ?? null]
  );
}

export async function getIncidentDetail(db, incidentId) {
  // Consultas secuenciales: dentro de una transacción comparten una sola conexión.
  const incident = await getIncidentRow(db, incidentId);
  return {
    ...incident,
    responsable: await db.one('SELECT id, nombre, rol FROM usuarios WHERE id = $1', [incident.responsable_id]),
    servicios: await listIncidentServices(db, incidentId),
    acciones: await listActions(db, incidentId),
    decisiones: await listDecisions(db, incidentId),
    historial: await listIncidentHistory(db, incidentId),
    siguientePaso: describeNextStep(incident),
  };
}

// ---------------------------------------------------------------- efectos del flujo

function linkService(db, incidentId, serviceId) {
  return db.run(
    `INSERT INTO incidente_servicios (incidente_id, servicio_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [incidentId, serviceId]
  );
}

async function resolveAssignee(db, rol, fallbackUserId) {
  return (await findUserByRole(db, rol))?.id ?? fallbackUserId;
}

const stageEntryOrigin = (stageKey) => `entrada:${stageKey}`;

async function createFlowAction(db, incident, etapa, origen, template, usuarioId) {
  if (!template) return;
  await insertAction(db, {
    incidenteId: incident.id,
    etapa,
    origen,
    descripcion: template.descripcion,
    responsableId: await resolveAssignee(db, template.rol, incident.responsable_id),
    usuarioId,
  });
}

/** Aplica un cambio de estado a cada servicio, en orden, dentro de la misma transacción. */
async function applyToEach(db, services, nuevoEstado, options) {
  for (const service of services) {
    await applyServiceStatus(db, service, nuevoEstado, options);
  }
}

const SERVICE_EFFECT_HANDLERS = {
  [SERVICE_EFFECT.STOP_OT]: async (db, incident, usuarioId) => {
    const otServices = await db.many(`SELECT * FROM servicios WHERE tipo = 'OT' ORDER BY id FOR UPDATE`);
    for (const service of otServices) {
      await linkService(db, incident.id, service.id);
    }
    await applyToEach(db, otServices, 'afectado', {
      nota: 'Detenido preventivamente (aislamiento TI/OT)',
      incidenteId: incident.id,
      usuarioId,
      evento: 'detencion_preventiva',
    });
  },

  [SERVICE_EFFECT.START_RECOVERY]: async (db, incident, usuarioId) => {
    const affected = (await listIncidentServices(db, incident.id)).filter((s) => s.estado === 'afectado');
    await applyToEach(db, affected, 'en_recuperacion', {
      nota: 'Reinicio progresivo en curso',
      incidenteId: incident.id,
      usuarioId,
      evento: 'inicio_recuperacion',
    });
  },

  [SERVICE_EFFECT.RESTORE_ALL]: async (db, incident, usuarioId) => {
    const pending = (await listIncidentServices(db, incident.id)).filter((s) => s.estado !== 'operativo');
    await applyToEach(db, pending, 'operativo', {
      nota: null,
      incidenteId: incident.id,
      usuarioId,
      evento: 'servicio_restablecido',
    });
  },
};

async function applyServiceEffect(db, effect, incident, usuarioId) {
  if (!effect) return;
  await SERVICE_EFFECT_HANDLERS[effect](db, incident, usuarioId);
}

/** Mueve el incidente a una etapa y ejecuta todo lo que esa etapa implica. */
async function enterStage(db, incident, stageKey, usuarioId, extraDetail = null) {
  const stage = getStage(stageKey);
  const isFinal = stage.tipo === STAGE_TYPE.FINAL;

  await db.run(
    `UPDATE incidentes
        SET etapa = $1,
            estado = CASE WHEN $2 THEN 'cerrado'::estado_incidente ELSE estado END,
            cerrado_en = CASE WHEN $2 THEN now() ELSE cerrado_en END
      WHERE id = $3`,
    [stageKey, isFinal, incident.id]
  );

  await recordHistory(db, {
    incidenteId: incident.id,
    evento: isFinal ? 'incidente_cerrado' : 'cambio_etapa',
    estadoAnterior: incident.etapa,
    estadoNuevo: stageKey,
    detalle: extraDetail ?? `Ingreso a la etapa ${stage.nombre}`,
    usuarioId,
  });

  await createFlowAction(db, incident, stageKey, stageEntryOrigin(stageKey), stage.accionAlEntrar, usuarioId);
  await applyServiceEffect(db, stage.efectoAlEntrar, incident, usuarioId);
}

async function assertStageActionsClosed(db, incident) {
  const open = await countOpenActions(db, incident.id, incident.etapa);
  if (open > 0) {
    throw new BusinessRuleError(
      `Hay ${open} acción(es) pendientes en la etapa "${getStage(incident.etapa).nombre}". Complétalas o márcalas como fallidas antes de continuar`
    );
  }
}

// ---------------------------------------------------------------- casos de uso

/** La secuencia de PostgreSQL entrega un número distinto a cada transacción, aunque sean simultáneas. */
async function nextIncidentCode(db) {
  const { next } = await db.one(`SELECT nextval('incidente_numero_seq') AS next`);
  return `INC-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`;
}

export function createIncident(db, { titulo, descripcion, severidad, responsableId, servicioIds, esSimulacro = false }, user) {
  return db.tx(async (tx) => {
    await requireActiveUserById(tx, responsableId);

    const uniqueServiceIds = [...new Set(servicioIds)];
    const services = await tx.many(`SELECT * FROM servicios WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [uniqueServiceIds]);
    const missing = uniqueServiceIds.filter((id) => !services.some((s) => s.id === id));
    if (missing.length > 0) throw new ValidationError(`servicioIds: el servicio ${missing[0]} no existe`);

    const codigo = await nextIncidentCode(tx);
    const { id: incidentId } = await tx.one(
      `INSERT INTO incidentes (codigo, titulo, descripcion, severidad, etapa, responsable_id, creado_por, es_simulacro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [codigo, titulo, descripcion, severidad, INITIAL_STAGE, responsableId, user.id, esSimulacro]
    );
    const incident = await getIncidentRow(tx, incidentId);

    await recordHistory(tx, {
      incidenteId: incident.id,
      evento: 'incidente_registrado',
      estadoNuevo: INITIAL_STAGE,
      detalle: `${esSimulacro ? '[SIMULACRO] ' : ''}${codigo}: ${titulo}`,
      usuarioId: user.id,
    });

    for (const service of services) {
      await linkService(tx, incident.id, service.id);
    }
    await applyToEach(tx, services.filter((s) => s.estado === 'operativo'), 'afectado', {
      nota: `Afectado por ${codigo}`,
      incidenteId: incident.id,
      usuarioId: user.id,
      evento: 'servicio_afectado',
    });

    await createFlowAction(
      tx, incident, INITIAL_STAGE, stageEntryOrigin(INITIAL_STAGE), getStage(INITIAL_STAGE).accionAlEntrar, user.id
    );
    return getIncidentDetail(tx, incident.id);
  });
}

export function advanceIncident(db, incidentId, { leccionesAprendidas } = {}, user) {
  return db.tx(async (tx) => {
    const incident = await lockOpenIncident(tx, incidentId);
    assertCanAdvance(user, incident);

    const stage = getStage(incident.etapa);
    if (stage.tipo !== STAGE_TYPE.ACTION) {
      throw new BusinessRuleError(
        `La etapa "${stage.nombre}" requiere tomar la decisión ${stage.decision}; no se puede avanzar directamente`
      );
    }
    await assertStageActionsClosed(tx, incident);

    if (stage.requiereLecciones) {
      const lessons = leccionesAprendidas?.trim() ?? '';
      if (lessons.length < MIN_LESSONS_LENGTH) {
        throw new ValidationError(
          `leccionesAprendidas: se requieren al menos ${MIN_LESSONS_LENGTH} caracteres para cerrar el incidente`
        );
      }
      const openActions = await countOpenActions(tx, incident.id);
      if (openActions > 0) {
        throw new BusinessRuleError(`No se puede cerrar: quedan ${openActions} acción(es) abiertas en el incidente`);
      }
      await tx.run('UPDATE incidentes SET lecciones_aprendidas = $1 WHERE id = $2', [lessons, incident.id]);
    }

    const detail = stage.esReintento
      ? `Reintento de erradicación #${incident.intentos_erradicacion + 1}`
      : null;
    await enterStage(tx, incident, stage.siguiente, user.id, detail);
    return getIncidentDetail(tx, incident.id);
  });
}

/**
 * El intento actual de erradicación empieza en la última acción de entrada a la etapa;
 * si cualquier acción de ese intento falló, el sistema no puede declararse seguro.
 */
async function assertCurrentEradicationSucceeded(db, incident) {
  const { total } = await db.one(
    `SELECT COUNT(*) AS total FROM acciones
      WHERE incidente_id = $1 AND etapa = 'erradicacion' AND estado = 'fallida'
        AND id >= COALESCE((SELECT MAX(id) FROM acciones WHERE incidente_id = $1 AND origen = $2), 0)`,
    [incident.id, stageEntryOrigin('erradicacion')]
  );

  if (total > 0) {
    throw new BusinessRuleError(
      'No se puede validar el reinicio: hay acciones fallidas en el intento actual de erradicación. Responde "No" para ir a análisis forense'
    );
  }
}

async function registerFailedEradication(db, incident, usuarioId) {
  const attempts = incident.intentos_erradicacion + 1;
  await db.run('UPDATE incidentes SET intentos_erradicacion = $1 WHERE id = $2', [attempts, incident.id]);

  if (attempts >= MAX_ERADICATION_ATTEMPTS && incident.severidad !== 'critica') {
    await db.run(`UPDATE incidentes SET severidad = 'critica' WHERE id = $1`, [incident.id]);
    await recordHistory(db, {
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
  return db.tx(async (tx) => {
    const incident = await lockOpenIncident(tx, incidentId);
    assertCanDecide(user);

    const stage = getStage(incident.etapa);
    if (stage.tipo !== STAGE_TYPE.DECISION) {
      throw new BusinessRuleError(`La etapa "${stage.nombre}" no tiene una decisión pendiente`);
    }
    if (codigo && codigo !== stage.decision) {
      throw new BusinessRuleError(`La decisión pendiente es ${stage.decision}, no ${codigo}`);
    }
    await assertStageActionsClosed(tx, incident);

    const decisionCode = stage.decision;
    if (decisionCode === 'D3' && respuesta) {
      await assertCurrentEradicationSucceeded(tx, incident);
    }

    const decision = DECISIONS[decisionCode];
    const branch = getBranch(decisionCode, respuesta);

    await tx.run(
      `INSERT INTO decisiones (incidente_id, codigo, pregunta, respuesta, justificacion, etapa_origen, etapa_destino, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [incident.id, decisionCode, decision.pregunta, respuesta, justificacion, incident.etapa, branch.destino, user.id]
    );

    await recordHistory(tx, {
      incidenteId: incident.id,
      evento: 'decision',
      estadoAnterior: incident.etapa,
      estadoNuevo: branch.destino,
      detalle: `${decisionCode} ${decision.pregunta} → ${respuesta ? 'Sí' : 'No'}. ${justificacion}`,
      usuarioId: user.id,
    });

    if (branch.cuentaComoIntentoFallido) {
      await registerFailedEradication(tx, incident, user.id);
    }
    await applyServiceEffect(tx, branch.efecto, incident, user.id);
    await enterStage(tx, incident, branch.destino, user.id);
    await createFlowAction(tx, incident, branch.destino, `${decisionCode}:${respuesta ? 'si' : 'no'}`, branch.accion, user.id);

    return getIncidentDetail(tx, incident.id);
  });
}
