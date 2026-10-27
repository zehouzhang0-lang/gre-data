import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardReadingDraft } from '../src/card-reading-draft.mjs';

test('failed reading saves keep their payload and ID; new flips survive retry', () => {
  let sequence = 0;
  const draft = createCardReadingDraft(() => `batch-${++sequence}`);
  draft.record('abate', '2026-10-17T00:00:00.000Z');
  draft.record('abate', '2026-10-17T00:00:01.000Z');
  const first = draft.prepare(() => 'partial');
  assert.equal(first.payload.items[0].count, 2);
  draft.record('abate', '2026-10-17T00:00:02.000Z');
  draft.record('abet', '2026-10-17T00:00:03.000Z');
  assert.strictEqual(draft.prepare(() => 'remembered'), first);
  assert.equal(first.payload.items[0].impression, 'partial');
  draft.commit();
  const second = draft.prepare(() => null);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(second.payload.items, [
    { word: 'abate', count: 1, viewed_at: '2026-10-17T00:00:02.000Z', impression: null },
    { word: 'abet', count: 1, viewed_at: '2026-10-17T00:00:03.000Z', impression: null },
  ]);
  draft.commit();
  assert.equal(draft.prepare(() => 'remembered'), null);
});

test('atomic round finish includes flips after a failed save without changing frozen batches', () => {
  let id = 0;
  const draft = createCardReadingDraft(() => `batch-${++id}`);
  draft.record('abate', '2026-10-27T00:00:00.000Z');
  const failed = draft.prepareAll(() => 'partial');
  draft.record('abate', '2026-10-27T00:00:02.000Z');
  draft.record('abet', '2026-10-27T00:00:03.000Z');
  const retry = draft.prepareAll(() => 'remembered');
  assert.equal(retry.length, 2);
  assert.strictEqual(retry[0], failed[0]);
  assert.equal(retry[1].payload.items[0].count, 1);
  assert.equal(retry[1].payload.items[1].word, 'abet');
  assert.deepEqual(draft.prepareAll(() => null), retry);
  draft.commitAll();
  assert.deepEqual(draft.prepareAll(() => null), []);
});
