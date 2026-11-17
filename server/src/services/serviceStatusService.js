import { BusinessRuleError, NotFoundError } from '../domain/errors.js';
import { assertCanChangeService } from '../domain/permissions.js';
import { recordHistory, listRecentEvents } from './historyService.js';

export const SERVICE_STATES = Object.freeze(['operativo', 'afectado', 'en_recuperacion']);

/**
 * Transiciones manuales permitidas. Un servicio afectado no puede volver a
 * "operativo" sin pasar por recuperación; una recuperación fallida vuelve a "afectado".
 */
const MANUAL_TRANSITIONS = Object.freeze({
  operativo: ['afectado'],
  afectado: ['en_recuperacion'],
  en_recuperacion: ['operativo', 'afectado'],
});

export function listServices(db) {
  return db.prepare('SELECT * FROM servicios ORDER BY tipo DESC, criticidad DESC, codigo').all();
}

export function getService(db, serviceId) {
  const service = db.prepare('SELECT * FROM servicios WHERE id = ?').get(serviceId);
  if (!service) throw new NotFoundError('Servicio', serviceId);
  return service;
}

/**
 * Aplica un cambio de estado y lo audita. Usado tanto por cambios manuales
 * como por los efectos automáticos del flujo de contingencia.
 * @returns {boolean} true si el estado cambió.
 */
export function applyServiceStatus(db, service, nuevoEstado, { nota = null, incidenteId = null, usuarioId, evento }) {
  if (service.estado === nuevoEstado && service.nota_estado === nota) return false;

  db.prepare(
    `UPDATE servicios SET estado = ?, nota_estado = ?, actualizado_en = datetime('now') WHERE id = ?`
  ).run(nuevoEstado, nota, service.id);

  recordHistory(db, {
    incidenteId,
    servicioId: service.id,
    evento,
    estadoAnterior: service.estado,
    estadoNuevo: nuevoEstado,
    detalle: nota,
    usuarioId,
  });
  return true;
}

/** Último incidente abierto que afecta al servicio, para enlazar el historial. */
function findOpenIncidentForService(db, serviceId) {
  const row = db.prepare(
    `SELECT i.id FROM incidentes i
       JOIN incidente_servicios isv ON isv.incidente_id = i.id
      WHERE isv.servicio_id = ? AND i.estado = 'abierto'
      ORDER BY i.id DESC LIMIT 1`
  ).get(serviceId);
  return row?.id ?? null;
}

export function changeServiceStatus(db, serviceId, { estado, nota }, user) {
  return db.transaction(() => {
    const service = getService(db, serviceId);
    assertCanChangeService(user, service);

    if (service.estado === estado) {
      throw new BusinessRuleError(`El servicio ya está en estado "${estado}"`);
    }
    const allowed = MANUAL_TRANSITIONS[service.estado];
    if (!allowed.includes(estado)) {
      throw new BusinessRuleError(
        `Transición no permitida: ${service.estado} → ${estado}. Permitidas: ${allowed.join(', ')}`
      );
    }

    applyServiceStatus(db, service, estado, {
      nota: nota ?? null,
      incidenteId: findOpenIncidentForService(db, serviceId),
      usuarioId: user.id,
      evento: 'cambio_estado_servicio',
    });
    return getService(db, serviceId);
  })();
}

export function getDashboard(db) {
  const servicios = listServices(db);

  const resumen = SERVICE_STATES.reduce((acc, estado) => ({ ...acc, [estado]: 0 }), { total: servicios.length });
  servicios.forEach((s) => { resumen[s.estado] += 1; });

  const disponibilidad = servicios.length === 0 ? 100 : Math.round((resumen.operativo / servicios.length) * 100);

  const incidentesAbiertos = db.prepare(
    `SELECT id, codigo, titulo, etapa, severidad, detectado_en
       FROM incidentes WHERE estado = 'abierto' ORDER BY id DESC`
  ).all();

  return {
    generadoEn: new Date().toISOString(),
    resumen: { ...resumen, disponibilidad },
    servicios: {
      OT: servicios.filter((s) => s.tipo === 'OT'),
      TI: servicios.filter((s) => s.tipo === 'TI'),
    },
    incidentesAbiertos,
    ultimosEventos: listRecentEvents(db, 12),
  };
}
