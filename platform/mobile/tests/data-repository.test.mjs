import test from 'node:test';
import assert from 'node:assert/strict';
import { openRepository, emptyData } from '../src/data/repository.mjs';
import { validateData, projectState, MAX_FILE_BYTES } from '../src/data/model.mjs';
import { createPackage, readPackage, digest, SEED_FORMAT } from '../src/data/packages.mjs';

function memory() {
  return { kind: 'memory', value: null, fail: false, writes: 0, async read() { return this.value; }, async write(value) { if (this.fail) throw Error('disk full'); this.value = value; this.writes++; } };
}
function fixture(extra = []) {
  const data = emptyData('Asia/Kuala_Lumpur');
  data.baseline.vocabulary = [{ word: 'lucid', meaning: '清晰的', pos: 'adj.', note: '' }, { word: 'abate', meaning: '减少', pos: 'v.', note: '' }, { word: 'verve', meaning: '活力', pos: 'n.', note: '' }, { word: 'flair', meaning: '天赋', pos: 'n.', note: '' }, ...extra];
  data.baseline.relations = { topics: [{ id: 'expression', name: '表达', words: ['lucid'] }], groups: [{ id: 'contrast', type: 'antonym', title: '示例对照', note: '仅测试数据', members: [{ word: 'lucid', usage: '', example: '' }, { word: 'abate', usage: '', example: '' }], source: 'coach_draft', sources: [] }] };
  return validateData(data);
}
async function setup(seed = fixture()) {
  const storage = memory(), clock = { value: new Date('2026-10-12T01:00:00Z') };
  const repo = await openRepository({ storage, seed, now: () => clock.value });
  return { storage, clock, repo };
}
const item = (state, word = 'lucid') => state.spacedReview.items.find(i => i.word === word);
const word = (state, name = 'lucid') => state.vocabulary.find(w => w.word === name);
async function reseal(packet) { packet.checksum.value = await digest(packet.payload); return JSON.stringify(packet); }

test('first open stores a raw baseline, not phantom recalls; reopening ignores a changed seed', async () => {
  const { repo, storage, clock } = await setup();
  assert.equal((await repo.getState()).vocabulary.length, 4);
  assert.equal(item(await repo.getState()).platform_count, 0);
  await repo.rate(['lucid'], 'remembered');
  const reopened = await openRepository({ storage, seed: emptyData(), now: () => clock.value });
  assert.equal(word(await reopened.getState()).recalls.length, 1);
  assert.equal((await reopened.getState()).vocabulary.length, 4);
});

test('same-round corrections keep one recall and undo restores previous schedule', async () => {
  const { repo } = await setup();
  const first = await repo.rate(['lucid'], 'remembered');
  const second = await repo.rate(['lucid'], 'forgotten');
  let state = await repo.getState();
  assert.equal(word(state).recalls.length, 1);
  assert.equal(item(state).platform_count, 1);
  assert.equal(item(state).last_result, 'forgotten');
  assert.equal(item(state).last_at, first.recorded_at);
  await repo.undoQuickReview();
  state = await repo.getState();
  assert.equal(state.events[0].target_id, second.id);
  assert.equal(item(state).last_result, 'remembered');
  assert.equal(item(state).due_date, '2026-10-13');
  await repo.undoQuickReview();
  assert.equal(item(await repo.getState()).platform_count, 0);
});

test('a batch is atomic and repeated operation ids are idempotent', async () => {
  const { repo } = await setup(), id = crypto.randomUUID(), round = (await repo.getState()).quickRound;
  const payload = { session_id: round.id, items: [{ word: 'lucid', self_rating: 'partial' }, { word: 'abate', self_rating: 'remembered' }] };
  await repo.saveEvent('vocab_quick_review', payload, id);
  await repo.saveEvent('vocab_quick_review', payload, id);
  assert.equal((await repo.getState()).events.length, 1);
  await assert.rejects(repo.saveEvent('vocab_quick_review', { ...payload, items: [{ word: 'lucid', self_rating: 'forgotten' }] }, id), /编号/);
  await assert.rejects(repo.rate(['lucid', 'missing'], 'remembered'), /未保存/);
  assert.equal((await repo.getState()).events.length, 1);
});

test('new learning day opens a different round and uses shared due-date rules', async () => {
  const { repo, clock } = await setup();
  const first = await repo.rate(['lucid'], 'remembered');
  clock.value = new Date('2026-10-13T01:00:00Z');
  const second = await repo.rate(['lucid'], 'remembered');
  assert.notEqual(first.payload.session_id, second.payload.session_id);
  const state = await repo.getState();
  assert.equal(item(state).platform_count, 2);
  assert.equal(item(state).review_count, 1);
  assert.equal(item(state).due_date, '2026-10-15');
});

test('explicit same-day new round records exposure without advancing the interval', async () => {
  const { repo } = await setup();
  await repo.rate(['lucid'], 'remembered');
  await repo.startQuickRound();
  await repo.rate(['lucid'], 'remembered');
  const state = await repo.getState();
  assert.equal(item(state).platform_count, 2);
  assert.equal(item(state).due_date, '2026-10-13');
});

test('a failed native/IDB transaction leaves UI projection and stored document unchanged', async () => {
  const { repo, storage } = await setup(), before = storage.value;
  storage.fail = true;
  await assert.rejects(repo.rate(['lucid'], 'remembered'), /disk full/);
  assert.equal(storage.value, before);
  assert.equal((await repo.getState()).events.length, 0);
  storage.fail = false;
  await repo.rate(['lucid'], 'remembered');
  assert.equal((await repo.getState()).events.length, 1);
});

test('queued mutations preserve both operations and settings are durable', async () => {
  const { repo, storage, clock } = await setup();
  await Promise.all([repo.rate(['lucid'], 'remembered'), repo.rate(['abate'], 'partial'), repo.setSettings({ display: { columns: 3 }, wallPage: 2 })]);
  const reopened = await openRepository({ storage, now: () => clock.value });
  assert.equal((await reopened.getState()).events.length, 2);
  assert.equal((await reopened.getState()).settings.wallPage, 2);
});

test('complete backup round-trip is lossless, preserves ids, and does not replay counts twice', async () => {
  const { repo } = await setup();
  await repo.rate(['lucid', 'abate'], 'partial');
  await repo.rate(['lucid'], 'forgotten');
  await repo.undoQuickReview();
  await repo.setSettings({ display: { columns: 4 } });
  const backup = await repo.backup();
  const target = await setup(emptyData());
  await target.repo.restore(backup);
  assert.equal(await target.repo.backup(), backup);
  assert.equal(item(await target.repo.getState()).platform_count, 1);
  assert.equal((await target.repo.getState()).hasRecovery, true);
  const reopened = await openRepository({ storage: target.storage, now: () => target.clock.value });
  assert.equal(await reopened.backup(), backup);
  await reopened.restorePrevious();
  assert.equal((await reopened.getState()).vocabulary.length, 0);
  assert.equal(JSON.parse(target.storage.value).recovery.recovery, undefined);
});

test('failed restore preserves both current data and previous recovery snapshot', async () => {
  const a = await setup(), b = await setup(emptyData());
  await a.repo.rate(['lucid'], 'remembered');
  await a.repo.restore(await b.repo.backup());
  const before = a.storage.value;
  a.storage.fail = true;
  await assert.rejects(a.repo.restorePrevious(), /disk full/);
  assert.equal(a.storage.value, before);
  assert.equal((await a.repo.getState()).hasRecovery, true);
});

test('vocabulary import adds only new content, never replaces progress or existing definitions', async () => {
  const phone = await setup(), incoming = await setup(fixture([{ word: 'pellucid', meaning: '清澈的', pos: 'adj.', note: '' }]));
  await phone.repo.rate(['lucid'], 'remembered');
  await incoming.repo.saveEvent('vocab_upsert', { word: 'lucid', meaning: '新的冲突释义', pos: 'adj.', note: '' });
  await incoming.repo.rate(['lucid', 'pellucid'], 'forgotten');
  const packet = await incoming.repo.backup(), before = (await phone.repo.getState()).events;
  const preview = await phone.repo.previewImport(packet);
  assert.equal(preview.newWords, 1);
  assert.equal(preview.conflicts.find(c => c.word === 'lucid').incoming, '新的冲突释义');
  await phone.repo.importVocabulary(packet);
  let state = await phone.repo.getState();
  assert.equal(word(state).meaning, '清晰的');
  assert.equal(item(state).last_result, 'remembered');
  assert.equal(word(state, 'pellucid').recalls.length, 0);
  assert.deepEqual(state.events, before);
  assert.equal((await phone.repo.previewImport(packet)).newWords, 0);
  await phone.repo.importVocabulary(packet);
  state = await phone.repo.getState();
  assert.equal(state.vocabulary.length, 5);
  assert.deepEqual(state.events, before);
});

test('seed files allow content import but cannot replace progress via restore', async () => {
  const { repo, storage } = await setup(), before = storage.value;
  const seed = await createPackage(fixture(), SEED_FORMAT);
  assert.equal((await repo.previewImport(seed)).canRestore, false);
  await assert.rejects(repo.restore(seed), /完整备份/);
  assert.equal(storage.value, before);
});

test('invalid JSON, unknown versions and damaged checksum cannot overwrite anything', async () => {
  const { repo, storage } = await setup(), before = storage.value;
  await assert.rejects(repo.restore('{broken'), /JSON/);
  const packet = JSON.parse(await repo.backup());
  packet.version = 99;
  await assert.rejects(repo.restore(JSON.stringify(packet)), /兼容/);
  packet.version = 1; packet.payload.baseline.vocabulary[0].meaning = 'tampered';
  await assert.rejects(repo.restore(JSON.stringify(packet)), /校验/);
  assert.equal(storage.value, before);
});

test('valid checksum is not a substitute for full schema and reference validation', async () => {
  const { repo, storage } = await setup();
  await repo.rate(['lucid'], 'remembered');
  const before = storage.value, backup = await repo.backup();
  for (const mutate of [
    p => { p.payload.events.push({ ...p.payload.events[0], payload: { ...p.payload.events[0].payload, items: [{ word: 'lucid', self_rating: 'forgotten' }] } }); },
    p => { p.payload.events[0].payload.items[0].word = 'unknown'; },
    p => { p.payload.events[0].kind = 'attempt'; },
    p => { p.payload.baseline.relations.groups[0].members[0].word = 'unknown'; },
    p => { p.payload.baseline.legacyWords = [{ word: 'lucid', review_count: -1, records: [], last_day: '2026-10-01' }]; },
    p => { p.payload.schema_version = 500; },
  ]) {
    const packet = JSON.parse(backup); mutate(packet);
    await assert.rejects(repo.restore(await reseal(packet)));
    assert.equal(storage.value, before);
  }
});

test('a backup cannot contain a projection and its evidence together', async () => {
  const data = fixture(); data.baseline.vocabulary[0].recalls = [{ self_rating: 'remembered' }];
  assert.throws(() => validateData(data), /基线不得包含/);
});

test('oversized input is rejected before parsing or writing', async () => {
  const { repo, storage } = await setup(), before = storage.value;
  await assert.rejects(repo.restore(' '.repeat(MAX_FILE_BYTES + 1)), /20 MB/);
  assert.equal(storage.value, before);
});

test('corrupt or future local databases are not silently overwritten with the bundled seed', async () => {
  const storage = memory(); storage.value = '{broken';
  await assert.rejects(openRepository({ storage, seed: fixture() }), /本机数据无法读取/);
  assert.equal(storage.value, '{broken');
  storage.value = JSON.stringify({ storage_version: 2, current: fixture() });
  await assert.rejects(openRepository({ storage, seed: fixture() }), /数据库版本/);
  assert.equal(storage.writes, 0);
});

test('multi-stage rounds resume from raw snapshots and settle exactly once', async () => {
  const { repo, storage, clock } = await setup();
  const event = await repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words: ['lucid'], meaning_passes: 2 });
  await repo.saveEvent('vocab_upsert', { word: 'lucid', meaning: '当前词义已改', pos: 'adj.', note: '' });
  let active = repo;
  for (const [i, stage] of ['meaning_1', 'meaning_2', 'cloze', 'spelling'].entries()) {
    const state = await active.getState(), session = state.vocabSessions[0], item = session.items[0];
    assert.equal(item.meaning, '清晰的');
    await active.saveEvent('vocab_drill', { session_id: session.session_id, word: 'lucid', stage, answer: 'lucid', result: 'correct', response_mode: stage.startsWith('meaning_') ? item.choices.length ? 'choice' : 'self_check' : 'typing' });
    if (i === 1) active = await openRepository({ storage, now: () => clock.value });
  }
  const recall = await active.saveEvent('vocab_recall', { session_id: event.payload.session_id, word: 'lucid', mode: 'multistage' });
  const retry = await active.saveEvent('vocab_recall', { session_id: event.payload.session_id, word: 'lucid', mode: 'multistage' });
  assert.equal(recall.id, retry.id);
  assert.equal((await active.getState()).vocabSessions[0].complete, true);
  assert.equal(item(await active.getState()).platform_count, 1);
  const backup = await active.backup();
  assert.equal(projectState((await readPackage(backup)).data, clock.value).vocabSessions[0].complete, true);
});

test('invalid multi-stage results and premature settlement are rejected', async () => {
  const { repo } = await setup();
  const e = await repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words: ['lucid'], meaning_passes: 1 });
  await assert.rejects(repo.saveEvent('vocab_recall', { session_id: e.payload.session_id, word: 'lucid', mode: 'multistage' }), /全部步骤/);
  await assert.rejects(repo.saveEvent('vocab_drill', { session_id: e.payload.session_id, word: 'lucid', stage: 'spelling', answer: 'lucid', result: 'correct', response_mode: 'typing' }), /顺序/);
  const current = (await repo.getState()).vocabSessions[0], choices = current.items[0].choices;
  if (choices.length) await assert.rejects(repo.saveEvent('vocab_drill', { session_id: e.payload.session_id, word: 'lucid', stage: 'meaning_1', answer: choices.find(c => c.word !== 'lucid').word, result: 'correct', response_mode: 'choice' }), /核对/);
  assert.equal((await repo.getState()).vocabDrills.length, 0);
});

test('topic deletion/restoration and legacy review baselines survive backup', async () => {
  const seed = fixture(); seed.baseline.legacyWords = [{ word: 'lucid', review_count: 5, last_day: '2026-10-10', records: ['vocab/homework/legacy.md'] }];
  const { repo, clock } = await setup(seed);
  await repo.saveEvent('topic_delete', { id: 'expression' });
  await repo.rate(['lucid'], 'remembered');
  const data = (await readPackage(await repo.backup())).data, state = projectState(data, clock.value);
  assert.equal(state.relations.topics[0].deleted, true);
  assert.equal(state.relations.assignments.find(a => a.word === 'lucid').topics.length, 0);
  assert.equal(item(state).review_count, 6);
  assert.equal(item(state).legacy_review_count, 5);
  assert.equal(item(state).platform_count, 1);
});
