import { rmSync } from 'node:fs';
import { config } from '../config.js';
import { createDatabase } from './connection.js';

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${config.dbPath}${suffix}`, { force: true });
}

createDatabase(config.dbPath).close();
console.log(`Base de datos reiniciada en ${config.dbPath}`);
