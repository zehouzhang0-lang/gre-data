import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

const handlers = new Map();
function dispatchBack() {
  const first = [...handlers.values()].sort((a, b) => b.priority - a.priority)[0];
  if (!first) return false;
  first.action.current(); return true;
}
export function useBackAction(action, enabled = true, priority = 10) {
  const callback = useRef(action); callback.current = action;
  useEffect(() => {
    if (!enabled) return;
    const id = Symbol('back'); handlers.set(id, { priority, action: callback });
    return () => handlers.delete(id);
  }, [enabled, priority]);
}
export function useBackBridge() {
  useEffect(() => {
    const key = event => { if (event.key === 'Escape' && dispatchBack()) event.preventDefault(); };
    document.addEventListener('keydown', key);
    let nativeListener, disposed = false;
    if (Capacitor.isNativePlatform()) import('@capacitor/app').then(async ({ App }) => {
      const listener = await App.addListener('backButton', () => { if (!dispatchBack()) App.exitApp(); });
      if (disposed) listener.remove(); else nativeListener = listener;
    }).catch(() => { /* Browser Escape remains available when no native bridge exists. */ });
    return () => { disposed = true; document.removeEventListener('keydown', key); nativeListener?.remove(); };
  }, []);
}
