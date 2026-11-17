import { config } from '../config.js';
import { resetDatabase } from './migrate.js';
import { createDb } from './pool.js';

const withDemoData = process.argv.includes('--demo');
const db = createDb(config.databaseUrl);

try {
  await resetDatabase(db, { withDemoData });
  console.log(`Base de datos reiniciada${withDemoData ? ' con datos de prueba' : ''}.`);
} catch (error) {
  console.error(`No se pudo reiniciar la base de datos: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
