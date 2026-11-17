-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  03 · Verificación de la estructura creada (solo lectura)
--  psql -U contingencia -d contingencia -f database/03_verificacion.sql
-- =============================================================================

\echo '== 1. Tablas y número de filas =='
SELECT relname AS tabla, n_live_tup AS filas_aprox
  FROM pg_stat_user_tables
 ORDER BY relname;

\echo '== 2. Claves primarias, foráneas, únicas y CHECK por tabla =='
SELECT tc.table_name      AS tabla,
       tc.constraint_type AS tipo,
       tc.constraint_name AS restriccion
  FROM information_schema.table_constraints tc
 WHERE tc.table_schema = 'public'
   AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
   AND tc.constraint_name NOT LIKE '%_not_null'
 ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

\echo '== 3. Relaciones (FK → tabla referenciada) =='
SELECT conrelid::regclass  AS tabla,
       conname             AS fk,
       confrelid::regclass AS referencia,
       CASE confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END AS al_borrar
  FROM pg_constraint
 WHERE contype = 'f' AND connamespace = 'public'::regnamespace
 ORDER BY 1, 2;

\echo '== 4. Tipos ENUM y sus valores =='
SELECT t.typname AS tipo, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS valores
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
 GROUP BY t.typname ORDER BY t.typname;

\echo '== 5. Índices =='
SELECT tablename AS tabla, indexname AS indice FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2;

\echo '== 6. Datos iniciales cargados =='
SELECT 'etapas' AS tabla, count(*) FROM etapas
UNION ALL SELECT 'decisiones_plan', count(*) FROM decisiones_plan
UNION ALL SELECT 'recursos_tecnologicos', count(*) FROM recursos_tecnologicos
UNION ALL SELECT 'etapa_recursos', count(*) FROM etapa_recursos
UNION ALL SELECT 'usuarios', count(*) FROM usuarios
UNION ALL SELECT 'servicios', count(*) FROM servicios
UNION ALL SELECT 'incidentes', count(*) FROM incidentes;

\echo '== 7. Vistas de reporte =='
SELECT * FROM v_resumen_servicios;
SELECT codigo, severidad, etapa, estado, servicios_afectados, decisiones_tomadas, horas_transcurridas FROM v_incidentes_resumen;
SELECT orden, etapa, rol_responsable, decision FROM v_plan_contingencia;

\echo '== 8. Prueba de restricción (debe fallar con violación de CHECK) =='
\set ON_ERROR_STOP off
INSERT INTO servicios (codigo, nombre, tipo, criticidad) VALUES ('OT-PRUEBA', 'Criticidad inválida', 'OT', 9);
\set ON_ERROR_STOP on
