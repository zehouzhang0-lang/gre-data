import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { adjacentQuestion, swipeDirection, captureSelection } from '../src/practice/interaction.mjs';
import { openPracticeRepository } from '../src/practice/repository.mjs';
import { questionKey, sha256, validateDocument } from '../src/practice/model.mjs';
import { readPracticeBackup } from '../src/practice/packages.mjs';
import { importPracticeBackup, readImportedPracticeReferences } from '../scripts/import-practice-backup.mjs';
import { mergePracticeHistory } from '../scripts/practice-history.mjs';
import { Store } from '../../server/store.mjs';

function fixture() {
  const q = { material: 'fixture', unit: 'test3', question: '2', type: 'se', content_id: 'fixture-content', mode: 'pair',
    source: 'Isolated test', prompt: 'Select two equivalent answers.', options: ['large', 'small', 'big', 'tiny', 'old', 'new'], letters: ['A','B','C','D','E','F'],
    groups: [], native: true, paragraphs: [], sentences: [], images: [], passageImages: [], answerKey: { answer: 'A/C', answer_source: 'user_provided' } };
  q.key = questionKey(q);
  const bank = { format: 'gre-practice-bank', version: 1, revision: 'fixture-v2', history: 'history.json',
    catalog: Object.fromEntries(['se','tc','rc','quant'].map(type => [type, { questions: type === 'se' ? [{ ...q, detail: 'questions/fixture.json' }] : [] }])) };
  const storage = { value: null, async read() { return this.value; }, async write(value) { this.value = value; } };
  return { q, bank, storage, loadQuestion: async () => q };
}
async function packageOf(payload) { return JSON.stringify({ format: 'gre-practice-backup', version: 1, created_at: new Date().toISOString(), checksum: { algorithm: 'SHA-256', value: await sha256(payload) }, payload }); }

test('manual navigation keeps adjacent completed positions and stops at ends, independently of recommendation', () => {
  const questions = [{ key: 'test2', submitted: true }, { key: 'test3', submitted: true }, { key: 'test4', sameContentDone: true }, { key: 'task143' }];
  assert.equal(adjacentQuestion(questions, 'test3', -1).key, 'test2');
  assert.equal(adjacentQuestion(questions, 'test3', 1).key, 'test4');
  assert.equal(adjacentQuestion(questions, 'test2', -1), null);
  assert.equal(adjacentQuestion(questions, 'task143', 1), null);
});

test('swiping accepts both thumbs but refuses scrolling, long press, text selection, disabled Quant and mouse drags', () => {
  const start = { x: 200, y: 100, time: 100, pointerType: 'touch' };
  assert.equal(swipeDirection(start, { x: 110, y: 108, time: 300 }), 1);
  assert.equal(swipeDirection(start, { x: 290, y: 108, time: 300 }), -1);
  assert.equal(swipeDirection(start, { x: 110, y: 175, time: 300 }), 0);
  assert.equal(swipeDirection(start, { x: 110, y: 108, time: 600 }), 0);
  assert.equal(swipeDirection(start, { x: 110, y: 108, time: 300 }, { selection: true }), 0);
  assert.equal(swipeDirection(start, { x: 110, y: 108, time: 300 }, { enabled: false }), 0);
  assert.equal(swipeDirection({ ...start, pointerType: 'mouse' }, { x: 110, y: 108, time: 300 }), 0);
});

test('captured native selection retains a bounded context and original location; images/outside text are rejected', () => {
  const { q } = fixture(), block = { textContent: 'An old, unusually big building stood here.', closest() { return this; } };
  const node = { nodeType: 3, parentElement: block }, container = { contains: value => value === block };
  const selection = { isCollapsed: false, rangeCount: 1, toString: () => 'big', getRangeAt: () => ({ startContainer: node, endContainer: node }) };
  assert.deepEqual(captureSelection(selection, container, q), { word: 'big', context: block.textContent, source: { material: q.material, unit: q.unit, question: q.question, type: q.type } });
  assert.equal(captureSelection(selection, { contains: () => false }, q), null);
  assert.equal(captureSelection({ ...selection, toString: () => 'seven words cannot be accepted in this selection' }, container, q), null);
});

test('backup -> desktop preserves every original fact, draft revision, AI review and snapshot; repeat imports do not count twice', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gre-practice-import-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const f = fixture(), repo = await openPracticeRepository(f);
  await repo.saveDraft(f.q.key, ['A']); await repo.saveDraft(f.q.key, ['A','C']);
  const event = await repo.submit(f.q.key);
  const review = { id: randomUUID(), recorded_at: new Date(Date.now() + 1000).toISOString(), attempt_id: event.id, question_key: f.q.key, input_hash: 'a'.repeat(64), model: 'fixture', provisional: true,
    result: { question_translation: '选择两个等价的答案。', option_explanations: f.q.letters.map(label => ({ label, meaning: '测试核心义和语境义', translation: '测试翻译', reasoning: '测试依据' })), summary: '测试结论', evidence: '测试证据', reasoning_gap: '未提供推理', next_action: '重新检验', technique_ids: ['v_se_equivalence'], assessment: 'supported' } };
  await repo.saveAiReview(review); await repo.saveAiReview(review);
  assert.equal((await repo.loadQuestion(f.q.key)).aiReviews.length, 1);
  await assert.rejects(repo.saveAiReview({ ...review, model: 'different' }), /同 ID/);
  const raw = await repo.backup(), backupPath = path.join(root, 'input.json'); await fs.writeFile(backupPath, raw);
  const payload = await readPracticeBackup(raw);
  assert.deepEqual(payload.events[0], event);
  assert.deepEqual(event.practice.question_snapshot.options, f.q.options);
  assert.equal(payload.drafts.length, 2);
  const dry = await importPracticeBackup({ root, backupPath, dryRun: true });
  assert.equal(dry.newAttempts, 1); await assert.rejects(fs.access(path.join(root, 'platform/events')));
  const first = await importPracticeBackup({ root, backupPath });
  assert.equal(first.newEvents, 1); assert.equal(first.newAiReviews, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'platform/events', `${event.id}.json`), 'utf8')), event);
  const refs = await readImportedPracticeReferences(root);
  assert.deepEqual(refs.drafts.sort((a,b) => a.id.localeCompare(b.id)), payload.drafts.sort((a,b) => a.id.localeCompare(b.id)));
  const history = mergePracticeHistory({ events: [event], ...refs });
  assert.deepEqual(history.ai_reviews, [review]);
  const state = await new Store(root).state();
  assert.equal(state.attempts.length, 1); assert.equal(state.attempts[0].id, event.id);
  assert.equal(state.attempts[0].recorded_at, event.recorded_at); assert.equal(state.attempts[0].submitted_result, true);
  assert.deepEqual(state.attempts[0].practice, event.practice);
  assert.deepEqual(state.reviews.find(item => item.id === review.id), { ...review, scope: 'attempt', provider: 'chatgpt_plan', provisional: true, source_attempt_id: event.id, attempt_id: event.id });
  const repeated = await importPracticeBackup({ root, backupPath });
  assert.equal(repeated.newAttempts, 0); assert.equal(repeated.newDrafts, 0); assert.equal(repeated.newAiReviews, 0);
  const bad = structuredClone(payload); bad.events[0].payload.note = 'conflict';
  await fs.writeFile(backupPath, await packageOf(bad));
  await assert.rejects(importPracticeBackup({ root, backupPath }), /同 ID/);
  const duplicate = structuredClone(payload); duplicate.events[0].id = randomUUID(); duplicate.ai_reviews = [];
  await fs.writeFile(backupPath, await packageOf(duplicate));
  await assert.rejects(importPracticeBackup({ root, backupPath }), /submission/);
  assert.equal((await new Store(root).events()).length, 1);
  const missing = structuredClone(payload); missing.drafts = [];
  assert.throws(() => validateDocument(missing), /草稿/);
  const invalid = structuredClone(payload); invalid.events[0].practice.result = false;
  assert.throws(() => validateDocument(invalid), /判定/);
  const incomplete = structuredClone(payload); incomplete.ai_reviews[0].result.option_explanations.pop();
  assert.throws(() => validateDocument(incomplete), /选项/);
});
