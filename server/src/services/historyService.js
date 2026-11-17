/**
 * Registra un evento en el historial de recuperación (auditoría inmutable).
 */
export function recordHistory(db, { incidenteId = null, servicioId = null, evento, estadoAnterior = null, estadoNuevo = null, detalle = null, usuarioId }) {
  db.prepare(
    `INSERT INTO historial_recuperacion
       (incidente_id, servicio_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(incidenteId, servicioId, evento, estadoAnterior, estadoNuevo, detalle, usuarioId);
}

export function listIncidentHistory(db, incidenteId) {
  return db.prepare(
    `SELECT h.*, u.nombre AS usuario_nombre, s.nombre AS servicio_nombre
       FROM historial_recuperacion h
       JOIN usuarios u ON u.id = h.usuario_id
       LEFT JOIN servicios s ON s.id = h.servicio_id
      WHERE h.incidente_id = ?
      ORDER BY h.id DESC`
  ).all(incidenteId);
}

export function listRecentEvents(db, limit = 10) {
  return db.prepare(
    `SELECT h.*, u.nombre AS usuario_nombre, s.nombre AS servicio_nombre, i.codigo AS incidente_codigo
       FROM historial_recuperacion h
       JOIN usuarios u ON u.id = h.usuario_id
       LEFT JOIN servicios s ON s.id = h.servicio_id
       LEFT JOIN incidentes i ON i.id = h.incidente_id
      ORDER BY h.id DESC
      LIMIT ?`
  ).all(limit);
}
