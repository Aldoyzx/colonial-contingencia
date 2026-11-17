import pg from 'pg';

const { Pool, types } = pg;

// COUNT(*) devuelve BIGINT; en este dominio nunca supera Number.MAX_SAFE_INTEGER.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
// NUMERIC (orden de etapas, porcentajes) como número de JavaScript.
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value));

/**
 * Envuelve un Pool o un PoolClient con atajos que devuelven filas directamente.
 * Todas las consultas usan parámetros ($1, $2…): nunca se concatenan valores en el SQL.
 */
function createExecutor(queryable) {
  const query = (text, params = []) => queryable.query(text, params);
  const executor = {
    query,
    /** Todas las filas. */
    many: async (text, params) => (await query(text, params)).rows,
    /** Primera fila o null. */
    one: async (text, params) => (await query(text, params)).rows[0] ?? null,
    /** Número de filas afectadas. */
    run: async (text, params) => (await query(text, params)).rowCount,
  };
  return executor;
}

/**
 * @typedef {ReturnType<typeof createExecutor> & { tx: Function }} Db
 * `tx(fn)` ejecuta fn dentro de una transacción; si fn lanza un error, se hace ROLLBACK.
 * Dentro de una transacción, `tx` reutiliza la misma conexión (no anida BEGIN).
 */
export function createDb(connectionString, poolOptions = {}) {
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, ...poolOptions });

  const base = createExecutor(pool);

  async function tx(fn) {
    const client = await pool.connect();
    const inner = createExecutor(client);
    inner.tx = (nestedFn) => nestedFn(inner);
    try {
      await client.query('BEGIN');
      const result = await fn(inner);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return { ...base, tx, close: () => pool.end(), pool };
}
