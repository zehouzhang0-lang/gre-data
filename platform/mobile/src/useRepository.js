import { useCallback, useEffect, useRef, useState } from 'react';
import { openRepository } from './data/repository.mjs';

export const STARTUP_SLOW_MS = 15_000;

// A slow read is not a failed read. Keep observing the original operation so a
// late native response can still open the app without starting a second store.
export function watchStartup(operation, { onSlow, onReady, onError, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let active = true;
  const timer = setTimer(() => { if (active) onSlow(); }, STARTUP_SLOW_MS);
  Promise.resolve(operation).then(
    value => { clearTimer(timer); if (active) onReady(value); },
    error => { clearTimer(timer); if (active) onError(error); },
  );
  return () => { active = false; clearTimer(timer); };
}

export default function useRepository() {
  const repository = useRef(null), alive = useRef(true), initialization = useRef(null), ready = useRef(false);
  const [state, setState] = useState(null), [error, setError] = useState(''), [slow, setSlow] = useState(false);
  const refresh = useCallback(async () => {
    if (!repository.current) return null;
    const next = await repository.current.getState();
    if (alive.current) setState(next);
    return next;
  }, []);
  useEffect(() => {
    alive.current = true;
    initialization.current ||= openRepository().then(async repo => { repository.current = repo; return repo.getState(); });
    const stopWatching = watchStartup(initialization.current, {
      onSlow: () => setSlow(true),
      onReady: next => { ready.current = true; setState(next); setSlow(false); setError(''); },
      onError: e => { setError(e?.message || '本地词库读取失败'); setSlow(false); },
    });
    const visible = () => { if (ready.current && document.visibilityState === 'visible') refresh().catch(e => setError(e.message)); };
    const timer = setInterval(visible, 60_000);
    document.addEventListener('visibilitychange', visible);
    return () => { alive.current = false; stopWatching(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  return { state, repo: repository.current, refresh, error, slow };
}
