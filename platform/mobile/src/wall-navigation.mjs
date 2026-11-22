import { displaySettings, normalizeFilters, PAGE_SIZE } from './model.mjs';

const number = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
function savedFreshPages(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const keys = new Set();
  for (const page of value) {
    if (!Array.isArray(page) || !page.length || page.length > PAGE_SIZE) return null;
    for (const key of page) {
      if (typeof key !== 'string' || !key || keys.has(key)) return null;
      keys.add(key);
    }
  }
  return value;
}
const position = value => ({ filters: normalizeFilters(value?.filters), page: Math.floor(number(value?.page)), scrollTop: number(value?.scrollTop), seed: number(value?.seed), freshPages: savedFreshPages(value?.freshPages) });
export function restoreWallView(saved, settings = {}) {
  // Old pages contained 60 cards. Preserve their first-word neighborhood.
  const fallback = { filters: settings.wallFilters, page: Math.floor(number(settings.wallPage) * 60 / 28) };
  const view = position(saved || fallback);
  return { ...view, display: displaySettings(saved?.display || settings.display), searchOrigin: saved?.searchOrigin ? position(saved.searchOrigin) : null };
}
export function searchWall(view, query, scrollTop = view.scrollTop) {
  if (!query && view.searchOrigin) return { ...view, ...view.searchOrigin, searchOrigin: null };
  return { ...view, filters: { ...view.filters, query }, page: 0, scrollTop: 0, freshPages: null,
    searchOrigin: view.searchOrigin || (query && !view.filters.query ? position({ ...view, scrollTop }) : null) };
}
export function wallPages(entries, freshPages) {
  let ordered = entries;
  if (freshPages) {
    const entriesByKey = new Map(entries.map(entry => [entry.key, entry]));
    const saved = freshPages.map(page => page.map(key => entriesByKey.get(key)).filter(Boolean));
    const known = saved.flat();
    if (known.length === entries.length && saved.every((page, i) => page.length === freshPages[i].length)) return saved;
    // A changed library may add or remove entries. Preserve the relative order
    // of surviving cards and give new entries their ordinary slots.
    const knownKeys = new Set(known.map(entry => entry.key));
    let index = 0;
    ordered = entries.map(entry => knownKeys.has(entry.key) ? known[index++] : entry);
  }
  const pages = [];
  for (let start = 0; start < ordered.length; start += PAGE_SIZE) pages.push(ordered.slice(start, start + PAGE_SIZE));
  return pages;
}
export function postponeWallPage(pages, page) {
  if (page < 0 || page >= pages.length - 1) return null;
  const next = [...pages];
  const target = Math.min(page + 3, pages.length - 1);
  const [postponed] = next.splice(page, 1);
  next.splice(target, 0, postponed);
  return { freshPages: next.map(cards => cards.map(entry => entry.key)), distance: target - page };
}
export function wallFreshSwipe(start, end, duration) {
  if (start.length !== 2 || end.length !== 2 || duration < 0 || duration > 650) return false;
  const shifts = start.map(point => {
    const target = end.find(other => other.id === point.id);
    return target && { x: target.x - point.x, y: point.y - target.y };
  });
  if (!shifts.every(shift => shift && shift.y >= 60 && shift.y >= Math.abs(shift.x) * 1.6)) return false;
  return Math.hypot(shifts[0].x - shifts[1].x, shifts[0].y - shifts[1].y) <= 42;
}
export function wallSwipe(start, end, { selecting = false, textSelected = false } = {}) {
  if (!start || selecting || textSelected || start.cancelled || !['touch', 'pen'].includes(start.pointerType)) return 0;
  const dx = end.x - start.x, dy = end.y - start.y, duration = end.time - start.time;
  if (duration < 0 || duration >= 450 || Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.6) return 0;
  return dx < 0 ? 1 : -1;
}
export function wallViewKey(datasetId) { return `gre-wall-view:v2:${datasetId}`; }
export function loadWallView(storage, datasetId, settings) {
  try { return restoreWallView(JSON.parse(storage?.getItem(wallViewKey(datasetId)) || 'null'), settings); }
  catch { return restoreWallView(null, settings); }
}
