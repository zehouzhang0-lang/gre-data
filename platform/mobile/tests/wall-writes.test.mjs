import test from 'node:test';
import assert from 'node:assert/strict';
import { createWallWriteQueue, optimisticWallRatings } from '../src/wall-writes.mjs';
import { createCardReadingDraft } from '../src/card-reading-draft.mjs';
import { emptyData, openRepository } from '../src/data/repository.mjs';
import { wordRating } from '../src/model.mjs';

const words = ['abate', 'brisk', 'candid', 'dense', 'eager', 'frank', 'genial', 'hasty', 'inert', 'jovial'];
const now = () => new Date('2026-11-23T10:00:00.000Z');

async function setup() {
  let value = null;
  const storage = {
    failNext: false,
    async read() { return value; },
    async write(next) {
      if (this.failNext) { this.failNext = false; throw Error('simulated write failure'); }
      value = next;
    },
  };
  const seed = emptyData();
  seed.baseline.vocabulary = words.map(word => ({ word, meaning: '测试释义' }));
  const repo = await openRepository({ storage, seed, now });
  return { repo, storage, queue: createWallWriteQueue() };
}

const wordMap = state => new Map(state.vocabulary.map(word => [word.word, word]));
const chronological = state => [...state.events].reverse();
const mark = (word, rating) => ({ kind: 'rate', words: [word], rating, id: crypto.randomUUID(), time: now().toISOString() });
const saveMark = (repo, operation) => repo.rate(operation.words, operation.rating, operation.id);

test('ten marks are visible before storage starts, and each saves once in queue order', async () => {
  const { repo, queue } = await setup();
  const blocked = Promise.withResolvers();
  const before = await repo.getState();
  const operations = words.map(word => mark(word, 'remembered'));
  const results = operations.map(operation => queue.enqueue(async () => {
    await blocked.promise;
    return saveMark(repo, operation);
  }));
  assert.equal(queue.pending, true);
  assert.equal((await repo.getState()).events.length, 0);
  const optimistic = optimisticWallRatings(before, wordMap(before), operations);
  assert.deepEqual([...optimistic.ratings], words.map(word => [word, 'remembered']));
  assert.equal(optimistic.canUndo, true);
  blocked.resolve();
  const saved = await Promise.all(results);
  const after = await repo.getState();
  assert.equal(queue.pending, false);
  assert.deepEqual(chronological(after).map(event => event.id), saved.map(event => event.id));
  assert.deepEqual(after.vocabulary.map(wordRating), words.map(() => 'remembered'));
});

test('the failed middle save rolls back one overlay and never cancels surrounding marks', async () => {
  const { repo, storage, queue } = await setup();
  const before = await repo.getState();
  const operations = words.map(word => mark(word, 'partial'));
  let overlay = [...operations];
  const results = operations.map((operation, index) => queue.enqueue(async () => {
    if (index === 4) storage.failNext = true;
    return saveMark(repo, operation);
  }).catch(error => {
    overlay = overlay.filter(item => item !== operation);
    throw error;
  }));
  const saved = await Promise.allSettled(results);
  assert.equal(queue.pending, false);
  assert.deepEqual(saved.map(result => result.status), words.map((_, i) => i === 4 ? 'rejected' : 'fulfilled'));
  const visible = optimisticWallRatings(before, wordMap(before), overlay).ratings;
  assert.equal(visible.has(words[4]), false);
  assert.deepEqual([...visible.keys()], words.filter((_, i) => i !== 4));
  const after = await repo.getState();
  assert.equal(after.events.length, 9);
  assert.deepEqual(after.vocabulary.map(wordRating), words.map((_, i) => i === 4 ? 'unrated' : 'partial'));
});

test('undo requested while a correction is waiting targets that correction and previews the prior rating', async () => {
  const { repo, queue } = await setup();
  const first = await repo.rate(['abate'], 'remembered');
  const before = await repo.getState();
  const blocked = Promise.withResolvers();
  const pending = mark('abate', 'forgotten');
  const rate = queue.enqueue(async () => {
    await blocked.promise;
    return saveMark(repo, pending);
  });
  const undo = queue.enqueue(() => repo.undoQuickReview());
  const preview = optimisticWallRatings(before, wordMap(before), [pending, { kind: 'undo' }]);
  assert.equal(preview.ratings.get('abate'), 'remembered');
  assert.equal(preview.canUndo, true);
  blocked.resolve();
  const [replacement, reverted] = await Promise.all([rate, undo]);
  assert.equal(reverted.payload.target_id, replacement.id);
  const after = await repo.getState();
  assert.equal(wordRating(wordMap(after).get('abate')), 'remembered');
  assert.equal(after.undoId, first.id);
});

test('a reading flush between two marks sees the earlier mark and closes that round once', async () => {
  const { repo, queue } = await setup();
  const draft = createCardReadingDraft();
  draft.record('abate', now().toISOString());
  const blocked = Promise.withResolvers();
  const first = queue.enqueue(async () => {
    await blocked.promise;
    return repo.rate(['abate'], 'partial');
  });
  const flush = queue.enqueue(async () => {
    const saved = await repo.getState();
    const live = wordMap(saved);
    const batches = draft.prepareAll(word => wordRating(live.get(word)));
    await repo.finishWallRound({ batches, expectedRoundId: saved.quickRound.id });
    draft.commitAll();
  });
  const next = queue.enqueue(() => repo.rate(['abate'], 'remembered'));
  blocked.resolve();
  const [previous, , subsequent] = await Promise.all([first, flush, next]);
  assert.notEqual(subsequent.payload.session_id, previous.payload.session_id);
  const after = await repo.getState();
  assert.deepEqual(chronological(after).map(event => event.kind), ['vocab_quick_review', 'vocab_card_reading', 'vocab_quick_review']);
  assert.equal(after.events.find(event => event.kind === 'vocab_card_reading').payload.items[0].impression, 'partial');
  assert.equal(wordRating(wordMap(after).get('abate')), 'remembered');
  assert.equal(draft.hasPending(), false);
});

test('retrying the same queued operation ID adds only one event', async () => {
  const { repo, queue } = await setup();
  const operation = mark('abate', 'forgotten');
  const [first, retry] = await Promise.all([
    queue.enqueue(() => saveMark(repo, operation)),
    queue.enqueue(() => saveMark(repo, operation)),
  ]);
  assert.deepEqual(retry, first);
  assert.deepEqual((await repo.getState()).events.map(event => event.id), [operation.id]);
});
