import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ejecuta una carga asíncrona, expone recarga manual y opcionalmente sondeo periódico.
 * Ignora respuestas de peticiones obsoletas para evitar condiciones de carrera.
 */
export function useAsync(loader, deps, { pollMs = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await load();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!pollMs) return undefined;
    const timer = setInterval(reload, pollMs);
    return () => clearInterval(timer);
  }, [reload, pollMs]);

  return { data, error, loading, reload, setData };
}
