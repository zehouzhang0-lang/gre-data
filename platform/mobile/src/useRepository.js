import { useCallback, useEffect, useRef, useState } from 'react';
import { openRepository } from './data/repository.mjs';

export default function useRepository() {
  const repository = useRef(null), alive = useRef(true);
  const [state, setState] = useState(null), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!repository.current) return null;
    const next = await repository.current.getState();
    if (alive.current) setState(next);
    return next;
  }, []);
  useEffect(() => {
    alive.current = true;
    openRepository().then(async repo => { repository.current = repo; await refresh(); }).catch(e => { if (alive.current) setError(e.message); });
    const visible = () => { if (document.visibilityState === 'visible') refresh().catch(e => setError(e.message)); };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh().catch(e => setError(e.message)); }, 60_000);
    document.addEventListener('visibilitychange', visible);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  return { state, repo: repository.current, refresh, error };
}
