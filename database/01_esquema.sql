-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  01 · Esquema relacional (tipos, tablas, restricciones, índices y vistas)
--  Gestor: PostgreSQL 16
--
--  psql -U contingencia -d contingencia -f database/01_esquema.sql
--  El servidor Node ejecuta este mismo archivo si la base está vacía.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Dominios de valores (ENUM). El motor rechaza cualquier valor fuera de la lista.
-- -----------------------------------------------------------------------------
CREATE TYPE rol_usuario         AS ENUM ('coordinador', 'analista_ti', 'operador_ot', 'legal', 'comunicaciones');
CREATE TYPE tipo_servicio       AS ENUM ('TI', 'OT');
CREATE TYPE estado_servicio     AS ENUM ('operativo', 'afectado', 'en_recuperacion');
CREATE TYPE severidad_incidente AS ENUM ('baja', 'media', 'alta', 'critica');   -- ordenado: baja < critica
CREATE TYPE estado_incidente    AS ENUM ('abierto', 'cerrado');
CREATE TYPE estado_accion       AS ENUM ('pendiente', 'en_progreso', 'completada', 'fallida');
CREATE TYPE tipo_etapa          AS ENUM ('accion', 'decision', 'final');
CREATE TYPE categoria_recurso   AS ENUM ('herramienta', 'infraestructura', 'servicio_externo', 'documento');

-- -----------------------------------------------------------------------------
-- 2. Catálogo del plan de contingencia (nodos y rombos del diagrama de flujo)
-- -----------------------------------------------------------------------------
CREATE TABLE etapas (
  clave            VARCHAR(30)  PRIMARY KEY,
  nombre           VARCHAR(60)  NOT NULL,
  orden            NUMERIC(3,1) NOT NULL UNIQUE,
  tipo             tipo_etapa   NOT NULL,
  procedimiento    TEXT,
  rol_responsable  rol_usuario,
  siguiente        VARCHAR(30)  REFERENCES etapas (clave) DEFERRABLE INITIALLY DEFERRED,
  es_reintento     BOOLEAN      NOT NULL DEFAULT FALSE,
  CONSTRAINT ck_etapas_clave     CHECK (clave ~ '^[a-z_]+$'),
  CONSTRAINT ck_etapas_final     CHECK (tipo <> 'final' OR siguiente IS NULL),
  CONSTRAINT ck_etapas_operativa CHECK (tipo = 'final' OR (procedimiento IS NOT NULL AND rol_responsable IS NOT NULL))
);
COMMENT ON TABLE etapas IS 'Etapas del plan (Detección → Cierre). Fuente: server/src/domain/flow.js';

CREATE TABLE decisiones_plan (
  codigo       CHAR(2)      PRIMARY KEY,
  etapa        VARCHAR(30)  NOT NULL UNIQUE REFERENCES etapas (clave),
  pregunta     VARCHAR(200) NOT NULL,
  destino_si   VARCHAR(30)  NOT NULL REFERENCES etapas (clave),
  destino_no   VARCHAR(30)  NOT NULL REFERENCES etapas (clave),
  accion_si    TEXT,
  accion_no    TEXT,
  CONSTRAINT ck_decisiones_plan_codigo CHECK (codigo ~ '^D[1-9]$')
);
COMMENT ON TABLE decisiones_plan IS 'Rombos D1–D4 del diagrama con sus ramas Sí / No';

CREATE TABLE recursos_tecnologicos (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo       VARCHAR(10)       NOT NULL UNIQUE,
  nombre       VARCHAR(120)      NOT NULL,
  categoria    categoria_recurso NOT NULL,
  descripcion  TEXT              NOT NULL,
  CONSTRAINT ck_recursos_codigo CHECK (codigo ~ '^R[0-9]{2}$')
);

CREATE TABLE etapa_recursos (
  etapa       VARCHAR(30) NOT NULL REFERENCES etapas (clave) ON DELETE CASCADE,
  recurso_id  INTEGER     NOT NULL REFERENCES recursos_tecnologicos (id) ON DELETE CASCADE,
  PRIMARY KEY (etapa, recurso_id)
);
COMMENT ON TABLE etapa_recursos IS 'Recursos tecnológicos que necesita cada etapa (N:M)';

-- -----------------------------------------------------------------------------
-- 3. Actores y activos
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL,
  email      VARCHAR(120) NOT NULL UNIQUE,
  rol        rol_usuario  NOT NULL,
  activo     BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_usuarios_email CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE TABLE servicios (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          VARCHAR(12)     NOT NULL UNIQUE,
  nombre          VARCHAR(100)    NOT NULL,
  tipo            tipo_servicio   NOT NULL,
  criticidad      SMALLINT        NOT NULL,
  estado          estado_servicio NOT NULL DEFAULT 'operativo',
  nota_estado     VARCHAR(300),
  descripcion     TEXT,
  actualizado_en  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT ck_servicios_criticidad CHECK (criticidad BETWEEN 1 AND 5),
  CONSTRAINT ck_servicios_codigo     CHECK (codigo ~ '^(TI|OT)-[A-Z0-9]+$' AND left(codigo, 2) = tipo::TEXT)
);
COMMENT ON COLUMN servicios.codigo IS 'Prefijo TI- u OT- obligatorio y coherente con el tipo';

-- -----------------------------------------------------------------------------
-- 4. Gestión del incidente
-- -----------------------------------------------------------------------------
-- Número correlativo del código INC-AAAA-NNNN; una secuencia es segura ante altas concurrentes.
CREATE SEQUENCE incidente_numero_seq;

CREATE TABLE incidentes (
  id                     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo                 VARCHAR(20)         NOT NULL UNIQUE,
  titulo                 VARCHAR(120)        NOT NULL,
  descripcion            TEXT                NOT NULL,
  severidad              severidad_incidente NOT NULL,
  etapa                  VARCHAR(30)         NOT NULL REFERENCES etapas (clave),
  estado                 estado_incidente    NOT NULL DEFAULT 'abierto',
  intentos_erradicacion  SMALLINT            NOT NULL DEFAULT 0,
  es_simulacro           BOOLEAN             NOT NULL DEFAULT FALSE,
  lecciones_aprendidas   TEXT,
  responsable_id         INTEGER             NOT NULL REFERENCES usuarios (id),
  creado_por             INTEGER             NOT NULL REFERENCES usuarios (id),
  detectado_en           TIMESTAMPTZ         NOT NULL DEFAULT now(),
  cerrado_en             TIMESTAMPTZ,
  CONSTRAINT ck_incidentes_codigo    CHECK (codigo ~ '^INC-[0-9]{4}-[0-9]{4,}$'),
  CONSTRAINT ck_incidentes_titulo    CHECK (char_length(btrim(titulo)) >= 5),
  CONSTRAINT ck_incidentes_intentos  CHECK (intentos_erradicacion >= 0),
  CONSTRAINT ck_incidentes_cierre    CHECK ((estado = 'cerrado') = (cerrado_en IS NOT NULL)
                                        AND (estado = 'cerrado') = (etapa = 'finalizado')),
  CONSTRAINT ck_incidentes_lecciones CHECK (estado = 'abierto' OR char_length(btrim(lecciones_aprendidas)) >= 20),
  CONSTRAINT ck_incidentes_fechas    CHECK (cerrado_en IS NULL OR cerrado_en >= detectado_en)
);

CREATE TABLE incidente_servicios (
  incidente_id  INTEGER     NOT NULL REFERENCES incidentes (id) ON DELETE CASCADE,
  servicio_id   INTEGER     NOT NULL REFERENCES servicios (id)  ON DELETE RESTRICT,
  vinculado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (incidente_id, servicio_id)
);
COMMENT ON TABLE incidente_servicios IS 'Servicios afectados por cada incidente (N:M)';

CREATE TABLE acciones (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incidente_id    INTEGER       NOT NULL REFERENCES incidentes (id) ON DELETE CASCADE,
  etapa           VARCHAR(30)   NOT NULL REFERENCES etapas (clave),
  origen          VARCHAR(40)   NOT NULL DEFAULT 'manual',
  descripcion     VARCHAR(500)  NOT NULL,
  responsable_id  INTEGER       NOT NULL REFERENCES usuarios (id),
  estado          estado_accion NOT NULL DEFAULT 'pendiente',
  resultado       VARCHAR(1000),
  creada_en       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  actualizada_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_acciones_origen  CHECK (origen ~ '^(manual|entrada:[a-z_]+|D[1-9]:(si|no))$'),
  CONSTRAINT ck_acciones_fallida CHECK (estado <> 'fallida' OR char_length(btrim(resultado)) > 0)
);
COMMENT ON COLUMN acciones.origen IS 'Nodo del flujo que generó la acción: manual, entrada:<etapa> o Dn:si|no';

CREATE TABLE decisiones (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incidente_id   INTEGER      NOT NULL REFERENCES incidentes (id) ON DELETE CASCADE,
  codigo         CHAR(2)      NOT NULL REFERENCES decisiones_plan (codigo),
  pregunta       VARCHAR(200) NOT NULL,
  respuesta      BOOLEAN      NOT NULL,
  justificacion  VARCHAR(1000) NOT NULL,
  etapa_origen   VARCHAR(30)  NOT NULL REFERENCES etapas (clave),
  etapa_destino  VARCHAR(30)  NOT NULL REFERENCES etapas (clave),
  usuario_id     INTEGER      NOT NULL REFERENCES usuarios (id),
  tomada_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_decisiones_justificacion CHECK (char_length(btrim(justificacion)) >= 5)
);
-- D3 puede repetirse (ruta Reintentar); D1, D2 y D4 se toman una sola vez por incidente.
CREATE UNIQUE INDEX ux_decisiones_unicas ON decisiones (incidente_id, codigo) WHERE codigo <> 'D3';

CREATE TABLE historial_recuperacion (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incidente_id     INTEGER     REFERENCES incidentes (id) ON DELETE CASCADE,
  servicio_id      INTEGER     REFERENCES servicios (id),
  evento           VARCHAR(40) NOT NULL,
  estado_anterior  VARCHAR(30),
  estado_nuevo     VARCHAR(30),
  detalle          TEXT,
  usuario_id       INTEGER     NOT NULL REFERENCES usuarios (id),
  fecha            TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE historial_recuperacion IS 'Bitácora de auditoría: quién hizo qué y cuándo (solo inserción)';

-- La bitácora es inmutable: ni la aplicación ni un usuario con acceso a la base pueden alterarla.
CREATE FUNCTION fn_historial_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'historial_recuperacion es de solo inserción: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER trg_historial_inmutable
  BEFORE UPDATE OR DELETE ON historial_recuperacion
  FOR EACH ROW EXECUTE FUNCTION fn_historial_inmutable();

-- -----------------------------------------------------------------------------
-- 5. Índices sobre las claves foráneas y filtros más consultados
-- -----------------------------------------------------------------------------
CREATE INDEX idx_incidentes_estado      ON incidentes (estado);
CREATE INDEX idx_incidentes_responsable ON incidentes (responsable_id);
CREATE INDEX idx_inc_servicios_servicio ON incidente_servicios (servicio_id);
CREATE INDEX idx_acciones_incidente     ON acciones (incidente_id, etapa);
CREATE INDEX idx_acciones_responsable   ON acciones (responsable_id);
CREATE INDEX idx_decisiones_incidente   ON decisiones (incidente_id);
CREATE INDEX idx_historial_incidente    ON historial_recuperacion (incidente_id, fecha DESC);
CREATE INDEX idx_historial_servicio     ON historial_recuperacion (servicio_id);
CREATE INDEX idx_etapa_recursos_recurso ON etapa_recursos (recurso_id);

-- -----------------------------------------------------------------------------
-- 6. Vistas para reportes y verificación
-- -----------------------------------------------------------------------------
CREATE VIEW v_resumen_servicios AS
SELECT tipo,
       count(*) FILTER (WHERE estado = 'operativo')       AS operativos,
       count(*) FILTER (WHERE estado = 'afectado')        AS afectados,
       count(*) FILTER (WHERE estado = 'en_recuperacion') AS en_recuperacion,
       round(100.0 * count(*) FILTER (WHERE estado = 'operativo') / count(*), 1) AS disponibilidad_pct
  FROM servicios
 GROUP BY tipo;

CREATE VIEW v_incidentes_resumen AS
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

CREATE VIEW v_plan_contingencia AS
SELECT e.orden,
       e.nombre                AS etapa,
       e.tipo,
       e.rol_responsable,
       e.procedimiento,
       dp.codigo               AS decision,
       dp.pregunta,
       string_agg(r.codigo || ' ' || r.nombre, '; ' ORDER BY r.codigo) AS recursos
  FROM etapas e
  LEFT JOIN decisiones_plan dp      ON dp.etapa = e.clave
  LEFT JOIN etapa_recursos er       ON er.etapa = e.clave
  LEFT JOIN recursos_tecnologicos r ON r.id = er.recurso_id
 WHERE e.tipo <> 'final'
 GROUP BY e.clave, dp.codigo
 ORDER BY e.orden;

COMMIT;
