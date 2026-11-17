import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const port = Number.parseInt(process.env.PORT ?? '4000', 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`PORT inválido: ${process.env.PORT}`);
}

export const config = Object.freeze({
  port,
  dbPath: process.env.DB_PATH ?? join(ROOT, 'data', 'contingencia.db'),
});
