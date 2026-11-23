import test from 'node:test';
import assert from 'node:assert/strict';
import { inHoldMenu, marqueeFrame, marqueeRect, marqueeSelection } from '../src/wall-marquee.mjs';

const grid = count => Array.from({ length: count }, (_, index) => {
  const row = Math.floor(index / 4), column = index % 4;
  const left = column * 55, top = row * 55;
  return { word: String(index), row, column, bounds: { left, top, right: left + 50, bottom: top + 50 } };
});
const center = tile => ({ x: tile.bounds.left + 25, y: tile.bounds.top + 25 });
const hit = (tiles, index, end, sounded = 1) => marqueeFrame(center(tiles[index]), end, tiles[index], tiles, sounded);

test('drag in eight directions selects the rectangle, including straight horizontal and vertical lanes', () => {
  const tiles = grid(28), start = tiles[13];
  for (const row of [-1, 0, 1]) for (const col of [-1, 0, 1]) {
    if (!row && !col) continue;
    const target = tiles[13 + row * 4 + col];
    const result = hit(tiles, 13, center(target));
    const expected = new Set([start.word, target.word]);
    if (row && col) { expected.add(tiles[13 + row * 4].word); expected.add(tiles[13 + col].word); }
    assert.deepEqual(result.words, expected, `direction ${row} ${col}`);
    assert.equal(result.grow, !!(row && col));
  }
});

test('each corner covers a full page without adding absent cards on the last page', () => {
  const full = grid(28);
  for (const [start, end] of [[0, 27], [3, 24], [24, 3], [27, 0]]) {
    const frame = hit(full, start, center(full[end]));
    assert.equal(frame.words.size, 28);
    assert.equal(frame.sounded, 4);
  }
  const short = grid(6);
  const result = hit(short, 0, center(full[27]));
  assert.deepEqual(result.words, new Set(short.map(tile => tile.word)));
});

test('coverage, shrink-to-origin and six-pixel sound hysteresis are distinct', () => {
  const tiles = grid(28);
  const hitAt = (y, sounded) => hit(tiles, 0, { x: 90, y }, sounded);
  assert.equal(hitAt(60, 1).words.size, 2);
  const entered = hitAt(61, 1);
  assert.equal(entered.words.size, 4);
  assert.equal(entered.grow, true);
  const jitter = hitAt(57, 2);
  assert.equal(jitter.words.size, 2);
  assert.equal(jitter.sounded, 2);
  assert.equal(hitAt(61, jitter.sounded).grow, false);
  const shrank = hitAt(54, 2);
  assert.equal(shrank.sounded, 1);
  assert.equal(hitAt(61, shrank.sounded).grow, true);
  assert.deepEqual(hit(tiles, 0, center(tiles[0]), 2).words, new Set(['0']));
});

test('selection addition and removal are evaluated against the original selection', () => {
  const base = new Set(['0', '1', 'other-page']);
  assert.deepEqual(marqueeSelection(base, new Set(['0', '4']), true), new Set(['1', 'other-page']));
  assert.deepEqual(marqueeSelection(base, new Set(['1', '4']), false), new Set(['0', '1', 'other-page', '4']));
  assert.deepEqual(base, new Set(['0', '1', 'other-page']));
});

test('hold menu includes the start card, action strip, connector and padding only', () => {
  const tile = { left: 120, right: 170, top: 180, bottom: 230 };
  const menu = { left: 70, right: 220, top: 100, bottom: 151 };
  for (const point of [{ x: 145, y: 215 }, { x: 80, y: 113 }, { x: 145, y: 165 }, { x: 58, y: 100 }]) {
    assert.equal(inHoldMenu(point, tile, menu), true);
  }
  for (const point of [{ x: 57, y: 100 }, { x: 60, y: 177 }, { x: 145, y: 87 }, { x: 145, y: 243 }]) {
    assert.equal(inHoldMenu(point, tile, menu), false);
  }
  assert.deepEqual(marqueeRect({ x: 100, y: 50 }, { x: 20, y: 110 }), { left: 20, right: 100, top: 50, bottom: 110 });
});
