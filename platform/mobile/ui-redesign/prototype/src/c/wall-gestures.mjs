// Touch and mouse gestures for candidate C's word wall.
//
//   tap a word                               -> turn it over (the tile's own click)
//   drag along the wall's direction          -> the wall follows the finger; letting go
//                                               lands on the next or the previous page
//   two fingers up / two fingers down        -> Fresh / undo the last thing
//   press and hold a word                    -> the mark strip opens above it
//       slide onto a mark and let go         -> that word is marked at once
//       let go without choosing              -> the word is selected and multi-select starts
//
// The wall's direction is 'x' (pages side by side) or 'y' (pages stacked).
// This file started as a copy of useWallGestures in ../main.jsx. The two-finger rule is
// unchanged from there; the page swipe became a drag that follows the finger, and the
// long press grew the mark strip. All distances and times need tuning on a real phone.
import { useEffect, useRef } from 'react';

const HOLD_MS = 400;       // press and hold before the mark strip opens
const SLOP = 10;           // travel that turns a touch into a drag
const MOUSE_SLOP = 6;

export function useWallGestures(handlers) {
  const ref = useRef(null);
  const h = useRef(handlers);
  h.current = handlers;
  const touch = useRef(null);
  const hold = useRef(null);
  const timer = useRef();
  const suppressUntil = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancelTimer = () => clearTimeout(timer.current);
    const suppress = ms => { suppressUntil.current = Math.max(suppressUntil.current, Date.now() + ms); };
    const along = p => (h.current.axis === 'y' ? p.y : p.x);
    const across = p => (h.current.axis === 'y' ? p.x : p.y);
    const wordAt = target => target.closest?.('.pane.current [data-word-id]')?.dataset.wordId;

    // ---- the mark strip ----
    const optionAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-hold-option]')?.dataset.holdOption ?? null;
    const openHold = id => { hold.current = { id, option: null }; suppress(900); h.current.onHoldOpen(id); };
    const moveHold = (x, y) => {
      const state = hold.current;
      if (!state) return;
      const option = optionAt(x, y);
      if (option !== state.option) { state.option = option; h.current.onHoldHover(option); }
    };
    const closeHold = commit => {
      const state = hold.current;
      hold.current = null;
      if (!state) return;
      suppress(700);
      if (!commit) h.current.onHoldCancel();
      else if (state.option) h.current.onHoldChoose(state.id, state.option);
      else h.current.onHoldRelease(state.id);
    };

    // ---- dragging the wall ----
    const startPan = (g, now) => {
      g.mode = 'pan';
      g.origin = along(now);
      g.samples = [{ t: performance.now(), v: 0 }];
      h.current.onPanStart();
    };
    const movePan = (g, now) => {
      const delta = along(now) - g.origin;
      const t = performance.now();
      g.samples.push({ t, v: delta });
      while (g.samples.length > 2 && t - g.samples[0].t > 100) g.samples.shift();
      g.delta = delta;
      h.current.onPan(delta);
    };
    const endPan = g => {
      const first = g.samples[0];
      const last = g.samples[g.samples.length - 1];
      const velocity = last.t > first.t ? (last.v - first.v) / (last.t - first.t) : 0; // px per ms
      suppress(400);
      h.current.onPanEnd(g.delta || 0, velocity);
    };
    // A drag counts as paging when it runs along the wall's direction. Paging by drag is
    // off during multi-select, as in the production app; the page buttons still work.
    const intent = d => {
      const a = Math.abs(along(d));
      const c = Math.abs(across(d));
      return a > c * 1.2 && !h.current.multi ? 'pan' : 'other';
    };

    // ---- touch ----
    const points = touches => [...touches].map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
    const start = e => {
      cancelTimer();
      if (hold.current) closeHold(false);
      if (!h.current.enabled) return;
      if (e.touches.length > 2) { touch.current = null; return; }
      const previous = touch.current;
      if (previous?.mode === 'pan') endPan(previous);
      touch.current = { start: points(e.touches), end: points(e.touches), mode: null, fired: false };
      if (e.touches.length === 2) { touch.current.mode = 'two'; suppress(900); return; }
      const id = wordAt(e.target);
      if (id && !h.current.multi) timer.current = setTimeout(() => { if (touch.current) touch.current.mode = 'hold'; openHold(id); }, HOLD_MS);
    };
    const move = e => {
      const g = touch.current;
      if (hold.current) {
        if (e.cancelable) e.preventDefault();
        if (e.touches[0]) moveHold(e.touches[0].clientX, e.touches[0].clientY);
        return;
      }
      if (!g || g.fired) return;
      if (e.touches.length !== g.start.length) { cancelTimer(); if (g.mode === 'pan') endPan(g); touch.current = null; return; }
      g.end = points(e.touches);
      const delta = g.start.map(p => {
        const q = g.end.find(t => t.id === p.id);
        return q ? { x: q.x - p.x, y: q.y - p.y } : null;
      });
      if (delta.some(d => !d)) { cancelTimer(); touch.current = null; return; }

      if (g.mode === 'two') {
        // Two fingers travelling together, mostly vertically: up is Fresh, down is undo.
        const [a, b] = delta;
        const together = Math.abs(a.x) < 32 && Math.abs(b.x) < 32 && Math.abs(a.y - b.y) < 35;
        if (!h.current.multi && together && Math.abs(a.y) > 14 && Math.abs(b.y) > 14 && Math.sign(a.y) === Math.sign(b.y)) {
          if (e.cancelable) e.preventDefault();
          if (a.y < -48 && b.y < -48) { g.fired = true; h.current.onFresh(); suppress(700); }
          else if (a.y > 48 && b.y > 48) { g.fired = true; h.current.onUndo(); suppress(700); }
        }
        return;
      }

      const d = delta[0];
      const now = g.end[0];
      if (g.mode === null && Math.hypot(d.x, d.y) > SLOP) {
        cancelTimer();
        suppress(500);
        if (intent(d) === 'pan') startPan(g, now); else g.mode = 'other';
      }
      if (g.mode === 'pan') {
        if (e.cancelable) e.preventDefault();
        movePan(g, now);
      }
    };
    const end = e => {
      cancelTimer();
      if (hold.current) {
        if (e.cancelable) e.preventDefault();
        closeHold(true);
        touch.current = null;
        return;
      }
      const g = touch.current;
      if (!g) return;
      if (e.touches.length) return; // wait for the last finger
      if (g.mode === 'pan') { if (e.cancelable) e.preventDefault(); endPan(g); }
      if (g.mode === 'two' || g.fired) suppress(700);
      touch.current = null;
    };
    const cancel = () => {
      cancelTimer();
      if (hold.current) closeHold(false);
      const g = touch.current;
      if (g?.mode === 'pan') endPan(g);
      touch.current = null;
      suppress(500);
    };

    // ---- mouse (so the same gestures can be tried on a desktop) ----
    const mouseDown = e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !h.current.enabled) return;
      if (e.target.closest('[data-hold-option]')) return;
      const origin = { x: e.clientX, y: e.clientY };
      const g = { mode: null };
      const id = wordAt(e.target);
      const onMove = ev => {
        const now = { x: ev.clientX, y: ev.clientY };
        if (hold.current) { moveHold(now.x, now.y); return; }
        const d = { x: now.x - origin.x, y: now.y - origin.y };
        if (g.mode === null && Math.hypot(d.x, d.y) > MOUSE_SLOP) {
          cancelTimer();
          suppress(500);
          if (intent(d) === 'pan') startPan(g, now); else g.mode = 'other';
        }
        if (g.mode === 'pan') movePan(g, now);
      };
      const onUp = () => {
        cancelTimer();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (hold.current) closeHold(true);
        else if (g.mode === 'pan') endPan(g);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      if (id && !h.current.multi) timer.current = setTimeout(() => { g.mode = 'hold'; openHold(id); }, HOLD_MS);
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', cancel, { passive: true });
    el.addEventListener('pointerdown', mouseDown);
    return () => {
      cancelTimer();
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
      el.removeEventListener('pointerdown', mouseDown);
    };
  }, [handlers.enabled]);

  return {
    ref,
    suppressClick: e => {
      if (Date.now() < suppressUntil.current) { e.preventDefault(); e.stopPropagation(); }
    },
  };
}
