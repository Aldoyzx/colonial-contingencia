import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDatabase } from './seed.js';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/**
 * Abre (o crea) la base de datos, aplica el esquema y carga datos iniciales.
 * @param {string} filename Ruta del archivo SQLite o ':memory:' para pruebas.
 */
export function createDatabase(filename) {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  seedDatabase(db);
  return db;
}
