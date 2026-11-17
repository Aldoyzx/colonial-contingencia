import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.js';
import { assertCanUpdateAction } from '../domain/permissions.js';
import { recordHistory } from './historyService.js';
import { requireActiveUserById } from './userService.js';

export const ACTION_STATES = Object.freeze(['pendiente', 'en_progreso', 'completada', 'fallida']);
export const OPEN_ACTION_STATES = Object.freeze(['pendiente', 'en_progreso']);

const ACTION_TRANSITIONS = Object.freeze({
  pendiente: ['en_progreso', 'completada', 'fallida'],
  en_progreso: ['completada', 'fallida'],
  completada: [],
  fallida: [],
});

/**
 * @param origen 'manual', 'entrada:<etapa>' o '<Dn>:si|no'; permite saber qué nodo del flujo generó la acción.
 */
export function insertAction(db, { incidenteId, etapa, origen = 'manual', descripcion, responsableId, usuarioId }) {
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO acciones (incidente_id, etapa, origen, descripcion, responsable_id) VALUES (?, ?, ?, ?, ?)`
  ).run(incidenteId, etapa, origen, descripcion, responsableId);

  recordHistory(db, {
    incidenteId,
    evento: 'accion_asignada',
    estadoNuevo: 'pendiente',
    detalle: descripcion,
    usuarioId,
  });
  return Number(lastInsertRowid);
}

export function listActions(db, incidenteId) {
  return db.prepare(
    `SELECT a.*, u.nombre AS responsable_nombre, u.rol AS responsable_rol
       FROM acciones a JOIN usuarios u ON u.id = a.responsable_id
      WHERE a.incidente_id = ?
      ORDER BY a.id`
  ).all(incidenteId);
}

export function countOpenActions(db, incidenteId, etapa = null) {
  const placeholders = OPEN_ACTION_STATES.map(() => '?').join(',');
  const stageFilter = etapa ? 'AND etapa = ?' : '';
  const params = [incidenteId, ...OPEN_ACTION_STATES, ...(etapa ? [etapa] : [])];
  return db.prepare(
    `SELECT COUNT(*) AS total FROM acciones
      WHERE incidente_id = ? AND estado IN (${placeholders}) ${stageFilter}`
  ).get(...params).total;
}

function getAction(db, actionId) {
  const action = db.prepare('SELECT * FROM acciones WHERE id = ?').get(actionId);
  if (!action) throw new NotFoundError('Acción', actionId);
  return action;
}

function getOpenIncident(db, incidenteId) {
  const incident = db.prepare('SELECT * FROM incidentes WHERE id = ?').get(incidenteId);
  if (!incident) throw new NotFoundError('Incidente', incidenteId);
  if (incident.estado !== 'abierto') throw new BusinessRuleError('El incidente está cerrado');
  return incident;
}

/** Acción manual adicional en la etapa actual del incidente. */
export function createAction(db, incidenteId, { descripcion, responsableId }, user) {
  return db.transaction(() => {
    const incident = getOpenIncident(db, incidenteId);
    requireActiveUserById(db, responsableId);
    const id = insertAction(db, {
      incidenteId,
      etapa: incident.etapa,
      descripcion,
      responsableId,
      usuarioId: user.id,
    });
    return getAction(db, id);
  })();
}

export function updateAction(db, actionId, { estado, resultado }, user) {
  return db.transaction(() => {
    const action = getAction(db, actionId);
    getOpenIncident(db, action.incidente_id);
    assertCanUpdateAction(user, action);

    if (!ACTION_TRANSITIONS[action.estado].includes(estado)) {
      throw new BusinessRuleError(`La acción no puede pasar de "${action.estado}" a "${estado}"`);
    }
    if (estado === 'fallida' && !resultado?.trim()) {
      throw new ValidationError('resultado: es obligatorio explicar por qué falló la acción');
    }

    db.prepare(
      `UPDATE acciones SET estado = ?, resultado = COALESCE(?, resultado), actualizada_en = datetime('now') WHERE id = ?`
    ).run(estado, resultado ?? null, actionId);

    recordHistory(db, {
      incidenteId: action.incidente_id,
      evento: 'accion_actualizada',
      estadoAnterior: action.estado,
      estadoNuevo: estado,
      detalle: resultado ? `${action.descripcion} — ${resultado}` : action.descripcion,
      usuarioId: user.id,
    });
    return getAction(db, actionId);
  })();
}
