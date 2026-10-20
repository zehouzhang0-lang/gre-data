// Run against an explicit local phone backup; all writes stay in memory.
// No learner SQLite/IndexedDB or platform/events directory is opened.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPackage } from '../src/data/packages.mjs';
import { openRepository } from '../src/data/repository.mjs';
import { CATALOG_REVISION } from '../src/data/catalog-update.mjs';
import { openPracticeRepository } from '../src/practice/repository.mjs';
import { loadPracticeBank } from '../src/practice/loader.mjs';

const backupPath = process.argv[2];
if (!backupPath) throw Error('Usage: node scripts/verify-practice-upgrade.mjs <local-phone-backup.json>');
const mobileRoot = fileURLToPath(new URL('../', import.meta.url));
const original = await fs.readFile(backupPath);
const packet = await readPackage(original.toString('utf8'));
const clock = () => new Date('2026-10-21T01:00:00Z');
function memory(value = null) {
  return { kind: 'isolated-memory', value, writes: 0, fail: false,
    async read() { return this.value; },
    async write(next) { if (this.fail) throw Error('simulated full disk'); this.value = next; this.writes++; },
  };
}
const vocabulary = memory(JSON.stringify({
  storage_version: 1, current: packet.data,
  recovery: structuredClone(packet.data), catalogRecovery: structuredClone(packet.data),
}));
const beforeBytes = vocabulary.value;
const vocabOptions = { storage: vocabulary, now: clock, catalogUpdate: {
  revision: CATALOG_REVISION,
  load: () => fs.readFile(path.join(mobileRoot, 'public/vocabulary-seed.json'), 'utf8'),
} };
const vocabRepo = await openRepository(vocabOptions), before = await vocabRepo.getState();
assert.equal(vocabulary.value, beforeBytes, 'This release must not migrate existing vocabulary content or progress');

const offline = await loadPracticeBank(async uri => {
  assert.match(uri, /^\.\/practice\/[A-Za-z0-9._/-]+$/);
  assert.ok(!uri.split('/').includes('..'));
  const content = await fs.readFile(path.join(mobileRoot, 'public', uri), 'utf8');
  return { ok: true, text: async () => content };
});
const practiceStorage = memory();
const options = { storage: practiceStorage, ...offline, now: clock };
let practiceRepo = await openPracticeRepository(options);
const initial = await practiceRepo.getState();
const sourceAttempts = offline.history.events.reduce((count, event) => count + (event.kind === 'attempt' ? 1 : event.payload.items.length), 0);
assert.equal(initial.stats.attemptCount, sourceAttempts);
const firstBytes = practiceStorage.value, firstWrites = practiceStorage.writes;
practiceRepo = await openPracticeRepository(options);
assert.equal(practiceStorage.value, firstBytes);
assert.equal(practiceStorage.writes, firstWrites, 'Reopening must not reseed history');
const next = initial.catalog.se.questions.find(item => !item.submitted && !item.sameContentDone);
assert.ok(next);
const question = await practiceRepo.loadQuestion(next.key);
assert.equal(practiceStorage.writes, firstWrites, 'Viewing is not an attempt');
await practiceRepo.saveDraft(next.key, question.letters.slice(0, 2));
practiceRepo = await openPracticeRepository(options);
assert.deepEqual((await practiceRepo.loadQuestion(next.key)).draft.answer, question.letters.slice(0, 2));
const failedBytes = practiceStorage.value;
practiceStorage.fail = true;
await assert.rejects(practiceRepo.submit(next.key), /simulated full disk/);
assert.equal(practiceStorage.value, failedBytes);
practiceStorage.fail = false;
const submitted = await practiceRepo.submit(next.key);
assert.equal((await practiceRepo.submit(next.key)).id, submitted.id, 'Submission retry must not duplicate history');
const exported = await practiceRepo.backup();
const mergeTarget = await openPracticeRepository({ ...offline, storage: memory(), now: clock });
assert.equal((await mergeTarget.previewImport(exported)).newEvents, 1);
await mergeTarget.importBackup(exported);
assert.equal((await mergeTarget.previewImport(exported)).newEvents, 0);
assert.equal((await mergeTarget.getState()).stats.attemptCount, sourceAttempts + 1);
const sourceEvents = new Map(offline.history.events.map(event => [event.id, event]));
for (const event of JSON.parse(await mergeTarget.backup()).payload.events) {
  if (sourceEvents.has(event.id)) assert.deepEqual(event, sourceEvents.get(event.id));
}
const reopenedVocabulary = await openRepository(vocabOptions), after = await reopenedVocabulary.getState();
assert.equal(vocabulary.value, beforeBytes);
assert.equal(vocabulary.writes, 0, 'Practice must never write the vocabulary database');
assert.deepEqual(after, before);
assert.deepEqual((await readPackage(await reopenedVocabulary.backup())).data, packet.data);
assert.deepEqual((await readPackage(await reopenedVocabulary.backupRecovery())).data, packet.data);
assert.deepEqual((await readPackage(await reopenedVocabulary.backupCatalogRecovery())).data, packet.data);
assert.deepEqual(await fs.readFile(backupPath), original);
console.log(JSON.stringify({
  phone_backup_sha256: createHash('sha256').update(original).digest('hex'),
  vocabulary_events: packet.data.events.length,
  pending_curation_words: after.curationRequests.length,
  vocabulary_sessions: after.vocabSessions.length,
  unfinished_sessions: after.vocabSessions.filter(session => !session.complete).length,
  vocabulary_writes: vocabulary.writes,
  preserved_recovery_snapshots: 2,
  desktop_attempts: sourceAttempts,
  completed_original_positions: initial.stats.completedCount,
  practice_questions: Object.values(initial.catalog).reduce((count, group) => count + group.questions.length, 0),
  practice_draft_reopen: 'passed',
  failed_save_preserves_data: 'passed',
  submit_retry_and_backup_merge: 'passed',
  real_files_modified: 0,
}, null, 2));
