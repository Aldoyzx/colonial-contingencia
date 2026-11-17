PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE,
  rol         TEXT    NOT NULL CHECK (rol IN ('coordinador','analista_ti','operador_ot','legal','comunicaciones')),
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

CREATE TABLE IF NOT EXISTS servicios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo         TEXT    NOT NULL UNIQUE,
  nombre         TEXT    NOT NULL,
  tipo           TEXT    NOT NULL CHECK (tipo IN ('TI','OT')),
  criticidad     INTEGER NOT NULL CHECK (criticidad BETWEEN 1 AND 5),
  estado         TEXT    NOT NULL DEFAULT 'operativo'
                         CHECK (estado IN ('operativo','afectado','en_recuperacion')),
  nota_estado    TEXT,
  descripcion    TEXT,
  actualizado_en TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidentes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                TEXT    NOT NULL UNIQUE,
  titulo                TEXT    NOT NULL,
  descripcion           TEXT    NOT NULL,
  severidad             TEXT    NOT NULL CHECK (severidad IN ('baja','media','alta','critica')),
  etapa                 TEXT    NOT NULL,
  estado                TEXT    NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  intentos_erradicacion INTEGER NOT NULL DEFAULT 0,
  lecciones_aprendidas  TEXT,
  responsable_id        INTEGER NOT NULL REFERENCES usuarios(id),
  creado_por            INTEGER NOT NULL REFERENCES usuarios(id),
  detectado_en          TEXT    NOT NULL DEFAULT (datetime('now')),
  cerrado_en            TEXT
);

CREATE TABLE IF NOT EXISTS incidente_servicios (
  incidente_id INTEGER NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  servicio_id  INTEGER NOT NULL REFERENCES servicios(id),
  PRIMARY KEY (incidente_id, servicio_id)
);

CREATE TABLE IF NOT EXISTS acciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  incidente_id   INTEGER NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  etapa          TEXT    NOT NULL,
  origen         TEXT    NOT NULL DEFAULT 'manual',
  descripcion    TEXT    NOT NULL,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  estado         TEXT    NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente','en_progreso','completada','fallida')),
  resultado      TEXT,
  creada_en      TEXT    NOT NULL DEFAULT (datetime('now')),
  actualizada_en TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decisiones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  incidente_id   INTEGER NOT NULL REFERENCES incidentes(id) ON DELETE CASCADE,
  codigo         TEXT    NOT NULL CHECK (codigo IN ('D1','D2','D3','D4')),
  pregunta       TEXT    NOT NULL,
  respuesta      INTEGER NOT NULL CHECK (respuesta IN (0,1)),
  justificacion  TEXT    NOT NULL,
  etapa_origen   TEXT    NOT NULL,
  etapa_destino  TEXT    NOT NULL,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  tomada_en      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS historial_recuperacion (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  incidente_id    INTEGER REFERENCES incidentes(id) ON DELETE CASCADE,
  servicio_id     INTEGER REFERENCES servicios(id),
  evento          TEXT    NOT NULL,
  estado_anterior TEXT,
  estado_nuevo    TEXT,
  detalle         TEXT,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  fecha           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_acciones_incidente   ON acciones(incidente_id);
CREATE INDEX IF NOT EXISTS idx_decisiones_incidente ON decisiones(incidente_id);
CREATE INDEX IF NOT EXISTS idx_historial_incidente  ON historial_recuperacion(incidente_id);
CREATE INDEX IF NOT EXISTS idx_historial_servicio   ON historial_recuperacion(servicio_id);
CREATE INDEX IF NOT EXISTS idx_incidentes_estado    ON incidentes(estado);
