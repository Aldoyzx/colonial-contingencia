/**
 * Analítica de negocio: indicadores para el comité de crisis y la gerencia.
 * Los incidentes reales y los simulacros se separan para no distorsionar los tiempos.
 */
const HOURS = (from, to) => `extract(EPOCH FROM (${to} - ${from})) / 3600.0`;

async function summary(db) {
  const row = await db.one(
    `SELECT count(*) FILTER (WHERE NOT es_simulacro)                         AS incidentes_reales,
            count(*) FILTER (WHERE es_simulacro)                             AS simulacros,
            count(*) FILTER (WHERE estado = 'abierto')                       AS abiertos,
            round(avg(${HOURS('detectado_en', 'cerrado_en')}) FILTER (WHERE estado = 'cerrado' AND NOT es_simulacro), 1) AS mttr_horas,
            round(max(${HOURS('detectado_en', 'cerrado_en')}) FILTER (WHERE estado = 'cerrado' AND NOT es_simulacro), 1) AS peor_tiempo_horas
       FROM incidentes`
  );
  // Tiempo medio hasta la contención: desde la detección hasta la primera entrada a "contencion".
  const containment = await db.one(
    `SELECT round(avg(${HOURS('i.detectado_en', 'c.fecha')}), 1) AS mttc_horas
       FROM incidentes i
       JOIN LATERAL (SELECT min(h.fecha) AS fecha FROM historial_recuperacion h
                      WHERE h.incidente_id = i.id AND h.evento = 'cambio_etapa' AND h.estado_nuevo = 'contencion') c ON c.fecha IS NOT NULL
      WHERE NOT i.es_simulacro`
  );
  const services = await db.one(
    `SELECT count(*) AS total, count(*) FILTER (WHERE estado = 'operativo') AS operativos FROM servicios`
  );
  const evidence = await db.one(`SELECT count(*) AS cantidad, COALESCE(sum(tamano_bytes), 0) AS bytes FROM evidencias WHERE NOT anulada`);
  const mfa = await db.one(`SELECT count(*) AS total, count(*) FILTER (WHERE mfa_activo) AS con_mfa FROM usuarios WHERE activo`);
  return {
    ...row,
    mttc_horas: containment.mttc_horas,
    disponibilidad: services.total ? Math.round((services.operativos / services.total) * 100) : 100,
    evidencias: evidence.cantidad,
    evidencias_bytes: evidence.bytes,
    usuarios_con_mfa: mfa.con_mfa,
    usuarios_total: mfa.total,
  };
}

const bySeverity = (db) => db.many(
  `SELECT s.severidad, count(i.id) AS cantidad
     FROM unnest(enum_range(NULL::severidad_incidente)) AS s (severidad)
     LEFT JOIN incidentes i ON i.severidad = s.severidad AND NOT i.es_simulacro
    GROUP BY s.severidad ORDER BY s.severidad`
);

const byMonth = (db) => db.many(
  `SELECT to_char(date_trunc('month', detectado_en), 'YYYY-MM') AS mes,
          count(*) FILTER (WHERE NOT es_simulacro) AS reales,
          count(*) FILTER (WHERE es_simulacro)     AS simulacros
     FROM incidentes
    GROUP BY 1 ORDER BY 1`
);

const stageTimes = (db) => db.many(
  `SELECT etapa, etapa_nombre, orden, round(avg(horas), 1) AS horas_promedio, count(DISTINCT incidente_id) AS incidentes
     FROM v_tiempos_etapa WHERE NOT es_simulacro
    GROUP BY etapa, etapa_nombre, orden ORDER BY orden`
);

const decisions = (db) => db.many(
  `SELECT dp.codigo, dp.pregunta,
          count(d.id) FILTER (WHERE d.respuesta)     AS si,
          count(d.id) FILTER (WHERE NOT d.respuesta) AS no
     FROM decisiones_plan dp
     LEFT JOIN decisiones d ON d.codigo = dp.codigo
     LEFT JOIN incidentes i ON i.id = d.incidente_id
    WHERE i.id IS NULL OR NOT i.es_simulacro
    GROUP BY dp.codigo, dp.pregunta ORDER BY dp.codigo`
);

const actionsByOwner = (db) => db.many(
  `SELECT u.nombre, u.rol,
          count(a.id) FILTER (WHERE a.estado = 'completada')                  AS completadas,
          count(a.id) FILTER (WHERE a.estado = 'fallida')                     AS fallidas,
          count(a.id) FILTER (WHERE a.estado IN ('pendiente', 'en_progreso')) AS abiertas
     FROM usuarios u LEFT JOIN acciones a ON a.responsable_id = u.id
    WHERE u.activo GROUP BY u.id ORDER BY u.id`
);

/**
 * Horas fuera de servicio por activo: suma los tramos en que el servicio no estuvo
 * operativo, según la bitácora (los simulacros no cuentan).
 */
async function downtimeByService(db) {
  const services = await db.many('SELECT id, codigo, nombre, tipo, estado FROM servicios ORDER BY tipo DESC, codigo');
  const events = await db.many(
    `SELECT h.servicio_id, h.estado_nuevo, h.fecha
       FROM historial_recuperacion h LEFT JOIN incidentes i ON i.id = h.incidente_id
      WHERE h.servicio_id IS NOT NULL AND h.estado_nuevo IS NOT NULL AND (i.id IS NULL OR NOT i.es_simulacro)
      ORDER BY h.servicio_id, h.fecha, h.id`
  );
  const now = Date.now();
  const hours = new Map(services.map((s) => [s.id, 0]));
  let current = null;
  const close = (until) => {
    if (current && current.estado !== 'operativo') {
      hours.set(current.servicioId, hours.get(current.servicioId) + (until - current.desde) / 3_600_000);
    }
  };
  for (const e of events) {
    if (current && current.servicioId !== e.servicio_id) {
      close(now);
      current = null;
    }
    close(new Date(e.fecha).getTime());
    current = { servicioId: e.servicio_id, estado: e.estado_nuevo, desde: new Date(e.fecha).getTime() };
  }
  close(now);
  return services.map((s) => ({ codigo: s.codigo, nombre: s.nombre, tipo: s.tipo, horas: Math.round(hours.get(s.id) * 10) / 10 }));
}

const evidenceByCategory = (db) => db.many(
  `SELECT categoria, count(*) AS cantidad, sum(tamano_bytes) AS bytes
     FROM evidencias WHERE NOT anulada GROUP BY categoria ORDER BY cantidad DESC`
);

const securityEvents = (db) => db.many(
  `SELECT evento, count(*) AS cantidad FROM eventos_seguridad
    WHERE fecha >= now() - interval '30 days' GROUP BY evento ORDER BY cantidad DESC`
);

export async function getAnalytics(db, { includeSecurity = false } = {}) {
  return {
    generadoEn: new Date().toISOString(),
    resumen: await summary(db),
    porSeveridad: await bySeverity(db),
    porMes: await byMonth(db),
    tiemposEtapa: await stageTimes(db),
    decisiones: await decisions(db),
    accionesPorResponsable: await actionsByOwner(db),
    indisponibilidad: await downtimeByService(db),
    evidenciasPorCategoria: await evidenceByCategory(db),
    seguridad: includeSecurity ? await securityEvents(db) : null,
  };
}

/** Evita la inyección de fórmulas al abrir el CSV en Excel (OWASP CSV Injection). */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function incidentsCsv(db) {
  const rows = await db.many(
    `SELECT codigo, titulo, severidad, etapa, estado, responsable, servicios_afectados, acciones_abiertas,
            decisiones_tomadas, intentos_erradicacion, horas_transcurridas, es_simulacro
       FROM v_incidentes_resumen ORDER BY codigo`
  );
  const header = ['codigo', 'titulo', 'severidad', 'etapa', 'estado', 'responsable', 'servicios_afectados', 'acciones_abiertas',
    'decisiones_tomadas', 'intentos_erradicacion', 'horas_transcurridas', 'es_simulacro'];
  const lines = [header.join(';'), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(';'))];
  return `﻿${lines.join('\r\n')}\r\n`; // BOM: Excel reconoce los acentos
}
