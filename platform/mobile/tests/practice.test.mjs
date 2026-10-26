import test from 'node:test';
import assert from 'node:assert/strict';
import { openPracticeRepository } from '../src/practice/repository.mjs';
import { answerReady, selectAnswer, serializedAnswer, gradeAnswer, questionKey, sha256 } from '../src/practice/model.mjs';
import { loadPracticeBank } from '../src/practice/loader.mjs';

function fixture() {
  const bank = { format: 'gre-practice-bank', version: 1, revision: 'one', history: 'history.json', catalog: Object.fromEntries(['se', 'tc', 'rc', 'quant'].map(type => [type, { questions: [] }])) };
  const details = new Map();
  function add(type, question, extra = {}) {
    const q = { material: 'fixture', unit: `${type}-unit`, question, type, content_id: `${type}-${question}`, mode: 'single', letters: ['A', 'B', 'C'], options: ['one', 'two', 'three'], groups: [], sentences: [], passageImages: [], native: true, source: 'Isolated test fixture', ...extra };
    q.key = questionKey(q);
    details.set(q.key, q);
    bank.catalog[type].questions.push({ ...q, detail: `questions/${type}-${question}.json`, unitLabel: 'Unit', materialLabel: 'Fixture' });
    return q;
  }
  const a = add('se', '1', { mode: 'pair', letters: ['A', 'B', 'C', 'D', 'E', 'F'], answerKey: { answer: 'A/C', answer_source: 'user_provided', source_ref: 'fixture/reference', event_id: 'key-fixture' } });
  const duplicate = add('se', '2', { mode: 'pair', letters: a.letters, content_id: a.content_id });
  const b = add('tc', '1', { mode: 'blanks', letters: ['A', 'B', 'C', 'D', 'E', 'F'], groups: [['A', 'B', 'C'], ['D', 'E', 'F']], answerKey: { answer: 'B/E', answer_source: 'user_provided', source_ref: 'fixture' } });
  const c = add('quant', '1', { mode: 'entry', letters: [], answerKey: null });
  const sentence = add('rc', '1', { mode: 'sentence', letters: [], sentences: ['Sentence one.', 'Sentence two.'] });
  return { bank, a, b, c, duplicate, sentence, loadQuestion: async meta => details.get(meta.key), history: { events: [], legacy: [] } };
}
function memory(value = null) {
  return { value, writes: 0, fail: false, async read() { return this.value; }, async write(next) { if (this.fail) throw Error('isolated disk full'); this.value = next; this.writes++; } };
}
function options(data, storage, prefix = 'local') {
  let id = 0, time = 0;
  return { ...data, storage, makeId: () => `${prefix}-${++id}`, now: () => new Date(Date.UTC(2026, 9, 21, 0, 0, time++)) };
}
function attempt(id, q, answer, date = '2026-10-20T08:00:00Z') {
  return { schema_version: 1, id, kind: 'attempt', recorded_at: date, payload: { material: q.material, unit: q.unit, question: q.question, type: q.type, answer } };
}

test('all answer modes reject invalid labels/duplicate blanks and preserve ordered TC answers', () => {
  const f = fixture();
  assert.equal(answerReady(f.a, ['A', 'A']), false);
  assert.equal(answerReady(f.a, ['A', 'X']), false);
  assert.equal(answerReady(f.a, ['A', 'C']), true);
  assert.deepEqual(selectAnswer(f.a, ['A', 'C'], 'D'), ['A', 'C']);
  assert.deepEqual(selectAnswer(f.b, ['A', 'E'], 'B'), ['E', 'B']);
  assert.equal(answerReady(f.b, ['A', 'B']), false);
  assert.equal(answerReady(f.b, ['E', 'B']), true);
  assert.equal(serializedAnswer(f.b, ['E', 'B']), 'B/E');
  assert.equal(gradeAnswer('C/A', f.a.answerKey, f.a), true);
  assert.equal(gradeAnswer('E/B', f.b.answerKey, f.b), false);
  assert.equal(answerReady(f.sentence, ['Invented sentence']), false);
  assert.equal(answerReady(f.sentence, ['Sentence one.']), true);
  assert.equal(answerReady({ ...f.sentence, native: false }, ['Sentence one.']), false);
  assert.equal(gradeAnswer('1/2', { answer: '0.5' }, f.c), true);
  assert.equal(gradeAnswer('0', null, f.c), null);
});

test('partially extracted PDF labels use exact original-answer text without inventing options', () => {
  const single = { type: 'quant', mode: 'single', letters: ['A', 'C', 'E'], answerInput: 'text', answerKey: null };
  assert.equal(answerReady(single, ['B']), true);
  assert.deepEqual(selectAnswer(single, ['A'], 'B'), ['B']);
  assert.equal(serializedAnswer(single, ['B']), 'B');
  assert.equal(gradeAnswer('B', null, single), null);
  const multiple = { ...single, mode: 'multiple' };
  assert.equal(answerReady(multiple, ['B/D']), true);
  assert.equal(serializedAnswer(multiple, ['B/D']), 'B/D');
  assert.equal(answerReady(multiple, ['B', 'D']), false);
  assert.equal(answerReady(multiple, [' ']), false);
});

test('original IDs and legacy sources remain immutable, shared content does not create attempts', async () => {
  const f = fixture(), storage = memory();
  f.history.events.push(attempt('old', f.a, 'C/A'), attempt('new', f.a, 'A/C', '2026-10-20T20:00:00Z'));
  f.history.legacy.push({ ...f.b, record: 'verbal/submissions/fixture.md', recorded_at: '2026-10-20T12:00:00+08:00' });
  const repo = await openPracticeRepository(options(f, storage));
  const state = await repo.getState(), writes = storage.writes;
  assert.equal(state.stats.attemptCount, 2);
  assert.equal(state.stats.completedCount, 2);
  assert.equal(state.catalog.se.questions[1].sameContentDone, true);
  assert.equal(state.catalog.se.questions[1].submitted, false);
  assert.equal((await repo.loadQuestion(f.a.key)).history.count, 2);
  assert.equal((await repo.loadQuestion(f.b.key)).history.count, null);
  assert.equal((await repo.loadQuestion(f.duplicate.key)).history, null);
  assert.equal(storage.writes, writes);
  assert.deepEqual(JSON.parse(storage.value).events, f.history.events);
  await assert.rejects(repo.saveDraft(f.a.key, ['A', 'C']), /重做/);
  await assert.rejects(repo.saveDraft(f.duplicate.key, ['A', 'C']), /重做/);
  await repo.startRedo(f.duplicate.key);
  await repo.saveDraft(f.duplicate.key, ['A', 'C']);
  await repo.submit(f.duplicate.key);
  assert.equal((await repo.getState()).stats.attemptCount, 3);
});

test('queued writes, restart, double submit, explicit redo and no-op upgrades retain history', async () => {
  const f = fixture(), storage = memory(), opts = options(f, storage);
  const repo = await openPracticeRepository(opts);
  await Promise.all([repo.saveDraft(f.b.key, ['A']), repo.saveDraft(f.b.key, ['A', 'D']), repo.saveDraft(f.b.key, ['B', 'E'])]);
  assert.deepEqual((await repo.loadQuestion(f.b.key)).draft.answer, ['B', 'E']);
  const reopened = await openPracticeRepository(opts), count = storage.writes;
  assert.deepEqual((await reopened.loadQuestion(f.b.key)).draft.answer, ['B', 'E']);
  assert.equal(storage.writes, count);
  const [one, two] = await Promise.all([reopened.submit(f.b.key), reopened.submit(f.b.key)]);
  assert.equal(one.id, two.id);
  assert.equal(one.payload.answer, 'B/E');
  assert.equal(one.practice.result, true);
  assert.equal(one.practice.answerKey.answer_source, 'user_provided');
  assert.equal(one.payload.duration_seconds, null);
  assert.equal((await reopened.getState()).stats.attemptCount, 1);
  await reopened.startRedo(f.b.key);
  await reopened.saveDraft(f.b.key, ['A', 'D']);
  await reopened.submit(f.b.key);
  assert.equal((await reopened.loadQuestion(f.b.key)).history.count, 2);
  assert.equal((await reopened.loadQuestion(f.b.key)).draft, null);
  const before = JSON.parse(storage.value).events;
  const upgraded = await openPracticeRepository({ ...opts, bank: { ...f.bank, revision: 'two' } });
  assert.deepEqual(JSON.parse(storage.value).events, before);
  assert.equal((await upgraded.getState()).stats.attemptCount, 2);
});

test('failed writes do not update memory, successful retry commits once and queues recover', async () => {
  const f = fixture(), storage = memory(), repo = await openPracticeRepository(options(f, storage));
  const original = storage.value;
  storage.fail = true;
  await assert.rejects(repo.saveDraft(f.c.key, ['17']), /disk full/);
  assert.equal(storage.value, original);
  assert.equal((await repo.getState()).stats.draftCount, 0);
  storage.fail = false;
  await repo.saveDraft(f.c.key, ['17']);
  const draftValue = storage.value;
  storage.fail = true;
  await assert.rejects(repo.submit(f.c.key), /disk full/);
  assert.equal(storage.value, draftValue);
  assert.equal((await repo.getState()).stats.attemptCount, 0);
  storage.fail = false;
  const saved = await repo.submit(f.c.key);
  assert.equal(saved.practice.result, null);
  assert.equal((await repo.getState()).stats.attemptCount, 1);
});

test('backup merge is idempotent, preserves active local draft and conflicts fail atomically', async () => {
  const f = fixture(), localStorage = memory(), remoteStorage = memory();
  const local = await openPracticeRepository(options(f, localStorage, 'here'));
  const remote = await openPracticeRepository(options(f, remoteStorage, 'there'));
  await local.saveDraft(f.c.key, ['18']);
  await remote.saveDraft(f.c.key, ['19']);
  await remote.saveDraft(f.b.key, ['B', 'E']);
  await remote.submit(f.b.key);
  const backup = await remote.backup(), preview = await local.previewImport(backup);
  assert.equal(preview.newEvents, 1);
  assert.equal(preview.conflicts.length, 0);
  await local.importBackup(backup);
  assert.deepEqual((await local.loadQuestion(f.c.key)).draft.answer, ['18']);
  assert.equal((await local.getState()).stats.attemptCount, 1);
  assert.equal(JSON.parse(localStorage.value).drafts.length, 3);
  const bytes = localStorage.value, writes = localStorage.writes;
  await local.importBackup(backup);
  assert.equal(localStorage.value, bytes);
  assert.equal(localStorage.writes, writes);
  const bad = JSON.parse(backup);
  bad.payload.events[0].payload.answer = 'A/D';
  bad.checksum.value = await sha256(bad.payload);
  const conflict = await local.previewImport(JSON.stringify(bad));
  assert.equal(conflict.canMerge, false);
  await assert.rejects(local.importBackup(JSON.stringify(bad)), /同 ID/);
  assert.equal(localStorage.value, bytes);
  await assert.rejects(local.importBackup(backup.replace('"version":1', '"version":2')), /请选择刷题备份/);
});

test('bundled history conflicts stop startup without touching stored bytes', async () => {
  const f = fixture(), storage = memory();
  f.history.events.push(attempt('original', f.a, 'A/C'));
  await openPracticeRepository(options(f, storage));
  const original = storage.value;
  const history = structuredClone(f.history); history.events[0].payload.answer = 'A/D';
  await assert.rejects(openPracticeRepository({ ...options(f, storage), bank: { ...f.bank, revision: 'new' }, history }), /同 ID/);
  assert.equal(storage.value, original);
});

test('mobile bundled history retains submitted draft revisions and current local preferences and active drafts across upgrades', async () => {
  const f = fixture();
  f.history.events.push(attempt('desktop-original',f.a,'A/C'));
  const remoteStorage = memory(), remote = await openPracticeRepository(options(f,remoteStorage,'remote'));
  await remote.saveDraft(f.b.key,['A']);
  await remote.saveDraft(f.b.key,['B','E']);
  const submission = await remote.submit(f.b.key);
  const remoteDraft = await remote.saveDraft(f.c.key,['19']);
  await remote.savePreferences({type:'tc',split:70,readingSize:22,activeKey:f.b.key});
  const remoteData = JSON.parse(remoteStorage.value);
  const history = {events:remoteData.events,legacy:remoteData.legacy,drafts:remoteData.drafts,draft_heads:remoteData.draft_heads};
  const storage = memory(), repo = await openPracticeRepository(options(f,storage,'local'));
  const localDraft = await repo.saveDraft(f.c.key,['18']);
  await repo.savePreferences({type:'quant',split:35,readingSize:17,activeKey:f.c.key,passagePositions:{fixture:120}});
  const before = JSON.parse(storage.value), bank = {...f.bank,revision:'bundled-mobile-history'};
  const upgraded = await openPracticeRepository({...options(f,storage),bank,history});
  const after = JSON.parse(storage.value), state = await upgraded.getState();
  assert.deepEqual(after.events,[...before.events,submission]);
  assert.deepEqual(after.drafts,[...before.drafts,...remoteData.drafts]);
  assert.deepEqual(after.preferences,before.preferences);
  assert.equal(after.dataset_id,before.dataset_id);
  assert.equal(after.draft_heads[f.c.key],localDraft.id);
  assert.deepEqual((await upgraded.loadQuestion(f.c.key)).draft.answer,['18']);
  assert.equal((await upgraded.loadQuestion(f.b.key)).history.result,true);
  assert.equal((await upgraded.loadQuestion(f.b.key)).history.count,1);
  assert.equal(state.stats.attemptCount,2);
  const writes = storage.writes;
  await openPracticeRepository({...options(f,storage),bank,history});
  assert.equal(storage.writes,writes);
  const later = await openPracticeRepository({...options(f,storage),bank:{...bank,revision:'same-history-next-release'},history});
  assert.equal((await later.getState()).stats.attemptCount,2);
  assert.deepEqual(JSON.parse(storage.value).events,after.events);
  assert.deepEqual(JSON.parse(storage.value).drafts,after.drafts);
  assert.deepEqual(JSON.parse(storage.value).preferences,before.preferences);
  const freshStorage = memory();
  const fresh = await openPracticeRepository({...options(f,freshStorage,'new-device'),bank,history});
  assert.equal((await fresh.loadQuestion(f.c.key)).draft.id,remoteDraft.id);
  assert.equal((await fresh.getState()).stats.attemptCount,2);
  assert.deepEqual(JSON.parse(freshStorage.value).drafts,remoteData.drafts);
  assert.deepEqual(JSON.parse(freshStorage.value).preferences,{});
});

test('bundled mobile submissions missing original draft references or conflicting with local drafts cannot write storage', async () => {
  const f = fixture(), storage = memory(), repo = await openPracticeRepository(options(f,storage));
  await repo.saveDraft(f.b.key,['A']);
  await repo.saveDraft(f.b.key,['B','E']);
  await repo.submit(f.b.key);
  const before = storage.value, data = JSON.parse(before), bank = {...f.bank,revision:'invalid-mobile-history'};
  const history = {events:data.events,legacy:data.legacy,drafts:data.drafts,draft_heads:data.draft_heads};
  const missing = structuredClone(history); missing.drafts = missing.drafts.slice(0,1);
  await assert.rejects(openPracticeRepository({...options(f,storage),bank,history:missing}),/原始草稿/);
  assert.equal(storage.value,before);
  const conflict = structuredClone(history); conflict.drafts[0].answer=['C'];
  await assert.rejects(openPracticeRepository({...options(f,storage),bank,history:conflict}),/同 ID/);
  assert.equal(storage.value,before);
});

test('recommendation advances after the latest original position and wraps only to uncompleted content', async () => {
  const f = fixture(), storage = memory();
  f.history.events.push(attempt('done', f.duplicate, 'A/C'));
  const repo = await openPracticeRepository(options(f, storage));
  assert.equal((await repo.getState()).catalog.se.recommended, null);
  await repo.startRedo(f.a.key);
  assert.equal((await repo.getState()).catalog.se.recommended, f.a.key);
});

test('existing drafts remain resumable after another position completes the same content or bundled history adds completion', async () => {
  const f = fixture(), storage = memory(), opts = options(f, storage), repo = await openPracticeRepository(opts);
  await repo.saveDraft(f.a.key, ['A', 'C']);
  await repo.saveDraft(f.duplicate.key, ['A', 'C']);
  await repo.submit(f.a.key);
  await repo.saveDraft(f.duplicate.key, ['B', 'C']);
  await repo.submit(f.duplicate.key);
  assert.equal((await repo.getState()).stats.attemptCount, 2);
  await repo.saveDraft(f.b.key, ['B', 'E']);
  const upgraded = await openPracticeRepository({ ...opts, bank: { ...f.bank, revision: 'with-desktop-history' }, history: { events: [attempt('desktop-new', f.b, 'A/D')], legacy: [] } });
  assert.deepEqual((await upgraded.loadQuestion(f.b.key)).draft.answer, ['B', 'E']);
  await upgraded.submit(f.b.key);
  assert.equal((await upgraded.loadQuestion(f.b.key)).history.count, 2);
});

test('invalid imported preferences and conflicting independent submissions cannot break or overwrite current records', async () => {
  const f = fixture(), storage = memory(), repo = await openPracticeRepository(options(f, storage));
  await repo.saveDraft(f.c.key, ['4']);
  const original = await repo.backup(), packet = JSON.parse(original);
  packet.payload.preferences = { split: 'broken' };
  packet.checksum.value = await sha256(packet.payload);
  await assert.rejects(repo.previewImport(JSON.stringify(packet)), /分屏比例无效/);
  const otherStorage = memory(JSON.stringify(JSON.parse(original).payload));
  const other = await openPracticeRepository(options(f, otherStorage, 'another-device'));
  await repo.submit(f.c.key);
  await other.submit(f.c.key);
  const remote = await other.backup(), before = storage.value;
  assert.equal((await repo.previewImport(remote)).canMerge, false);
  await assert.rejects(repo.importBackup(remote), /同 ID/);
  assert.equal(storage.value, before);
});

test('offline loader verifies local files and rejects mismatched detail/source identity', async () => {
  const f = fixture(), detail = await f.loadQuestion(f.a), historyRaw = JSON.stringify(f.history), detailRaw = JSON.stringify(detail);
  f.bank.assets = [
    { path: 'history.json', sha256: await sha256(historyRaw), bytes: new TextEncoder().encode(historyRaw).length },
    { path: f.bank.catalog.se.questions[0].detail, sha256: await sha256(detailRaw), bytes: new TextEncoder().encode(detailRaw).length },
  ];
  const files = new Map([['manifest.json', JSON.stringify(f.bank)], ['history.json', historyRaw], [f.bank.catalog.se.questions[0].detail, detailRaw]]);
  const urls = [];
  const fetcher = async url => { urls.push(url); const value = files.get(url.replace('./practice/', '')); return { ok: !!value, text: async () => value }; };
  const loaded = await loadPracticeBank(fetcher);
  assert.equal((await loaded.loadQuestion(f.bank.catalog.se.questions[0])).key, f.a.key);
  assert.ok(urls.every(url => url.startsWith('./practice/')));
  files.set(f.bank.catalog.se.questions[0].detail, detailRaw.replace('Isolated test fixture', 'corrupted fixture'));
  await assert.rejects(loaded.loadQuestion(f.bank.catalog.se.questions[0]), /校验失败/);
});
