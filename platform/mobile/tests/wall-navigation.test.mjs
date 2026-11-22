import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWallView, postponeWallPage, restoreWallView, searchWall, wallFreshSwipe, wallPages, wallSwipe, wallViewKey } from '../src/wall-navigation.mjs';
import { PAGE_SIZE } from '../src/model.mjs';

test('editing and clearing inline search restores page, offset, filters and shuffle seed', () => {
  const before = restoreWallView({ filters: { topics: ['my-topic'], sort: 'random' }, page: 7, scrollTop: 93, seed: 42 });
  let view = searchWall(before, 'lu');
  assert.equal(view.page, 0);
  view = searchWall({ ...view, page: 2 }, 'lucid');
  assert.equal(view.searchOrigin.page, 7);
  assert.deepEqual(searchWall(view, ''), before);
});

test('restart restores the search return point and separates dataset preferences', () => {
  const view = searchWall(restoreWallView({ page: 4, scrollTop: 67, filters: { groups: ['mine'] } }), 'clear');
  const storage = new Map([[wallViewKey('one'), JSON.stringify(view)]]);
  const restored = loadWallView({ getItem: key => storage.get(key) }, 'one', {});
  assert.equal(searchWall(restored, '').page, 4);
  assert.equal(searchWall(restored, '').scrollTop, 67);
  assert.deepEqual(searchWall(restored, '').filters.groups, ['mine']);
  assert.equal(loadWallView({ getItem: key => storage.get(key) }, 'two', {}).page, 0);
});

test('corrupt local preferences safely use the old 60-card page neighborhood', () => {
  const restored = loadWallView({ getItem: () => '{bad' }, 'one', { wallPage: 2 });
  assert.equal(restored.page, 4);
});

const start = { x: 200, y: 200, time: 100, pointerType: 'touch' };
test('left thumb swipe goes next and right goes previous', () => {
  assert.equal(wallSwipe(start, { x: 90, y: 215, time: 350 }), 1);
  assert.equal(wallSwipe(start, { x: 300, y: 215, time: 350 }), -1);
});

test('scroll, long press, multi-selection, text selection and mouse never turn pages', () => {
  const end = { x: 80, y: 215, time: 350 };
  assert.equal(wallSwipe(start, { ...end, y: 330 }), 0);
  assert.equal(wallSwipe(start, { ...end, time: 550 }), 0);
  assert.equal(wallSwipe(start, { ...end, x: 160 }), 0);
  assert.equal(wallSwipe(start, end, { selecting: true }), 0);
  assert.equal(wallSwipe(start, end, { textSelected: true }), 0);
  assert.equal(wallSwipe({ ...start, cancelled: true }, end), 0);
  assert.equal(wallSwipe({ ...start, pointerType: 'mouse' }, end), 0);
});

const cards = (length) => Array.from({ length }, (_, index) => ({ key: `group-${index}:word`, word: 'word' }));

test('fresh keeps the current page number while moving the exact cards three pages later', () => {
  const entries = cards(PAGE_SIZE * 6);
  const original = wallPages(entries);
  const update = postponeWallPage(original, 1);
  assert.equal(update.distance, 3);
  const reordered = wallPages(entries, update.freshPages);
  assert.deepEqual(reordered, [original[0], original[2], original[3], original[4], original[1], original[5]]);
  assert.equal(postponeWallPage(reordered, 5), null);
});

test('fresh can replace a full page with the short final page without splitting either batch', () => {
  const entries = cards(PAGE_SIZE * 2 + 3);
  const original = wallPages(entries);
  const update = postponeWallPage(original, 1);
  assert.equal(update.distance, 1);
  const refreshed = restoreWallView({ page: 1, freshPages: update.freshPages });
  assert.deepEqual(wallPages(entries, refreshed.freshPages), [original[0], original[2], original[1]]);
});

test('fresh order survives reload and is restored when the separate search order is cleared', () => {
  const entries = cards(PAGE_SIZE * 3);
  const original = wallPages(entries);
  const { freshPages } = postponeWallPage(original, 1);
  const browse = restoreWallView({ page: 1, scrollTop: 12, freshPages });
  const searching = searchWall(browse, 'word');
  assert.equal(searching.freshPages, null);
  const searchOrder = postponeWallPage(original, 0).freshPages;
  const recovered = restoreWallView(JSON.parse(JSON.stringify({ ...searching, freshPages: searchOrder })));
  assert.deepEqual(searchWall(recovered, ''), browse);
  assert.equal(searchWall(recovered, 'another').freshPages, null);
});

test('fresh order tolerates additions and removals without dropping cards or duplicating entries', () => {
  const original = cards(PAGE_SIZE * 2);
  const { freshPages } = postponeWallPage(wallPages(original), 0);
  const extra = { key: 'added', word: 'added' };
  const changed = [extra, ...original.slice(1)];
  const result = wallPages(changed, freshPages).flat();
  assert.equal(result.length, changed.length);
  assert.equal(result[0], extra);
  assert.deepEqual(result.slice(1), [...original.slice(PAGE_SIZE), ...original.slice(1, PAGE_SIZE)]);
});

test('fresh gesture requires two matching fingers moving upward together', () => {
  const start = [{ id: 1, x: 75, y: 220 }, { id: 2, x: 130, y: 210 }];
  const end = [{ id: 1, x: 75, y: 120 }, { id: 2, x: 130, y: 120 }];
  assert.equal(wallFreshSwipe(start, end, 350), true);
  assert.equal(wallFreshSwipe(start, end, 660), false);
  assert.equal(wallFreshSwipe(start, end.slice(0, 1), 350), false);
  assert.equal(wallFreshSwipe(start, end.map((p, i) => i ? { ...p, y: 180 } : p), 350), false);
  assert.equal(wallFreshSwipe(start, end.map((p, i) => ({ ...p, x: p.x + (i ? 45 : -45) })), 350), false);
  assert.equal(wallFreshSwipe(start, end.map(p => ({ ...p, y: p.y + 200 })), 350), false);
});
