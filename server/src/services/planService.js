/**
 * Plan de contingencia tal como está registrado en la base: cada etapa con su
 * procedimiento, rol y persona responsable, decisión asociada y recursos tecnológicos.
 */
export async function getContingencyPlan(db) {
  const etapas = await db.many(
    `SELECT e.clave, e.nombre, e.orden, e.tipo, e.procedimiento, e.rol_responsable, e.siguiente, e.es_reintento,
            (SELECT u.nombre FROM usuarios u WHERE u.rol = e.rol_responsable AND u.activo ORDER BY u.id LIMIT 1) AS responsable_nombre,
            CASE WHEN dp.codigo IS NULL THEN NULL ELSE json_build_object(
              'codigo', dp.codigo, 'pregunta', dp.pregunta,
              'destinoSi', dp.destino_si, 'destinoNo', dp.destino_no,
              'accionSi', dp.accion_si, 'accionNo', dp.accion_no) END AS decision,
            COALESCE((SELECT json_agg(json_build_object('codigo', r.codigo, 'nombre', r.nombre, 'categoria', r.categoria) ORDER BY r.codigo)
                        FROM etapa_recursos er JOIN recursos_tecnologicos r ON r.id = er.recurso_id
                       WHERE er.etapa = e.clave), '[]'::json) AS recursos
       FROM etapas e
       LEFT JOIN decisiones_plan dp ON dp.etapa = e.clave
      WHERE e.tipo <> 'final'
      ORDER BY e.orden`
  );

  const recursos = await db.many(
    `SELECT r.codigo, r.nombre, r.categoria, r.descripcion,
            COALESCE(array_agg(e.nombre ORDER BY e.orden) FILTER (WHERE e.clave IS NOT NULL), '{}') AS etapas
       FROM recursos_tecnologicos r
       LEFT JOIN etapa_recursos er ON er.recurso_id = r.id
       LEFT JOIN etapas e ON e.clave = er.etapa
      GROUP BY r.id
      ORDER BY r.codigo`
  );

  return { etapas, recursos };
}
