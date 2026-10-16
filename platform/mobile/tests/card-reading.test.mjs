import test from 'node:test';
import assert from 'node:assert/strict';
import { openRepository, emptyData } from '../src/data/repository.mjs';
import { validateData, projectState } from '../src/data/model.mjs';
import { createPackage, readPackage } from '../src/data/packages.mjs';

const now = () => new Date('2026-10-17T01:00:00.000Z');
function memory() {
  return { kind: 'memory', value: null, fail: false, writes: 0, async read() { return this.value; }, async write(value) { if (this.fail) throw Error('disk full'); this.value = value; this.writes++; } };
}
function fixture() {
  const data = emptyData('Asia/Kuala_Lumpur');
  data.baseline.vocabulary = [{ word: 'lucid', meaning: '清晰的', pos: 'adj.' }, { word: 'abate', meaning: '减少', pos: 'v.' }, { word: 'pending', meaning: '' }, { word: 'hidden', meaning: 'hidden', deleted: true }];
  data.baseline.legacyWords = [{ word: 'lucid', review_count: 3, last_day: '2026-10-15', records: ['isolated-test'] }];
  return validateData(data);
}
async function setup() {
  const storage = memory(), repo = await openRepository({ storage, seed: fixture(), now });
  return { storage, repo };
}
function payload(word = 'lucid', count = 1, viewed_at = '2026-10-17T00:59:00.000Z', impression = null) {
  return { items: [{ word, count, viewed_at, impression }] };
}
function learning(state) {
  return { vocabulary: state.vocabulary, spacedReview: state.spacedReview, vocabSessions: state.vocabSessions, vocabDrills: state.vocabDrills, quickRound: state.quickRound, undoId: state.undoId };
}

test('card reading aggregates real openings and latest view time without changing learning evidence', async () => {
  const { repo, storage } = await setup();
  await repo.rate(['lucid'], 'partial');
  await repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words: ['abate'], meaning_passes: 1 });
  const before = await repo.getState(), rawBefore = JSON.parse(storage.value).current;
  const id = crypto.randomUUID(), batch = payload('lucid', 2);
  const first = await repo.saveEvent('vocab_card_reading', batch, id);
  const retry = await repo.saveEvent('vocab_card_reading', batch, id);
  assert.deepEqual(retry, first);
  await repo.saveEvent('vocab_card_reading', payload('lucid', 1, '2026-10-17T00:50:00.000Z'));
  await repo.saveEvent('vocab_card_reading', payload('pending', 1, '2026-10-17T00:58:00.000Z'));
  const after = await repo.getState(), rawAfter = JSON.parse(storage.value).current;
  assert.deepEqual(after.cardReadings, [
    { word: 'lucid', view_count: 3, last_viewed_at: '2026-10-17T00:59:00.000Z', impression: 'partial' },
    { word: 'pending', view_count: 1, last_viewed_at: '2026-10-17T00:58:00.000Z', impression: null },
  ]);
  assert.deepEqual(learning(after), learning(before));
  assert.deepEqual(rawAfter.events.filter(e => e.kind !== 'vocab_card_reading'), rawBefore.events);
  assert.deepEqual(rawAfter.baseline, rawBefore.baseline);
  assert.equal(rawAfter.events.filter(e => e.kind === 'vocab_card_reading').length, 3);
  await assert.rejects(repo.saveEvent('vocab_card_reading', payload('lucid', 5), id), /编号/);
});

test('reading history survives reopening, backup restoration and later word removal', async () => {
  const { repo, storage } = await setup();
  await repo.saveEvent('vocab_card_reading', payload('lucid', 2, '2026-10-17T08:59:00+08:00', 'remembered'));
  await repo.saveEvent('vocab_delete', { word: 'lucid' });
  const before = await repo.getState(), original = JSON.parse(storage.value).current;
  const reopened = await openRepository({ storage, seed: emptyData(), now });
  assert.deepEqual(await reopened.getState(), before);
  const backup = await reopened.backup();
  assert.deepEqual((await readPackage(backup)).data, original);
  const otherStorage = memory(), other = await openRepository({ storage: otherStorage, seed: emptyData(), now });
  await other.restore(backup);
  const restored = await openRepository({ storage: otherStorage, now });
  const result = await restored.getState();
  assert.deepEqual(result.cardReadings, before.cardReadings);
  assert.deepEqual(learning(result), learning(before));
  assert.deepEqual(JSON.parse(otherStorage.value).current, original);
  assert.equal(result.cardReadings[0].last_viewed_at, '2026-10-17T00:59:00.000Z');
});

test('failed card reading save leaves disk and in-memory state unchanged; retry is safe', async () => {
  const { repo, storage } = await setup();
  const before = await repo.getState(), bytes = storage.value, writes = storage.writes, id = crypto.randomUUID();
  storage.fail = true;
  await assert.rejects(repo.saveEvent('vocab_card_reading', payload(), id), /disk full/);
  assert.equal(storage.value, bytes);
  assert.equal(storage.writes, writes);
  assert.deepEqual(await repo.getState(), before);
  storage.fail = false;
  await repo.saveEvent('vocab_card_reading', payload(), id);
  await repo.saveEvent('vocab_card_reading', payload(), id);
  assert.equal((await repo.getState()).cardReadings[0].view_count, 1);
});

test('invalid card reading batches reject all fields and references atomically', async () => {
  const { repo, storage } = await setup();
  const item = payload().items[0];
  const invalid = [
    { items: [] }, { items: new Array(1) }, { ...payload(), page: 3 },
    { items: [{ ...item, assessment: 'mastered' }] },
    { items: [item, { ...item, word: ' LUCID ' }] },
    ...[0, -1, 1.5, '1', NaN, Infinity, 10000001].map(count => payload('lucid', count)),
    ...['unknown', 'hidden'].map(word => ({ items: [item, { ...item, word }] })),
    ...['unrated', 'mastered', undefined, 0].map(impression => ({ items: [{ ...item, impression }] })),
    ...['not-a-date', '2026-10-17', '2026-10-17T00:00:00', '2026-10-18T00:00:00Z', '2026-02-30T00:00:00Z', '2026-10-16T24:00:00Z'].map(at => payload('lucid', 1, at)),
    JSON.parse('{"items":[],"__proto__":{"polluted":true}}'),
    { items: [Object.assign(Object.create({ hostile: true }), item)] },
  ];
  for (const batch of invalid) {
    const bytes = storage.value, state = await repo.getState(), writes = storage.writes;
    await assert.rejects(repo.saveEvent('vocab_card_reading', batch));
    assert.equal(storage.value, bytes);
    assert.equal(storage.writes, writes);
    assert.deepEqual(await repo.getState(), state);
  }
  assert.equal({}.polluted, undefined);
});

test('live impression follows rating corrections and undo without resurrecting a removed rating', async () => {
  const { repo } = await setup();
  await repo.saveEvent('vocab_card_reading', payload('abate', 1, '2026-10-17T00:50:00Z', 'partial'));
  assert.equal((await repo.getState()).cardReadings[0].impression, 'partial');
  await repo.rate(['abate'], 'remembered');
  await repo.saveEvent('vocab_card_reading', payload('abate', 1, '2026-10-17T00:59:00Z', 'remembered'));
  assert.equal((await repo.getState()).cardReadings[0].impression, 'remembered');
  await repo.rate(['abate'], 'forgotten');
  assert.equal((await repo.getState()).cardReadings[0].impression, 'forgotten');
  await repo.undoQuickReview();
  assert.equal((await repo.getState()).cardReadings[0].impression, 'remembered');
  await repo.undoQuickReview();
  const after = await repo.getState();
  assert.equal(after.cardReadings[0].impression, null);
  assert.equal(after.cardReadings[0].view_count, 2);
  assert.equal(after.vocabulary.find(w => w.word === 'abate').recalls.length, 0);
});

test('old packages remain unchanged and new reading references are validated during import', async () => {
  const data = fixture(), old = await createPackage(data);
  assert.deepEqual((await readPackage(old)).data, data);
  assert.deepEqual(projectState(data).cardReadings, []);
  assert(!Object.hasOwn(data, 'cardReadings'));
  const { repo, storage } = await setup();
  await repo.saveEvent('vocab_card_reading', payload());
  const recorded = JSON.parse(storage.value).current;
  for (const update of [
    value => { value.events[0].payload.items[0].word = 'unknown'; },
    value => { value.events[0].payload.items[0].viewed_at = '2026-10-18T00:00:00Z'; },
    value => { value.events[0].payload.items[0].count = 0; },
  ]) {
    const damaged = structuredClone(recorded); update(damaged);
    assert.throws(() => validateData(damaged));
  }
});
