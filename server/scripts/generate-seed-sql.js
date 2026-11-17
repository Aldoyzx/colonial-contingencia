/**
 * Genera database/02_datos_iniciales.sql a partir de las mismas constantes que usa
 * el servidor (flow.js, resources.js y seedData.js), para que el script SQL y el
 * código nunca se desincronicen.   Uso: npm run db:generate-seed
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { DATABASE_DIR } from '../src/db/files.js';
import { DECISIONS, STAGES } from '../src/domain/flow.js';
import { RESOURCES } from '../src/domain/resources.js';
import { DEMO_PASSWORD, SERVICES, USERS } from '../src/db/seedData.js';
import { hashPassword } from '../src/security/password.js';

const literal = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
};

const valuesBlock = (rows) => rows.map((row) => `  (${row.map(literal).join(', ')})`).join(',\n');

// Sal derivada del correo: el archivo generado es reproducible (CI compara que no cambie).
// Solo se usa para las cuentas de demostración; las contraseñas nuevas usan sal aleatoria.
const demoSalt = (email) => createHash('sha256').update(`demo-salt:${email}`).digest().subarray(0, 16);
const userRows = await Promise.all(USERS.map(async (u) => [u.nombre, u.email, u.rol, await hashPassword(DEMO_PASSWORD, demoSalt(u.email))]));

const stageRows = Object.entries(STAGES).map(([clave, s]) => [
  clave, s.nombre, s.orden, s.tipo, s.procedimiento ?? null, s.rolResponsable ?? null, s.siguiente ?? null, Boolean(s.esReintento),
]);

const decisionRows = Object.entries(DECISIONS).map(([codigo, d]) => [
  codigo, d.etapa, d.pregunta, d.si.destino, d.no.destino, d.si.accion?.descripcion ?? null, d.no.accion?.descripcion ?? null,
]);

const stageResourceRows = Object.entries(STAGES).flatMap(([clave, s]) =>
  (s.recursos ?? []).map((codigo) => `  (${literal(clave)}, ${literal(codigo)})`)
);

const sql = `-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  02 · Datos iniciales: catálogo del plan, recursos, usuarios y servicios
--  Gestor: PostgreSQL 16 · ARCHIVO GENERADO por server/scripts/generate-seed-sql.js
--
--  Es idempotente: puede ejecutarse varias veces sin duplicar registros.
--  psql -U contingencia -d contingencia -f database/02_datos_iniciales.sql
-- =============================================================================

BEGIN;

-- Etapas del plan (nodos del diagrama de flujo)
INSERT INTO etapas (clave, nombre, orden, tipo, procedimiento, rol_responsable, siguiente, es_reintento) VALUES
${valuesBlock(stageRows)}
ON CONFLICT (clave) DO UPDATE SET
  nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, tipo = EXCLUDED.tipo,
  procedimiento = EXCLUDED.procedimiento, rol_responsable = EXCLUDED.rol_responsable,
  siguiente = EXCLUDED.siguiente, es_reintento = EXCLUDED.es_reintento;

-- Decisiones D1–D4 (rombos del diagrama)
INSERT INTO decisiones_plan (codigo, etapa, pregunta, destino_si, destino_no, accion_si, accion_no) VALUES
${valuesBlock(decisionRows)}
ON CONFLICT (codigo) DO UPDATE SET
  etapa = EXCLUDED.etapa, pregunta = EXCLUDED.pregunta,
  destino_si = EXCLUDED.destino_si, destino_no = EXCLUDED.destino_no,
  accion_si = EXCLUDED.accion_si, accion_no = EXCLUDED.accion_no;

-- Recursos tecnológicos del plan
INSERT INTO recursos_tecnologicos (codigo, nombre, categoria, descripcion) VALUES
${valuesBlock(RESOURCES.map((r) => [r.codigo, r.nombre, r.categoria, r.descripcion]))}
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria, descripcion = EXCLUDED.descripcion;

-- Recursos por etapa (N:M)
INSERT INTO etapa_recursos (etapa, recurso_id)
SELECT v.etapa, r.id
  FROM (VALUES
${stageResourceRows.join(',\n')}
  ) AS v (etapa, codigo)
  JOIN recursos_tecnologicos r ON r.codigo = v.codigo
ON CONFLICT DO NOTHING;

-- Usuarios (actores del plan). Contraseña inicial de demostración: ver server/src/db/seedData.js.
-- Si la cuenta ya existe, solo completa la contraseña cuando aún no tiene una.
INSERT INTO usuarios (nombre, email, rol, clave_hash) VALUES
${valuesBlock(userRows)}
ON CONFLICT (email) DO UPDATE SET clave_hash = COALESCE(usuarios.clave_hash, EXCLUDED.clave_hash);

-- Servicios TI / OT del oleoducto
INSERT INTO servicios (codigo, nombre, tipo, criticidad, descripcion) VALUES
${valuesBlock(SERVICES.map((s) => [s.codigo, s.nombre, s.tipo, s.criticidad, s.descripcion]))}
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
`;

const target = `${DATABASE_DIR}/02_datos_iniciales.sql`;
writeFileSync(target, sql);
console.log(`Generado ${target}`);
