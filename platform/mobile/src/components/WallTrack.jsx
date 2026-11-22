import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import '../wall-track.css';

// Candidate C's starting values. Confirm the gesture thresholds on Android hardware.
const HOLD_MS = 400;
const TOUCH_SLOP = 10;
const MOUSE_SLOP = 6;
const PAGE_GAP = 5;
const PAGE_FRACTION = 0.2;
const FLICK_SPEED = 0.4; // pixels per millisecond

const point = touch => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY });
const mousePoint = event => ({ x: event.clientX, y: event.clientY });
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const along = (point, axis) => axis === 'y' ? point.y : point.x;
const across = (point, axis) => axis === 'y' ? point.x : point.y;

function twoFingerDirection(start, end) {
  const moves = start.map(a => {
    const b = end.find(p => p.id === a.id);
    return b && { x: b.x - a.x, y: b.y - a.y };
  });
  const [a, b] = moves;
  if (!a || !b || new Set(end.map(p => p.id)).size !== 2) return 0;
  if (Math.abs(a.x) >= 32 || Math.abs(b.x) >= 32 || Math.abs(a.y - b.y) >= 35) return 0;
  if (Math.abs(distance(start[0], start[1]) - distance(end[0], end[1])) > 24) return 0;
  if (a.y < -48 && b.y < -48) return -1;
  if (a.y > 48 && b.y > 48) return 1;
  return 0;
}

export default forwardRef(function WallTrack({
  pages, page, axis = 'x', active, enabled, paging = true, motionKey,
  renderPage, onPageChange, onFresh, onUndo, onHoldStart, onHoldMove,
  onHoldEnd, onHoldCancel, onEdge,
}, ref) {
  const viewport = useRef(null), line = useRef(null);
  const motion = useRef({ offset: 0, animation: null, pending: null });
  const gesture = useRef(null), holdTimer = useRef(null), suppressClick = useRef(false);
  const [warm, setWarm] = useState(null);
  const warmed = warm?.pages === pages && warm.page === page && warm.axis === axis;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const latest = useRef(null);
  latest.current = { pages, page, axis, active, enabled, paging, warmed, onPageChange, onFresh, onUndo,
    onHoldStart, onHoldMove, onHoldEnd, onHoldCancel, onEdge };

  function transform(offset) {
    return latest.current.axis === 'y' ? `translate3d(0, ${offset}px, 0)` : `translate3d(${offset}px, 0, 0)`;
  }
  function position(offset, phase = 'idle') {
    motion.current.offset = offset;
    if (line.current) line.current.style.transform = transform(offset);
    if (viewport.current) viewport.current.dataset.phase = phase;
  }
  function stopAnimation() {
    motion.current.animation?.cancel();
    motion.current.animation = null;
  }
  function visibleOffset() {
    if (!line.current || !motion.current.animation) return motion.current.offset;
    const css = getComputedStyle(line.current).transform;
    if (css === 'none') return 0;
    const matrix = new DOMMatrixReadOnly(css);
    return latest.current.axis === 'y' ? matrix.m42 : matrix.m41;
  }
  function settle(offset) {
    stopAnimation();
    position(0);
    if (!line.current?.animate || reduced() || Math.abs(offset) < 0.5) return;
    const animation = line.current.animate([{ transform: transform(offset) }, { transform: transform(0) }], {
      duration: Math.min(420, 220 + Math.abs(offset) * 0.45),
      easing: 'cubic-bezier(0.22, 0.9, 0.24, 1)',
    });
    motion.current.animation = animation;
    if (viewport.current) viewport.current.dataset.phase = 'settling';
    animation.onfinish = () => {
      if (motion.current.animation !== animation) return;
      motion.current.animation = null;
      position(0);
    };
  }
  function pageLength() {
    const element = line.current;
    return (latest.current.axis === 'y' ? element?.clientHeight : element?.clientWidth) + PAGE_GAP;
  }
  function turn(direction, offset = visibleOffset()) {
    const options = latest.current;
    if (!options.active || !options.paging || !direction || gesture.current?.mode === 'hold') return false;
    const next = options.page + direction;
    if (next < 0 || next >= options.pages.length) {
      options.onEdge?.(direction);
      return false;
    }
    motion.current.pending = { page: next, fromPage: options.page, offset: offset + direction * pageLength() };
    options.onPageChange(next);
    return true;
  }
  useImperativeHandle(ref, () => ({ turn: direction => turn(direction), root: viewport.current }));

  function stopHoldTimer() {
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }
  function cancelGesture() {
    stopHoldTimer();
    const current = gesture.current;
    gesture.current = null;
    if (current?.mode === 'hold') latest.current.onHoldCancel?.();
    if (current?.mode === 'pan') settle(motion.current.offset);
  }

  useLayoutEffect(() => {
    cancelGesture();
    const pending = motion.current.pending;
    motion.current.pending = null;
    settle(pending?.page === page ? pending.offset : 0);
  }, [page, axis, motionKey]);

  useLayoutEffect(() => {
    if (!active || !enabled) cancelGesture();
  }, [active, enabled]);

  useEffect(() => {
    if (!active || warmed || pages.length < 2) return;
    let idle;
    const ready = () => setWarm({ pages, page, axis });
    const timer = setTimeout(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(ready, { timeout: 600 });
      else ready();
    }, 180);
    return () => {
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [active, warmed, pages, page, axis]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const enabled = () => latest.current.active && latest.current.enabled && latest.current.pages.length;
    const ordinaryControl = target => target.closest?.('button:not(.tile-face), input, select, textarea, a');
    const actionable = target => element.contains(target) && !ordinaryControl(target);
    function startSingle(kind, start, target, pointerId) {
      suppressClick.current = false;
      if (!enabled() || !actionable(target)) return;
      const initial = { kind, pointerId, start, time: performance.now(), mode: null };
      gesture.current = initial;
      const tile = target.closest?.('.tile-face')?.closest('[data-current] .word-tile[data-word]');
      if (tile && latest.current.onHoldStart) {
        holdTimer.current = setTimeout(() => {
          if (gesture.current !== initial || !enabled() || !tile.isConnected) return;
          initial.mode = 'hold';
          suppressClick.current = true;
          latest.current.onHoldStart(tile.dataset.word, tile.getBoundingClientRect());
        }, HOLD_MS);
      }
    }
    function moveSingle(current, now, event) {
      if (current.mode === 'hold') {
        if (event.cancelable) event.preventDefault();
        latest.current.onHoldMove?.(now.x, now.y);
        return;
      }
      const options = latest.current;
      const delta = { x: now.x - current.start.x, y: now.y - current.start.y };
      const primary = along(delta, options.axis), perpendicular = across(delta, options.axis);
      if (current.mode === null && distance(current.start, now) > (current.kind === 'touch' ? TOUCH_SLOP : MOUSE_SLOP)) {
        stopHoldTimer();
        suppressClick.current = true;
        current.mode = options.paging && Math.abs(primary) > Math.abs(perpendicular) * 1.2 ? 'pan' : 'other';
        if (current.mode === 'pan') {
          current.base = visibleOffset();
          stopAnimation();
          if (!options.warmed && options.pages.length > 1 && !reduced()) {
            flushSync(() => setWarm({ pages: options.pages, page: options.page, axis: options.axis }));
          }
          current.samples = [{ time: current.time, offset: current.base }];
        }
      }
      if (current.mode !== 'pan') return;
      if (event.cancelable) event.preventDefault();
      current.offset = current.base + primary;
      const time = performance.now();
      current.samples.push({ time, offset: current.offset });
      while (current.samples.length > 2 && time - current.samples[0].time > 100) current.samples.shift();
      const length = pageLength();
      const atEdge = current.offset > 0 && options.page === 0 || current.offset < 0 && options.page >= options.pages.length - 1;
      const resisted = atEdge ? current.offset * 0.28 : current.offset;
      position(reduced() ? 0 : Math.min(length, Math.max(-length, resisted)), 'dragging');
    }
    function endSingle(current, now, event) {
      stopHoldTimer();
      gesture.current = null;
      if (current.mode === 'hold') {
        if (event.cancelable) event.preventDefault();
        latest.current.onHoldEnd?.(now.x, now.y);
        return;
      }
      if (current.mode !== 'pan') return;
      if (event.cancelable) event.preventDefault();
      const first = current.samples[0], last = current.samples.at(-1);
      const elapsed = last.time - first.time;
      const velocity = elapsed > 0 && performance.now() - last.time < 100 ? (last.offset - first.offset) / elapsed : 0;
      const length = pageLength();
      const offset = current.offset;
      const flick = Math.abs(velocity) > FLICK_SPEED && Math.sign(velocity) === Math.sign(offset);
      const accepted = Math.abs(offset) > length * PAGE_FRACTION || flick;
      if (!accepted || !turn(offset < 0 ? 1 : -1, motion.current.offset)) settle(motion.current.offset);
    }
    function touchStart(event) {
      const touches = Array.from(event.touches);
      if (touches.length === 1) {
        cancelGesture();
        startSingle('touch', point(touches[0]), event.target);
        return;
      }
      const previous = gesture.current;
      cancelGesture();
      suppressClick.current = true;
      const first = touches.find(t => t.identifier === previous?.start.id);
      const join = previous?.kind === 'touch' && previous.mode === null && first &&
        performance.now() - previous.time <= 180 && distance(previous.start, point(first)) <= TOUCH_SLOP;
      const together = event.changedTouches.length === 2 && !previous;
      if (enabled() && latest.current.paging && touches.length === 2 && (join || together) && touches.every(t => actionable(t.target))) {
        gesture.current = { kind: 'two', start: touches.map(point), time: performance.now() };
      }
    }
    function touchMove(event) {
      const current = gesture.current;
      if (!current || !enabled()) return;
      if (current.kind === 'two') {
        const end = Array.from(event.touches, point);
        const [a, b] = current.start.map(start => end.find(p => p.id === start.id));
        if (!a || !b) return;
        const dyA = a.y - current.start[0].y, dyB = b.y - current.start[1].y;
        const paired = Math.sign(dyA) === Math.sign(dyB) && Math.min(Math.abs(dyA), Math.abs(dyB)) > 3 &&
          Math.abs(distance(a, b) - distance(current.start[0], current.start[1])) < 12;
        if (paired && event.cancelable) event.preventDefault();
        return;
      }
      if (current.kind === 'touch' && event.touches.length === 1 && current.start.id === event.touches[0].identifier) {
        moveSingle(current, point(event.touches[0]), event);
      }
    }
    function touchEnd(event) {
      const current = gesture.current;
      if (!current) return;
      if (current.kind === 'two') {
        gesture.current = null;
        const end = [...event.touches, ...event.changedTouches].map(point);
        const direction = enabled() && latest.current.paging && performance.now() - current.time <= 650 && twoFingerDirection(current.start, end);
        if (!direction) return;
        if (event.cancelable) event.preventDefault();
        if (direction < 0) latest.current.onFresh?.();
        else latest.current.onUndo?.();
        return;
      }
      const touch = Array.from(event.changedTouches).find(t => t.identifier === current.start.id);
      if (current.kind === 'touch' && touch) endSingle(current, point(touch), event);
    }
    function pointerDown(event) {
      if (!['mouse', 'pen'].includes(event.pointerType) || event.button !== 0) return;
      cancelGesture();
      startSingle('pointer', mousePoint(event), event.target, event.pointerId);
    }
    function pointerMove(event) {
      const current = gesture.current;
      if (current?.kind === 'pointer' && current.pointerId === event.pointerId && enabled()) {
        moveSingle(current, mousePoint(event), event);
      }
    }
    function pointerUp(event) {
      const current = gesture.current;
      if (current?.kind === 'pointer' && current.pointerId === event.pointerId) {
        endSingle(current, mousePoint(event), event);
      }
    }
    function pointerCancel(event) {
      if (gesture.current?.pointerId === event.pointerId) cancelGesture();
    }
    function contextMenu(event) {
      if (event.target.closest?.('.tile-face')) event.preventDefault();
    }
    const touchOptions = { passive: false };
    element.addEventListener('touchstart', touchStart, touchOptions);
    element.addEventListener('touchmove', touchMove, touchOptions);
    element.addEventListener('touchend', touchEnd, touchOptions);
    element.addEventListener('touchcancel', cancelGesture);
    element.addEventListener('pointerdown', pointerDown);
    element.addEventListener('contextmenu', contextMenu);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('blur', cancelGesture);
    return () => {
      stopHoldTimer();
      stopAnimation();
      gesture.current = null;
      element.removeEventListener('touchstart', touchStart);
      element.removeEventListener('touchmove', touchMove);
      element.removeEventListener('touchend', touchEnd);
      element.removeEventListener('touchcancel', cancelGesture);
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('contextmenu', contextMenu);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('blur', cancelGesture);
    };
  }, []);

  const previous = motion.current.pending?.page === page ? motion.current.pending.fromPage : null;
  function captureClick(event) {
    if (!suppressClick.current || event.detail === 0) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }
  return <div className="wall-track-viewport" data-axis={axis} data-paging={paging ? undefined : 'off'} ref={viewport} onClickCapture={captureClick}>
    <div className="wall-track-line" ref={line}>
      {[page - 1, page, page + 1].map(index => {
        const current = index === page;
        if (!current && (!pages[index] || !warmed && index !== previous)) return null;
        return <div key={index} className="wall-track-pane" data-page={index} data-current={current ? '' : undefined}
          data-side={index < page ? 'before' : index > page ? 'after' : 'current'} inert={!current} aria-hidden={current ? undefined : true}>
          {renderPage(pages[index] || [], index, current)}
        </div>;
      })}
    </div>
  </div>;
});
