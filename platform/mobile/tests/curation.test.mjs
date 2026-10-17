import test from 'node:test';
import assert from 'node:assert/strict';
import { openRepository, emptyData } from '../src/data/repository.mjs';
import { validateData, projectState } from '../src/data/model.mjs';
import { readPackage } from '../src/data/packages.mjs';
import { updateCatalog } from '../src/data/catalog-update.mjs';
import { filterEntries, emptyFilters, normalizeFilters } from '../src/model.mjs';

const now = () => new Date('2026-10-18T00:00:00Z');
function memory() { return { value: null, fail: false, async read() { return this.value; }, async write(value) { if (this.fail) throw Error('disk full'); this.value = value; } }; }
function fixture() {
  const data = emptyData();
  data.baseline.vocabulary = [{ word: 'abate', meaning: '减轻', pos: 'v.' }, { word: 'blank', meaning: '' }, { word: 'hidden', meaning: '', deleted: true }];
  data.baseline.legacyWords = [{ word: 'abate', review_count: 3, last_day: '2026-10-15', records: ['test'] }];
  return validateData(data);
}
async function setup() { const storage = memory(); return { storage, repo: await openRepository({ storage, seed: fixture(), now }) }; }
function learning(state) {
  return Object.fromEntries(['vocabulary', 'relations', 'spacedReview', 'vocabSessions', 'vocabDrills', 'cardReadings', 'quickRound', 'undoId'].map(key => [key, state[key]]));
}

test('curation marks blank and defined words without changing content or learning, and repeat requests are no-ops', async () => {
  const { storage, repo } = await setup();
  await repo.rate(['abate'], 'partial');
  await repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words: ['abate'], meaning_passes: 1 });
  await repo.saveEvent('vocab_card_reading', { items: [{ word: 'abate', count: 2, viewed_at: '2026-10-17T23:00:00Z', impression: 'partial' }] });
  const before = await repo.getState();
  assert.deepEqual(await repo.requestCuration([' ABATE ', 'blank']), { added: 2 });
  const after = await repo.getState(), bytes = storage.value;
  assert.deepEqual(learning(after), learning(before));
  assert.deepEqual(after.curationRequests.map(item => item.word), ['abate', 'blank']);
  assert.deepEqual(await repo.requestCuration(['blank', 'abate']), { added: 0 });
  assert.equal(storage.value, bytes);
  assert.deepEqual((await repo.getState()).curationRequests, after.curationRequests);
  const reopened = await openRepository({ storage, seed: emptyData(), now });
  assert.deepEqual(await reopened.getState(), after);
});

test('requests survive backup, restore, word editing and catalog upgrade without being treated as completed', async () => {
  const { repo } = await setup();
  await repo.requestCuration(['blank', 'abate']);
  await repo.saveEvent('vocab_upsert', { word: 'blank', meaning: '新释义' });
  const backup = await repo.backup(), data = (await readPackage(backup)).data;
  const upgraded = updateCatalog(data, fixture(), 'curation-test-revision');
  assert.deepEqual(projectState(upgraded, now()).curationRequests, (await repo.getState()).curationRequests);
  assert.deepEqual(upgraded.events, data.events);
  const target = await setup();
  await target.repo.restore(backup);
  const reopened = await openRepository({ storage: target.storage, now });
  assert.deepEqual((await reopened.getState()).curationRequests, (await repo.getState()).curationRequests);
  assert.deepEqual((await readPackage(await reopened.backup())).data, data);
});

test('failed saves and invalid batches leave disk and state unchanged; concurrent duplicates are deduplicated', async () => {
  const { repo, storage } = await setup();
  for (const words of [[], ['abate', 'unknown'], ['abate', 'hidden'], ['abate', ' ABATE '], [null], new Array(1), ['abate', 4]]) {
    const bytes = storage.value, before = await repo.getState();
    await assert.rejects(repo.requestCuration(words));
    assert.equal(storage.value, bytes);
    assert.deepEqual(await repo.getState(), before);
  }
  const bytes = storage.value, before = await repo.getState();
  storage.fail = true;
  await assert.rejects(repo.requestCuration(['blank']), /disk full/);
  assert.equal(storage.value, bytes);
  assert.deepEqual(await repo.getState(), before);
  storage.fail = false;
  assert.deepEqual(await Promise.all([repo.requestCuration(['blank']), repo.requestCuration(['blank', 'abate'])]), [{ added: 1 }, { added: 1 }]);
  assert.equal((await repo.getState()).curationRequests.length, 2);
});

test('backup validation rejects unknown references and extra fields but retains requests for subsequently hidden words', async () => {
  const { repo } = await setup();
  await repo.requestCuration(['blank']);
  const data = (await readPackage(await repo.backup())).data;
  for (const payload of [{ words: ['unknown'] }, { words: ['hidden'] }, { words: ['blank'], completed: true }]) {
    const damaged = structuredClone(data); damaged.events[0].payload = payload;
    assert.throws(() => validateData(damaged));
  }
  await repo.saveEvent('vocab_delete', { word: 'blank' });
  const hidden = await readPackage(await repo.backup());
  assert.equal(projectState(hidden.data, now()).curationRequests[0].word, 'blank');
  assert.deepEqual(filterEntries(projectState(hidden.data, now()), { ...emptyFilters, scope: 'curation' }), []);
});

test('curation scope is explicit, intersects other filters and remains compatible with unmarked old data', async () => {
  const { repo } = await setup();
  assert.deepEqual((await repo.getState()).curationRequests, []);
  assert.deepEqual(normalizeFilters({ scope: 'curation' }).scope, 'curation');
  await repo.requestCuration(['blank', 'abate']);
  const state = await repo.getState();
  assert.deepEqual(filterEntries(state, { ...emptyFilters, scope: 'curation' }).map(item => item.word), ['abate', 'blank']);
  assert.deepEqual(filterEntries(state, { ...emptyFilters, scope: 'curation', query: 'blank' }).map(item => item.word), ['blank']);
  assert.equal(projectState(fixture(), now()).curationRequests.length, 0);
});
