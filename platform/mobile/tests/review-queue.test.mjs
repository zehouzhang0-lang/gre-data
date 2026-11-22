import test from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, loadQueue, nextBatch, saveQueue } from '../src/review-queue.mjs';

const words = Array.from({ length: 23 }, (_, i) => `word${i}`);
const fresh = { datasetId: 'd', base: '转折', total: words.length, started: 0, words };
function memory() { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; }

test('a picked set is studied ten at a time until nothing is left', () => {
  const usable = new Set(words), seen = [];
  let queue = fresh, names = [];
  while (queue) { const batch = nextBatch(queue, usable); seen.push(...batch.words); names.push(batch.name); assert.ok(batch.words.length <= BATCH); queue = batch.rest; }
  assert.deepEqual(seen, words);
  assert.deepEqual(names, ['转折 · 1', '转折 · 2', '转折 · 3']);
});

test('a set of ten or fewer is one group with the plain name and leaves no queue', () => {
  const few = words.slice(0, 6), batch = nextBatch({ ...fresh, total: 6, words: few }, new Set(few));
  assert.deepEqual(batch, { words: few, name: '转折', rest: null });
});

test('words deleted or left without a meaning are skipped, and an unusable queue ends', () => {
  const batch = nextBatch(fresh, new Set(words.filter((_, i) => i % 2)));
  assert.equal(batch.words.length, BATCH);
  assert.ok(batch.words.every(word => Number(word.slice(4)) % 2));
  assert.equal(nextBatch(fresh, new Set()), null);
});

test('the queue survives a restart only for the same library and only when well formed', () => {
  const storage = memory(), rest = nextBatch(fresh, new Set(words)).rest;
  saveQueue(rest, storage);
  assert.deepEqual(loadQueue('d', storage), rest);
  assert.equal(loadQueue('other', storage), null);
  saveQueue(null, storage);
  assert.equal(loadQueue('d', storage), null);
  storage.setItem('gre-review-queue-v1', '{"datasetId":"d","words":"x"}');
  assert.equal(loadQueue('d', storage), null);
});
