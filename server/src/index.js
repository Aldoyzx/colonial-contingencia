import { config } from './config.js';
import { ensureDatabase } from './db/migrate.js';
import { createDb } from './db/pool.js';
import { createApp } from './http/app.js';

const db = createDb(config.databaseUrl, config.databaseSsl ? { ssl: { rejectUnauthorized: true } } : {});

try {
  const created = await ensureDatabase(db);
  if (created) console.log('Esquema creado y datos iniciales cargados.');
} catch (error) {
  console.error(`No se pudo conectar o preparar PostgreSQL (${error.message}).`);
  console.error('Revisa DATABASE_URL o levanta la base con: docker compose up -d');
  await db.close();
  process.exit(1);
}

const app = createApp(db, config);
const server = app.listen(config.port, () => {
  console.log(`API de contingencia escuchando en http://localhost:${config.port}`);
  console.log(`Almacenamiento de evidencias: ${config.storage}${config.mfaRequiredRoles.length ? ` · MFA obligatorio para: ${config.mfaRequiredRoles.join(', ')}` : ''}`);
});

function shutdown(signal) {
  console.log(`${signal} recibido, cerrando...`);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
