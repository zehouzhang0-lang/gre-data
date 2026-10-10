import { useEffect, useRef, useState } from 'react';
import { dragSelection, intersectsBox } from './word-wall-model.mjs';

// Document coordinates keep the anchor attached to its card while the page scrolls.
export default function useWordWallSelection({ grid, selected, setSelected, disabled, resetKey }) {
  const latest = useRef(null), cancel = useRef(null);
  latest.current = { selected, setSelected, disabled };
  const [box, setBox] = useState(null);
  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    let gesture = null, frame = 0, suppressClick = false;
    function finish(restore = false) {
      const previous = gesture;
      gesture = null;
      cancelAnimationFrame(frame); frame = 0;
      if (previous?.dragging && restore) latest.current.setSelected(previous.base);
      if (previous && element.hasPointerCapture(previous.id)) element.releasePointerCapture(previous.id);
      setBox(null);
    }
    cancel.current = finish;
    function paint() {
      if (!gesture?.dragging) return;
      const x = gesture.clientX + window.scrollX, y = gesture.clientY + window.scrollY;
      const rect = { left: Math.min(gesture.x, x), top: Math.min(gesture.y, y), right: Math.max(gesture.x, x), bottom: Math.max(gesture.y, y) };
      const hits = new Set();
      for (const card of element.querySelectorAll('.wall-card[data-selectable="true"]')) {
        const bounds = card.getBoundingClientRect();
        if (intersectsBox(rect, { left: bounds.left + window.scrollX, right: bounds.right + window.scrollX, top: bounds.top + window.scrollY, bottom: bounds.bottom + window.scrollY })) hits.add(card.dataset.word);
      }
      const next = dragSelection(gesture.base, hits, gesture.mode);
      if (next.size !== latest.current.selected.size || [...next].some(word => !latest.current.selected.has(word))) latest.current.setSelected(next);
      setBox({ left: rect.left - window.scrollX, top: rect.top - window.scrollY, width: rect.right - rect.left, height: rect.bottom - rect.top });
    }
    function tick() {
      frame = 0;
      if (!gesture?.dragging) return;
      const edge = 44, y = gesture.clientY;
      const delta = y < edge ? -Math.ceil(14 * Math.min(1, (edge - y) / edge)) : y > window.innerHeight - edge ? Math.ceil(14 * Math.min(1, (y - window.innerHeight + edge) / edge)) : 0;
      if (delta) window.scrollBy(0, delta);
      paint();
      frame = requestAnimationFrame(tick);
    }
    function down(event) {
      suppressClick = false;
      if (latest.current.disabled || event.button !== 0 || !event.isPrimary || event.pointerType === 'touch') return;
      const control = event.target.closest('button,input,select,textarea,a,[contenteditable=true]');
      if (control && !control.classList.contains('wall-face')) return;
      // Let the native scrollbar on a long definition retain its own drag behavior.
      const meaning = event.target.closest('.wall-meaning,strong[lang=en]');
      if (meaning && meaning.scrollHeight > meaning.clientHeight) {
        const bounds = meaning.getBoundingClientRect();
        if (event.clientX >= bounds.right - 14) return;
      }
      gesture = { id: event.pointerId, x: event.clientX + window.scrollX, y: event.clientY + window.scrollY, clientX: event.clientX, clientY: event.clientY, startX: event.clientX, startY: event.clientY, base: new Set(latest.current.selected), mode: event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'add' : 'replace', dragging: false };
    }
    function move(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (latest.current.disabled) { finish(true); return; }
      gesture.clientX = event.clientX; gesture.clientY = event.clientY;
      if (!gesture.dragging && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 5) {
        gesture.dragging = true; suppressClick = true;
        element.setPointerCapture(gesture.id);
      }
      if (gesture.dragging) { event.preventDefault(); if (!frame) frame = requestAnimationFrame(tick); }
    }
    function up(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      gesture.clientX = event.clientX; gesture.clientY = event.clientY;
      paint(); finish();
    }
    function click(event) {
      if (suppressClick && event.detail > 0) { suppressClick = false; event.preventDefault(); event.stopPropagation(); }
    }
    function abort(event) { if (!event.pointerId || event.pointerId === gesture?.id) finish(true); }
    function escape(event) {
      if (event.key === 'Escape' && gesture?.dragging) { event.preventDefault(); event.stopPropagation(); finish(true); }
    }
    element.addEventListener('pointerdown', down);
    element.addEventListener('click', click, true);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('blur', abort);
    window.addEventListener('keydown', escape, true);
    return () => {
      finish(); cancel.current = null;
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('click', click, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('blur', abort);
      window.removeEventListener('keydown', escape, true);
    };
  }, [grid]);
  useEffect(() => { cancel.current?.(); }, [disabled, resetKey]);
  return box;
}
