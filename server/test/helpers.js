import { createDatabase } from '../src/db/connection.js';
import { updateAction } from '../src/services/actionService.js';
import { getActiveUser } from '../src/services/userService.js';

export function setup() {
  const db = createDatabase(':memory:');
  const users = {
    coordinador: getActiveUser(db, 1),
    analistaTi: getActiveUser(db, 2),
    operadorOt: getActiveUser(db, 3),
    legal: getActiveUser(db, 4),
    comunicaciones: getActiveUser(db, 5),
  };
  return { db, users };
}

export function serviceByCode(db, codigo) {
  return db.prepare('SELECT * FROM servicios WHERE codigo = ?').get(codigo);
}

export function serviceIds(db, ...codes) {
  return codes.map((code) => serviceByCode(db, code).id);
}

/** Marca como completadas (o fallidas) todas las acciones abiertas de la etapa actual. */
export function closeStageActions(db, detail, user, { estado = 'completada', resultado = 'Ejecutado' } = {}) {
  detail.acciones
    .filter((a) => a.etapa === detail.etapa && ['pendiente', 'en_progreso'].includes(a.estado))
    .forEach((a) => updateAction(db, a.id, { estado, resultado }, user));
}

export const baseIncident = (db) => ({
  titulo: 'Ransomware DarkSide en red corporativa',
  descripcion: 'Nota de rescate en servidores de facturación; actividad anómala desde la VPN.',
  severidad: 'alta',
  responsableId: 1,
  servicioIds: serviceIds(db, 'TI-FACT', 'TI-VPN', 'TI-ERP'),
});
