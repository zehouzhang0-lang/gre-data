import { marqueeFrame, marqueeRect, marqueeSelection } from './wall-marquee.mjs';

// Keep drag feedback outside React. Only a completed gesture changes its selection.
export function createWallMarquee() {
  let current;

  function draw(gesture, point) {
    const { bounds, start, origin, tiles, box, count, base, remove } = gesture;
    const end = {
      x: Math.min(bounds.right, Math.max(bounds.left, point.x)),
      y: Math.min(bounds.bottom, Math.max(bounds.top, point.y)),
    };
    const frame = marqueeFrame(start, end, origin, tiles, gesture.sounded);
    const rect = marqueeRect(start, end);
    gesture.words = frame.words;
    gesture.sounded = frame.sounded;
    box.style.setProperty('--marquee-x', `${rect.left}px`);
    box.style.setProperty('--marquee-y', `${rect.top}px`);
    box.style.setProperty('--marquee-width', `${rect.right - rect.left}px`);
    box.style.setProperty('--marquee-height', `${rect.bottom - rect.top}px`);
    let total = base.size;
    for (const { element, word } of tiles) {
      const hit = frame.words.has(word);
      const selected = base.has(word);
      const added = hit && !selected && !remove;
      const removed = hit && selected && remove;
      element.toggleAttribute('data-marquee-selected', added);
      element.toggleAttribute('data-marquee-unselected', removed);
      if (added) total++;
      if (removed) total--;
    }
    const message = `已选 ${total} 词`;
    if (count.textContent !== message) count.textContent = message;
    if (frame.grow) gesture.onGrow();
  }

  function cancel() {
    if (!current) return;
    const { tiles, wall, box, count, frame } = current;
    if (frame !== null) cancelAnimationFrame(frame);
    for (const { element } of tiles) {
      element.removeAttribute('data-marquee-selected');
      element.removeAttribute('data-marquee-unselected');
    }
    wall.removeAttribute('data-marquee');
    box.hidden = true;
    count.textContent = '';
    current = null;
  }

  return {
    get active() { return !!current; },
    begin({ name, start, viewport, wall, box, count, selected, columns, onGrow }) {
      const grid = viewport?.querySelector('.wall-track-pane[data-current] .c-wall-grid');
      if (!grid || !box || !count) return false;
      const tiles = [...grid.querySelectorAll('.word-tile[data-word]')].map((element, index) => ({
        element, word: element.dataset.word, bounds: element.getBoundingClientRect(),
        row: Math.floor(index / columns), column: index % columns,
      }));
      const origin = tiles.find(tile => tile.word === name);
      if (!origin) return false;
      cancel();
      current = { wall, box, count, tiles, origin, start, bounds: grid.getBoundingClientRect(), sounded: 1,
        base: new Set(selected), remove: selected.has(name), onGrow, frame: null, point: start };
      wall.dataset.marquee = current.remove ? 'remove' : 'add';
      box.hidden = false;
      draw(current, start);
      return true;
    },
    move(point) {
      if (!current) return;
      const gesture = current;
      gesture.point = point;
      if (gesture.frame !== null) return;
      gesture.frame = requestAnimationFrame(() => {
        gesture.frame = null;
        draw(gesture, gesture.point);
      });
    },
    finish(point) {
      if (!current) return null;
      if (point.x !== current.point.x || point.y !== current.point.y || current.frame !== null) draw(current, point);
      const result = current.words.size > 1 ? marqueeSelection(current.base, current.words, current.remove) : null;
      cancel();
      return result;
    },
    cancel,
  };
}
