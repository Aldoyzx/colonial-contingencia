import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Estrategia de almacenamiento de archivos (patrón Strategy). Ambos drivers exponen:
 *   save(db, { evidenceId, buffer, ext }) → clave   ·   read(db, evidence) → Buffer   ·   discard(clave)
 * - local:    disco del servidor (desarrollo o servidores con volumen persistente).
 * - postgres: columna BYTEA (nubes sin disco persistente, como el plan gratuito de Render);
 *             el archivo y su registro se guardan en la misma transacción.
 * Agregar S3 / Cloudflare R2 solo requiere un tercer driver con la misma interfaz.
 */
function localDriver(baseDir) {
  const root = resolve(baseDir);

  const safePath = (key) => {
    const full = resolve(root, key);
    if (!full.startsWith(root + sep)) throw new Error('Ruta de almacenamiento fuera del directorio permitido');
    return full;
  };

  return {
    name: 'local',
    async save(_db, { buffer, ext }) {
      const now = new Date();
      const key = join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${randomUUID()}${ext}`);
      const full = safePath(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, buffer, { flag: 'wx' });
      return relative(root, full).split(sep).join('/');
    },
    read: (_db, evidence) => readFile(safePath(evidence.clave_almacenamiento)),
    discard: (key) => rm(safePath(key), { force: true }),
  };
}

function postgresDriver() {
  return {
    name: 'postgres',
    async save(db, { evidenceId, buffer }) {
      await db.run('INSERT INTO evidencia_contenidos (evidencia_id, contenido) VALUES ($1, $2)', [evidenceId, buffer]);
      return `db:${evidenceId}`;
    },
    async read(db, evidence) {
      const row = await db.one('SELECT contenido FROM evidencia_contenidos WHERE evidencia_id = $1', [evidence.id]);
      if (!row) throw new Error(`Contenido de la evidencia ${evidence.id} no encontrado`);
      return row.contenido;
    },
    discard: async () => {}, // el ROLLBACK de la transacción ya lo descarta
  };
}

/**
 * `active` guarda los archivos nuevos; `forEvidence` lee cada archivo con el driver con que
 * se guardó, así se puede cambiar de driver sin migrar los archivos existentes.
 */
export function createStorage({ storage, uploadsDir }) {
  const drivers = { local: localDriver(uploadsDir), postgres: postgresDriver() };
  return {
    active: drivers[storage],
    forEvidence: (evidence) => drivers[evidence.almacenamiento],
  };
}
