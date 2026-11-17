import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const isProduction = env.NODE_ENV === 'production';

const port = Number.parseInt(env.PORT ?? '4000', 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`PORT inválido: ${env.PORT}`);
}

const databaseUrl = env.DATABASE_URL ?? 'postgres://contingencia:contingencia@localhost:5432/contingencia';
if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  throw new Error('DATABASE_URL debe tener el formato postgres://usuario:clave@host:puerto/base');
}

// APP_SECRET firma las sesiones y cifra los secretos de MFA. En producción es obligatorio
// y no debe cambiar: si cambia, se cierran las sesiones y los usuarios deben reconfigurar MFA.
if (isProduction && (!env.APP_SECRET || env.APP_SECRET.length < 32)) {
  throw new Error('En producción APP_SECRET es obligatorio y debe tener al menos 32 caracteres');
}
// En desarrollo, sin APP_SECRET se usa un secreto local persistente (server/data, fuera de git):
// si fuera aleatorio por arranque, cada reinicio invalidaría los secretos MFA ya cifrados.
function devSecret() {
  const file = join(SERVER_ROOT, 'data', 'dev-app-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = `dev-${randomBytes(24).toString('hex')}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
const appSecret = env.APP_SECRET ?? devSecret();

const storage = env.ALMACENAMIENTO ?? (isProduction ? 'postgres' : 'local');
if (!['local', 'postgres'].includes(storage)) {
  throw new Error('ALMACENAMIENTO debe ser "local" o "postgres"');
}

const list = (value) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

export const config = Object.freeze({
  port,
  isProduction,
  databaseUrl,
  databaseSsl: env.DB_SSL === 'require',
  appSecret,
  sessionHours: Number.parseInt(env.SESION_HORAS ?? '8', 10),
  /** Roles que no pueden operar sin MFA (lección del caso). Ej.: "coordinador,analista_ti". */
  mfaRequiredRoles: list(env.MFA_OBLIGATORIO_ROLES),
  /** Muestra las cuentas de demostración en la pantalla de acceso (solo para la sustentación). */
  showDemoAccounts: (env.MOSTRAR_CUENTAS_DEMO ?? (isProduction ? 'false' : 'true')) === 'true',
  storage,
  /** Si la base está vacía al arrancar, carga también los incidentes históricos de prueba (útil en la nube, sin consola). */
  loadDemoData: env.CARGAR_DATOS_DEMO === 'true',
  uploadsDir: env.UPLOADS_DIR ?? join(SERVER_ROOT, 'data', 'evidencias'),
  /** Intentos de inicio de sesión por minuto y por IP. */
  loginRateLimit: Number.parseInt(env.LIMITE_LOGIN_POR_MINUTO ?? '10', 10),
  maxUploadBytes: Number.parseInt(env.MAX_ARCHIVO_MB ?? '10', 10) * 1024 * 1024,
});
