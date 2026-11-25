import { useCallback, useEffect, useState } from 'react';

type Status = 'loading' | 'ready' | 'error';

/** A list loaded from the API once, plus local add and replace after a successful save. */
export function useCollection<T extends { id: number }>(fetchAll: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setItems(await fetchAll());
      setStatus('ready');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }, [fetchAll]);

  useEffect(() => {
    let alive = true;
    fetchAll().then(
      (list) => { if (alive) { setItems(list); setStatus('ready'); } },
      (e: Error) => { if (alive) { setError(e.message); setStatus('error'); } },
    );
    return () => { alive = false; };
  }, [fetchAll]);

  const add = useCallback((item: T) => setItems((list) => [...list, item]), []);
  const replace = useCallback((item: T) => setItems((list) => list.map((x) => (x.id === item.id ? item : x))), []);

  return { items, status, error, load, add, replace };
}
