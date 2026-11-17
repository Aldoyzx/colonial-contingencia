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
export async function insertAction(db, { incidenteId, etapa, origen = 'manual', descripcion, responsableId, usuarioId }) {
  const { id } = await db.one(
    `INSERT INTO acciones (incidente_id, etapa, origen, descripcion, responsable_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [incidenteId, etapa, origen, descripcion, responsableId]
  );

  await recordHistory(db, {
    incidenteId,
    evento: 'accion_asignada',
    estadoNuevo: 'pendiente',
    detalle: descripcion,
    usuarioId,
  });
  return id;
}

export function listActions(db, incidenteId) {
  return db.many(
    `SELECT a.*, u.nombre AS responsable_nombre, u.rol AS responsable_rol
       FROM acciones a JOIN usuarios u ON u.id = a.responsable_id
      WHERE a.incidente_id = $1
      ORDER BY a.id`,
    [incidenteId]
  );
}

export async function countOpenActions(db, incidenteId, etapa = null) {
  const { total } = await db.one(
    `SELECT COUNT(*) AS total FROM acciones
      WHERE incidente_id = $1 AND estado = ANY($2::estado_accion[]) AND ($3::varchar IS NULL OR etapa = $3)`,
    [incidenteId, OPEN_ACTION_STATES, etapa]
  );
  return total;
}

async function getAction(db, actionId, { forUpdate = false } = {}) {
  const action = await db.one(`SELECT * FROM acciones WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [actionId]);
  if (!action) throw new NotFoundError('Acción', actionId);
  return action;
}

async function getOpenIncident(db, incidenteId) {
  // FOR UPDATE serializa los cambios concurrentes sobre el mismo incidente.
  const incident = await db.one('SELECT * FROM incidentes WHERE id = $1 FOR UPDATE', [incidenteId]);
  if (!incident) throw new NotFoundError('Incidente', incidenteId);
  if (incident.estado !== 'abierto') throw new BusinessRuleError('El incidente está cerrado');
  return incident;
}

/** Acción manual adicional en la etapa actual del incidente. */
export function createAction(db, incidenteId, { descripcion, responsableId }, user) {
  return db.tx(async (tx) => {
    const incident = await getOpenIncident(tx, incidenteId);
    await requireActiveUserById(tx, responsableId);
    const id = await insertAction(tx, {
      incidenteId,
      etapa: incident.etapa,
      descripcion,
      responsableId,
      usuarioId: user.id,
    });
    return getAction(tx, id);
  });
}

export function updateAction(db, actionId, { estado, resultado }, user) {
  return db.tx(async (tx) => {
    const { incidente_id: incidenteId } = await getAction(tx, actionId);
    await getOpenIncident(tx, incidenteId);
    const action = await getAction(tx, actionId, { forUpdate: true });
    assertCanUpdateAction(user, action);

    if (!ACTION_TRANSITIONS[action.estado].includes(estado)) {
      throw new BusinessRuleError(`La acción no puede pasar de "${action.estado}" a "${estado}"`);
    }
    if (estado === 'fallida' && !resultado?.trim()) {
      throw new ValidationError('resultado: es obligatorio explicar por qué falló la acción');
    }

    await tx.run(
      `UPDATE acciones SET estado = $1, resultado = COALESCE($2, resultado), actualizada_en = now() WHERE id = $3`,
      [estado, resultado ?? null, actionId]
    );

    await recordHistory(tx, {
      incidenteId: action.incidente_id,
      evento: 'accion_actualizada',
      estadoAnterior: action.estado,
      estadoNuevo: estado,
      detalle: resultado ? `${action.descripcion} — ${resultado}` : action.descripcion,
      usuarioId: user.id,
    });
    return getAction(tx, actionId);
  });
}
