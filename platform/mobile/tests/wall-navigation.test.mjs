import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWallView, restoreWallView, searchWall, wallSwipe, wallViewKey } from '../src/wall-navigation.mjs';

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
