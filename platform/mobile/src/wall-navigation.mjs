import { displaySettings, normalizeFilters } from './model.mjs';

const number = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const position = value => ({ filters: normalizeFilters(value?.filters), page: Math.floor(number(value?.page)), scrollTop: number(value?.scrollTop), seed: number(value?.seed) });
export function restoreWallView(saved, settings = {}) {
  // Old pages contained 60 cards. Preserve their first-word neighborhood.
  const fallback = { filters: settings.wallFilters, page: Math.floor(number(settings.wallPage) * 60 / 28) };
  const view = position(saved || fallback);
  return { ...view, display: displaySettings(saved?.display || settings.display), searchOrigin: saved?.searchOrigin ? position(saved.searchOrigin) : null };
}
export function searchWall(view, query, scrollTop = view.scrollTop) {
  if (!query && view.searchOrigin) return { ...view, ...view.searchOrigin, searchOrigin: null };
  return { ...view, filters: { ...view.filters, query }, page: 0, scrollTop: 0,
    searchOrigin: view.searchOrigin || (query && !view.filters.query ? position({ ...view, scrollTop }) : null) };
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
