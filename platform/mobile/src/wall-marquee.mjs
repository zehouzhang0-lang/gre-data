const COVERAGE = 6;

export function marqueeRect(start, end) {
  return {
    left: Math.min(start.x, end.x), right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y),
  };
}

function contains({ x, y }, { left, right, top, bottom }, padding) {
  return x >= left - padding && x <= right + padding && y >= top - padding && y <= bottom + padding;
}

export function inHoldMenu(point, tile, menu, padding = 12) {
  if (contains(point, tile, padding) || contains(point, menu, padding)) return true;
  const [above, below] = tile.top < menu.top ? [tile, menu] : [menu, tile];
  // Bridge the vertical gap without admitting the full bounding rectangle.
  const gap = below.top - above.bottom;
  if (gap <= 0 || point.y < above.bottom || point.y > below.top) return false;
  const ratio = (point.y - above.bottom) / gap;
  const left = above.left + (below.left - above.left) * ratio;
  const right = above.right + (below.right - above.right) * ratio;
  return point.x >= left - padding && point.x <= right + padding;
}

function hitArea(start, end) {
  const rect = marqueeRect(start, end);
  // A straight horizontal or vertical drag still tracks the originating lane.
  const padX = Math.max(0, COVERAGE - (rect.right - rect.left)) / 2;
  const padY = Math.max(0, COVERAGE - (rect.bottom - rect.top)) / 2;
  return { left: rect.left - padX, right: rect.right + padX, top: rect.top - padY, bottom: rect.bottom + padY };
}

function enoughOverlap(rect, bounds) {
  return Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left) >= COVERAGE &&
    Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top) >= COVERAGE;
}

function footprint(start, end, origin, tiles) {
  const area = hitArea(start, end);
  const words = new Set([origin.word]);
  let rows = 1, columns = 1;
  for (const tile of tiles) {
    if (tile === origin || !enoughOverlap(area, tile.bounds)) continue;
    words.add(tile.word);
    rows = Math.max(rows, 1 + Math.abs(origin.row - tile.row));
    columns = Math.max(columns, 1 + Math.abs(origin.column - tile.column));
  }
  return { words, shortest: Math.min(rows, columns) };
}

export function marqueeFrame(start, end, origin, tiles, lastSounded) {
  const { words, shortest } = footprint(start, end, origin, tiles);
  if (shortest > lastSounded) return { words, sounded: shortest, grow: true };
  if (shortest === lastSounded) return { words, sounded: lastSounded, grow: false };
  const extended = {
    x: end.x + Math.sign(end.x - start.x) * COVERAGE,
    y: end.y + Math.sign(end.y - start.y) * COVERAGE,
  };
  const { shortest: buffered } = footprint(start, extended, origin, tiles);
  return { words, sounded: Math.max(shortest, Math.min(buffered, lastSounded)), grow: false };
}

export function marqueeSelection(base, words, remove) {
  const next = new Set(base);
  for (const word of words) {
    if (remove) next.delete(word);
    else next.add(word);
  }
  return next;
}
