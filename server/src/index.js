import { config } from './config.js';
import { createDatabase } from './db/connection.js';
import { createApp } from './http/app.js';

const db = createDatabase(config.dbPath);
const app = createApp(db);

const server = app.listen(config.port, () => {
  console.log(`API de contingencia escuchando en http://localhost:${config.port}`);
  console.log(`Base de datos: ${config.dbPath}`);
});

function shutdown(signal) {
  console.log(`${signal} recibido, cerrando...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
