-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  05 · Migración de correcciones (revisión de la Actividad 2)
--  Gestor: PostgreSQL 16
--
--  Lleva una base creada con la versión de la Actividad 1 al esquema actual sin perder
--  datos. Es idempotente; el servidor la aplica sola en cada arranque.
--  Una base nueva no la necesita: 01_esquema.sql ya incluye estos cambios.
--     psql -U contingencia -d contingencia -f database/05_migracion_actividad2.sql
-- =============================================================================

BEGIN;

-- H3 · Código de incidente con secuencia (MAX(id)+1 duplicaba códigos con altas simultáneas)
CREATE SEQUENCE IF NOT EXISTS incidente_numero_seq;
-- Solo la primera vez (secuencia sin usar): continúa desde el mayor id existente.
SELECT setval('incidente_numero_seq', (SELECT max(id) FROM incidentes))
 WHERE (SELECT NOT is_called FROM incidente_numero_seq)
   AND EXISTS (SELECT 1 FROM incidentes);

-- H7 · Marca de simulacro para ensayar el plan sin confundirlo con un incidente real
ALTER TABLE incidentes ADD COLUMN IF NOT EXISTS es_simulacro BOOLEAN NOT NULL DEFAULT FALSE;

-- H2 · Bitácora de auditoría de solo inserción
CREATE OR REPLACE FUNCTION fn_historial_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'historial_recuperacion es de solo inserción: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

DROP TRIGGER IF EXISTS trg_historial_inmutable ON historial_recuperacion;
CREATE TRIGGER trg_historial_inmutable
  BEFORE UPDATE OR DELETE ON historial_recuperacion
  FOR EACH ROW EXECUTE FUNCTION fn_historial_inmutable();

-- H1 · La bitácora se consulta por fecha: el índice incluye la columna de orden
DROP INDEX IF EXISTS idx_historial_incidente;
CREATE INDEX idx_historial_incidente ON historial_recuperacion (incidente_id, fecha DESC);

-- La vista de resumen expone la marca de simulacro (columna nueva al final)
CREATE OR REPLACE VIEW v_incidentes_resumen AS
SELECT i.codigo,
       i.titulo,
       i.severidad,
       e.nombre AS etapa,
       i.estado,
       u.nombre AS responsable,
       (SELECT count(*) FROM incidente_servicios s WHERE s.incidente_id = i.id) AS servicios_afectados,
       (SELECT count(*) FROM acciones a WHERE a.incidente_id = i.id AND a.estado IN ('pendiente', 'en_progreso')) AS acciones_abiertas,
       (SELECT count(*) FROM decisiones d WHERE d.incidente_id = i.id) AS decisiones_tomadas,
       i.intentos_erradicacion,
       round(extract(EPOCH FROM (coalesce(i.cerrado_en, now()) - i.detectado_en)) / 3600, 1) AS horas_transcurridas,
       i.es_simulacro
  FROM incidentes i
  JOIN etapas e   ON e.clave = i.etapa
  JOIN usuarios u ON u.id = i.responsable_id;

COMMIT;
