// Validate a release against actual phone backups without opening app databases.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPackage } from '../src/data/packages.mjs';
import { openRepository } from '../src/data/repository.mjs';
import { projectState } from '../src/data/model.mjs';
import { CATALOG_REVISION } from '../src/data/catalog-update.mjs';
import { openPracticeRepository } from '../src/practice/repository.mjs';
import { loadPracticeBank } from '../src/practice/loader.mjs';
import { validateDocument, sha256, project as projectPractice, canonical } from '../src/practice/model.mjs';

const [vocabularyPath, practicePath, ...dailyPaths] = process.argv.slice(2);
if (!vocabularyPath || !practicePath) throw Error('Usage: node verify-content-upgrade.mjs <vocabulary-backup> <practice-backup> [daily-word-pack ...]');
const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const originalVocabulary = await fs.readFile(vocabularyPath), originalPractice = await fs.readFile(practicePath);
const phone = (await readPackage(originalVocabulary.toString('utf8'))).data;
const practicePacket = JSON.parse(originalPractice.toString('utf8'));
assert.equal(practicePacket.format, 'gre-practice-backup');
assert.equal(practicePacket.version, 1);
assert.equal(practicePacket.checksum.algorithm, 'SHA-256');
assert.equal(practicePacket.checksum.value, await sha256(practicePacket.payload));
const phonePractice = validateDocument(practicePacket.payload);
const clock = () => new Date(practicePacket.created_at);
const seed = await fs.readFile(path.join(mobileRoot, 'public/vocabulary-seed.json'), 'utf8');
const seeded = (await readPackage(seed)).data;
const seedState = projectState(seeded, clock());
function memory(value = null) {
  return { kind: 'isolated-memory', value, writes: 0, fail: false,
    async read() { return this.value; },
    async write(next) { if (this.fail) throw Error('simulated full disk'); this.value = next; this.writes++; },
  };
}
const document = current => JSON.stringify({ storage_version: 1, current, recovery: structuredClone(phone), catalogRecovery: structuredClone(phone) });
const options = storage => ({ storage, now: clock, catalogUpdate: { revision: CATALOG_REVISION, load: async () => seed } });
function assertProgress(before, after) {
  for (const field of ['dataset_id', 'time_zone', 'events', 'quickRound']) assert.deepEqual(after[field], before[field], field);
  assert.deepEqual(after.baseline.legacyWords, before.baseline.legacyWords);
  const originalSettings = ({catalogUpdate, ...rest}) => rest;
  assert.deepEqual(originalSettings(after.settings), originalSettings(before.settings));
  const raw = new Map(after.baseline.vocabulary.map(word => [word.word, word]));
  for (const word of before.baseline.vocabulary) assert.deepEqual(raw.get(word.word), word, `raw word ${word.word}`);
  const a = projectState(before, clock()), b = projectState(after, clock());
  for (const key of ['vocabSessions', 'vocabDrills', 'cardReadings', 'curationRequests', 'quickRound', 'undoId']) assert.deepEqual(b[key], a[key], key);
  const words = new Map(b.vocabulary.map(word => [word.word, word]));
  for (const word of a.vocabulary) {
    const updated = words.get(word.word);
    for (const key of ['recalls', 'note', 'deleted', 'captures', 'status', 'feedback']) assert.deepEqual(updated[key], word[key], `${word.word}: ${key}`);
    const senseCount = item => (item.senses || []).reduce((sum, group) => sum + group.meanings.length, 0);
    assert.ok(senseCount(updated) >= senseCount(word), `${word.word}: existing structured senses must not be lost during this content upgrade`);
  }
  return b;
}

// The personal fresh-install seed contains the latest phone history exactly once.
assertProgress(phone, seeded);
const scenarios = [];
for (const importDaily of [false, true]) {
  const storage = memory(document(phone));
  if (importDaily) {
    const repo = await openRepository({ storage, now: clock });
    for (const daily of dailyPaths) await repo.importVocabulary(await fs.readFile(daily, 'utf8'));
    await repo.close();
  }
  const before = JSON.parse(storage.value), beforeCount = projectState(before.current, clock()).vocabulary.length;
  let repo = await openRepository(options(storage));
  const updated = JSON.parse(storage.value);
  const state = assertProgress(before.current, updated.current);
  assert.deepEqual(updated.recovery, before.recovery);
  assert.deepEqual(updated.catalogRecovery, before.catalogRecovery);
  assert.equal(state.vocabulary.length, seedState.vocabulary.length);
  const groupIds = new Set(state.relations.groups.filter(group => !group.deleted).map(group => group.id));
  for (const group of seedState.relations.groups.filter(group => !group.deleted)) assert.ok(groupIds.has(group.id), group.id);
  const idle = state.vocabulary.find(word => word.word === 'idle');
  if (state.curationRequests.some(request => request.word === 'idle')) assert.ok(idle?.senses?.length, 'The explicitly requested blank idle receives checked senses');
  const saved = storage.value, writes = storage.writes;
  await repo.close(); repo = await openRepository(options(storage));
  assert.equal(storage.value, saved); assert.equal(storage.writes, writes, 'Reopening must not reapply the catalog');
  const backup = await repo.backup();
  assert.deepEqual((await readPackage(backup)).data, updated.current);
  const restoredStorage = memory();
  const restored = await openRepository({ storage: restoredStorage, seed, now: clock });
  await restored.restore(backup);
  assert.deepEqual((await readPackage(await restored.backup())).data, updated.current);
  scenarios.push({ daily_imports_before_upgrade: importDaily ? dailyPaths.length : 0, words_before: beforeCount,
    words_after: state.vocabulary.length, groups_after: groupIds.size, events: state.eventCount || updated.current.events.length,
    curation: state.curationRequests.length, sessions: state.vocabSessions.length, unfinished_sessions: state.vocabSessions.filter(s => !s.complete).length,
    idle_senses: idle?.senses?.reduce((sum, group) => sum + group.meanings.length, 0),
    progress_and_recovery_preserved: true, reopen_and_backup_restore: 'passed' });
}

// Post-export phone work and personal edits must remain authoritative.
const laterStorage = memory(document(phone));
let laterRepo = await openRepository({ storage: laterStorage, now: clock });
await laterRepo.rate(['gloat'], 'partial');
await laterRepo.saveEvent('vocab_upsert', { word: 'gloat', meaning: '用户在导出后保留的释义', pos: 'v.', note: '升级回归：个人备注' });
const later = JSON.parse(laterStorage.value).current;
laterRepo = await openRepository(options(laterStorage));
assertProgress(later, JSON.parse(laterStorage.value).current);
assert.equal((await laterRepo.getState()).vocabulary.find(word => word.word === 'gloat').meaning, '用户在导出后保留的释义');
const failedStorage = memory(document(phone)), failedBefore = failedStorage.value;
failedStorage.fail = true;
await assert.rejects(openRepository(options(failedStorage)), /simulated full disk/);
assert.equal(failedStorage.value, failedBefore);

const offline = await loadPracticeBank(async uri => {
  assert.match(uri, /^\.\/practice\/[A-Za-z0-9._/-]+$/); assert.ok(!uri.split('/').includes('..'));
  const content = await fs.readFile(path.join(mobileRoot, 'public', uri), 'utf8');
  return { ok: true, text: async () => content };
});
const practiceStorage = memory(JSON.stringify(phonePractice));
const practiceOptions = { ...offline, storage: practiceStorage, now: clock };
let practiceRepo = await openPracticeRepository(practiceOptions);
const practiceAfter = JSON.parse(practiceStorage.value);
for (const key of ['dataset_id', 'events', 'legacy', 'drafts', 'draft_heads', 'preferences']) assert.ok(canonical(practiceAfter[key]) === canonical(phonePractice[key]), `practice ${key}`);
const practiceBeforeState = projectPractice(phonePractice, offline.bank), practiceAfterState = await practiceRepo.getState();
assert.deepEqual(practiceAfterState.stats, practiceBeforeState.stats);
const practiceSaved = practiceStorage.value, practiceWrites = practiceStorage.writes;
practiceRepo = await openPracticeRepository(practiceOptions);
assert.equal(practiceStorage.value, practiceSaved); assert.equal(practiceStorage.writes, practiceWrites);
const backup = await practiceRepo.backup(), preview = await practiceRepo.previewImport(backup);
assert.equal(preview.newEvents + preview.newDrafts + preview.newLegacy, 0);
await practiceRepo.importBackup(backup); assert.equal(practiceStorage.value, practiceSaved);
const freshPractice = await openPracticeRepository({ ...offline, storage: memory(), now: clock });
const freshDocument = JSON.parse(await freshPractice.backup()).payload;
for (const key of ['events', 'legacy', 'drafts']) assert.ok(canonical(freshDocument[key]) === canonical(phonePractice[key]), `fresh practice ${key}`);

// A new local draft and device reading settings survive incoming bundled history.
const oldPractice = memory(JSON.stringify(phonePractice));
let working = await openPracticeRepository({ ...offline, storage: oldPractice, now: clock });
const first = (await working.getState()).catalog.se.questions.find(q => !q.submitted && !q.sameContentDone);
assert.ok(first);
const detail = await working.loadQuestion(first.key);
await working.saveDraft(first.key, detail.letters.slice(0, 1));
await working.savePreferences({ split: 62, readingSize: 21, activeKey: first.key, type: 'se' });
const newer = JSON.parse(oldPractice.value); newer.seed_revisions = phonePractice.seed_revisions;
oldPractice.value = JSON.stringify(newer);
working = await openPracticeRepository({ ...offline, storage: oldPractice, now: clock });
const newerAfter = JSON.parse(oldPractice.value);
for (const key of ['events', 'drafts', 'draft_heads', 'preferences']) assert.deepEqual(newerAfter[key], newer[key]);
assert.deepEqual((await working.loadQuestion(first.key)).draft.answer, detail.letters.slice(0, 1));
assert.deepEqual(await fs.readFile(vocabularyPath), originalVocabulary);
assert.deepEqual(await fs.readFile(practicePath), originalPractice);
console.log(JSON.stringify({
  vocabulary_sha256: createHash('sha256').update(originalVocabulary).digest('hex'),
  practice_sha256: createHash('sha256').update(originalPractice).digest('hex'),
  catalog_revision: CATALOG_REVISION, scenarios,
  post_export_vocabulary_edit_and_rating: 'passed', failed_upgrade_keeps_original: 'passed',
  practice_events: phonePractice.events.length, practice_draft_versions: phonePractice.drafts.length,
  practice_stats: practiceAfterState.stats, practice_reopen_merge_and_post_export_draft: 'passed',
  fresh_install_history: 'passed', original_backup_bytes_unchanged: true, real_app_databases_opened: 0,
}, null, 2));
