/**
 * Limitador de ventana fija en memoria (por IP). Suficiente para una sola instancia;
 * con varias instancias se reemplaza por uno basado en Redis o en la base.
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    /** @returns {boolean} true si la petición está dentro del límite. */
    take(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        if (hits.size > 10_000) hits.clear(); // evita crecer sin límite ante un barrido de IPs
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    reset: () => hits.clear(),
  };
}
