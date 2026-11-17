-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  06 · Migración de la entrega final: seguridad (credenciales, MFA, bitácora de
--       seguridad) y almacenamiento multimedia de evidencias
--  Gestor: PostgreSQL 16
--
--  Idempotente: el servidor la aplica en cada arranque sobre bases creadas con
--  versiones anteriores. Una base nueva ya la trae incluida en 01_esquema.sql.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Seguridad: credenciales, MFA (TOTP) y bloqueo por intentos fallidos
-- -----------------------------------------------------------------------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS clave_hash          VARCHAR(200);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_activo          BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_secreto_cifrado VARCHAR(300);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos   SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta     TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso       TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_usuarios_mfa') THEN
    ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_mfa CHECK (NOT mfa_activo OR mfa_secreto_cifrado IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_usuarios_intentos') THEN
    ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_intentos CHECK (intentos_fallidos >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_evento_seguridad') THEN
    CREATE TYPE tipo_evento_seguridad AS ENUM (
      'login_exitoso', 'login_fallido', 'cuenta_bloqueada', 'mfa_fallido', 'mfa_activado',
      'mfa_desactivado', 'cierre_sesion', 'cambio_clave', 'acceso_denegado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'categoria_evidencia') THEN
    CREATE TYPE categoria_evidencia AS ENUM ('imagen', 'documento', 'video', 'audio', 'registro');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS eventos_seguridad (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id       INTEGER REFERENCES usuarios (id),
  email_intentado  VARCHAR(120),
  evento           tipo_evento_seguridad NOT NULL,
  ip               VARCHAR(45),
  agente           VARCHAR(300),
  detalle          VARCHAR(500),
  fecha            TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE eventos_seguridad IS 'Bitácora de seguridad: accesos, fallos, bloqueos y cambios de credenciales (solo inserción)';
CREATE INDEX IF NOT EXISTS idx_eventos_seguridad_fecha   ON eventos_seguridad (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_seguridad_usuario ON eventos_seguridad (usuario_id);

DROP TRIGGER IF EXISTS trg_eventos_seguridad_inmutable ON eventos_seguridad;
CREATE TRIGGER trg_eventos_seguridad_inmutable
  BEFORE UPDATE OR DELETE ON eventos_seguridad
  FOR EACH ROW EXECUTE FUNCTION fn_historial_inmutable();

-- -----------------------------------------------------------------------------
-- Almacenamiento multimedia: evidencias del incidente (cadena de custodia)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidencias (
  id                     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incidente_id           INTEGER             NOT NULL REFERENCES incidentes (id) ON DELETE RESTRICT,
  accion_id              INTEGER             REFERENCES acciones (id) ON DELETE RESTRICT,
  etapa                  VARCHAR(30)         NOT NULL REFERENCES etapas (clave),
  nombre_original        VARCHAR(255)        NOT NULL,
  tipo_mime              VARCHAR(100)        NOT NULL,
  categoria              categoria_evidencia NOT NULL,
  tamano_bytes           INTEGER             NOT NULL,
  sha256                 CHAR(64)            NOT NULL,
  almacenamiento         VARCHAR(20)         NOT NULL,
  clave_almacenamiento   VARCHAR(300)        NOT NULL,
  descripcion            VARCHAR(500),
  subido_por             INTEGER             NOT NULL REFERENCES usuarios (id),
  subido_en              TIMESTAMPTZ         NOT NULL DEFAULT now(),
  anulada                BOOLEAN             NOT NULL DEFAULT FALSE,
  anulada_por            INTEGER             REFERENCES usuarios (id),
  anulada_en             TIMESTAMPTZ,
  motivo_anulacion       VARCHAR(300),
  CONSTRAINT ck_evidencias_tamano     CHECK (tamano_bytes BETWEEN 1 AND 15728640),
  CONSTRAINT ck_evidencias_sha256     CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_evidencias_almacen    CHECK (almacenamiento IN ('local', 'postgres')),
  CONSTRAINT ck_evidencias_anulacion  CHECK (anulada = (anulada_por IS NOT NULL AND anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL))
);
COMMENT ON TABLE evidencias IS 'Archivos multimedia del incidente; nunca se borran: se anulan con motivo';
-- El mismo archivo (misma huella) no se registra dos veces en un incidente, salvo que el anterior esté anulado.
CREATE UNIQUE INDEX IF NOT EXISTS ux_evidencias_huella ON evidencias (incidente_id, sha256) WHERE NOT anulada;
CREATE INDEX IF NOT EXISTS idx_evidencias_incidente ON evidencias (incidente_id, subido_en DESC);
CREATE INDEX IF NOT EXISTS idx_evidencias_categoria ON evidencias (categoria);

-- Contenido binario cuando el almacenamiento configurado es PostgreSQL (nube sin disco persistente).
CREATE TABLE IF NOT EXISTS evidencia_contenidos (
  evidencia_id  INTEGER PRIMARY KEY REFERENCES evidencias (id) ON DELETE CASCADE,
  contenido     BYTEA   NOT NULL
);

-- -----------------------------------------------------------------------------
-- Vista de analítica: tiempo que cada incidente pasó en cada etapa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_tiempos_etapa AS
WITH entradas AS (
  SELECT i.id AS incidente_id, i.es_simulacro, i.detectado_en AS desde, 'deteccion'::VARCHAR AS etapa
    FROM incidentes i
  UNION ALL
  SELECT h.incidente_id, i.es_simulacro, h.fecha, h.estado_nuevo
    FROM historial_recuperacion h JOIN incidentes i ON i.id = h.incidente_id
   WHERE h.evento IN ('cambio_etapa', 'incidente_cerrado')
), tramos AS (
  SELECT incidente_id, es_simulacro, etapa, desde,
         lead(desde) OVER (PARTITION BY incidente_id ORDER BY desde, etapa = 'finalizado') AS hasta
    FROM entradas
)
SELECT t.incidente_id, t.es_simulacro, t.etapa, e.nombre AS etapa_nombre, e.orden,
       round(extract(EPOCH FROM (t.hasta - t.desde)) / 3600.0, 2) AS horas
  FROM tramos t JOIN etapas e ON e.clave = t.etapa
 WHERE t.hasta IS NOT NULL AND t.etapa <> 'finalizado';

COMMIT;
