import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, openRepository } from '../src/data/repository.mjs';
import { validateData } from '../src/data/model.mjs';
import { readPackage } from '../src/data/packages.mjs';
import { orderedReviewRounds, selectReviewWords, roundUrgency } from '../src/data/review-tasks.mjs';
import { updateCatalog } from '../src/data/catalog-update.mjs';

async function setup() {
  const storage = { value: null, fail: false, writes: 0, async read() { return this.value; }, async write(value) { if (this.fail) throw Error('disk full'); this.value = value; this.writes++; } };
  const clock = { value: new Date('2026-10-27T01:00:00Z') };
  const seed = emptyData('Asia/Kuala_Lumpur');
  seed.baseline.vocabulary = ['lucid', 'abate', 'verve', 'flair', 'clear', 'calm'].map((word, i) => ({ word, meaning: `释义${i}`, pos: 'adj.', note: '' }));
  seed.baseline.relations.topics = [{ id: 'expression', name: '表达', words: ['lucid', 'clear'] }];
  const repo = await openRepository({ storage, seed, now: () => clock.value });
  return { repo, storage, clock };
}
const config = { name: '今天的重点', word_count: 2, filter: { scope: 'all', topic: '', group: '' }, deadline: '2026-11-02' };

test('tasks create only today once, skip absent days, retain deleted-day marker, stop after cancel/deadline', async () => {
  const { repo, storage, clock } = await setup();
  const created = await repo.createReviewTask(config);
  assert.equal(created.round.name, config.name);
  assert.equal(created.round.words.length, 2);
  assert.equal(created.round.day, '2026-10-27');
  const writes = storage.writes;
  await Promise.all([repo.getState(), repo.getState(), repo.getState()]);
  assert.equal(storage.writes, writes);
  const first = structuredClone(JSON.parse(storage.value).current.events);
  await repo.deleteReviewRound(created.round.session_id);
  assert.equal((await repo.getState()).reviewRounds.length, 1);
  clock.value = new Date('2026-10-30T01:00:00Z');
  const state = await repo.getState();
  assert.deepEqual(state.reviewRounds.map(r => r.day).sort(), ['2026-10-27', '2026-10-30']);
  assert.notDeepEqual(state.reviewRounds[0].words, created.round.words);
  assert.deepEqual(JSON.parse(storage.value).current.events.slice(0, first.length), first);
  await repo.cancelReviewTask(created.task.id);
  clock.value = new Date('2026-10-31T01:00:00Z');
  assert.equal((await repo.getState()).reviewRounds.length, 2);
  await assert.rejects(repo.updateReviewTask(created.task.id, { name: 'revive' }), /取消/);
  const ended = await repo.createReviewTask({ ...config, deadline: '2026-10-31' });
  clock.value = new Date('2026-11-01T01:00:00Z');
  assert.equal((await repo.getState()).reviewRounds.filter(r => r.task_id === ended.task.id).length, 1);
});

test('task changes affect future rounds; local midnight uses dataset timezone; current round is immutable', async () => {
  const { repo, clock } = await setup();
  const { task, round } = await repo.createReviewTask(config);
  await repo.updateReviewTask(task.id, { name: '新的名字', word_count: 3, filter: { scope: 'all', topic: 'expression', group: '' } });
  assert.deepEqual((await repo.getState()).reviewRounds[0].items, round.items);
  assert.equal((await repo.getState()).reviewRounds[0].name, config.name);
  clock.value = new Date('2026-10-27T16:00:00Z');
  const next = (await repo.getState()).reviewRounds[0];
  assert.equal(next.day, '2026-10-28');
  assert.equal(next.name, '新的名字 · 2026-10-28');
  assert.deepEqual(new Set(next.words), new Set(['lucid', 'clear']));
});

test('named rounds preserve exact old session, progress and snapshots through rename/delete/backup/restore', async () => {
  const { repo, storage, clock } = await setup();
  const round = await repo.createReviewRound({ words: ['lucid'], name: '容易混淆' });
  const item = round.items[0];
  await repo.saveEvent('vocab_drill', { session_id: round.session_id, word: 'lucid', stage: 'meaning_1', answer: 'lucid', result: 'correct', response_mode: item.choices.length ? 'choice' : 'self_check' });
  const before = (await repo.getState()).vocabSessions[0];
  const oldEvents = structuredClone(JSON.parse(storage.value).current.events);
  await repo.updateReviewRound(round.session_id, { name: '改名仍续接', pinned: true });
  assert.deepEqual((await repo.getState()).vocabSessions[0], before);
  await repo.saveEvent('vocab_upsert', { word: 'lucid', meaning: '个人的新释义', note: '笔记', pos: 'adj.' });
  const packet = await repo.backup();
  const fresh = await setup();
  await fresh.repo.restore(packet);
  assert.equal((await fresh.repo.getState()).reviewRounds[0].name, '改名仍续接');
  assert.deepEqual((await fresh.repo.getState()).reviewRounds[0].items, before.items);
  await repo.deleteReviewRound(round.session_id);
  assert.equal(orderedReviewRounds(await repo.getState()).length, 0);
  assert.deepEqual((await repo.getState()).vocabSessions[0], before);
  assert.deepEqual(JSON.parse(storage.value).current.events.slice(0, oldEvents.length), oldEvents);
  const reopened = await openRepository({ storage, now: () => clock.value });
  assert.equal((await reopened.getState()).reviewRounds[0].deleted, true);
  assert.equal((await readPackage(await reopened.backup())).data.events.length, JSON.parse(storage.value).current.events.length);
});

test('new metadata is strict, rejects dangling references, malformed dates, duplicate task-day and invalid group members', async () => {
  const { repo, storage } = await setup();
  await assert.rejects(repo.createReviewTask({ ...config, deadline: '2026-02-30' }), /日期/);
  await assert.rejects(repo.createReviewTask({ ...config, filter: { scope: 'all', topic: 'missing', group: '' } }), /范围/);
  await assert.rejects(repo.createReviewTask({ ...config, word_count: 0 }), /词数/);
  await assert.rejects(repo.createWordGroup({ words: ['missing'], kind: 'relation', name: '坏引用' }), /不可用单词/);
  const { task, round } = await repo.createReviewTask(config);
  const other = { session_id: crypto.randomUUID() };
  await repo.saveEvent('vocab_session', { ...other, words: ['lucid'], meaning_passes: 2 });
  await assert.rejects(repo.saveEvent('vocab_review_round', { session_id: other.session_id, task_id: task.id, day: round.day, deadline: round.deadline, name: '重复今日', pinned: false, deleted: false }), /重复/);
  await assert.rejects(repo.saveEvent('vocab_review_round', { session_id: crypto.randomUUID(), name: '不存在', pinned: false, deleted: false }), /未知轮次/);
  const corrupt = JSON.parse(storage.value).current;
  corrupt.events.find(e => e.kind === 'vocab_review_round').payload.pinned = 'yes';
  assert.throws(() => validateData(corrupt), /状态/);
});

test('custom group membership is direct, filters and backup preserve old classifications', async () => {
  const { repo } = await setup();
  const original = (await repo.getState()).relations.assignments.find(a => a.word === 'lucid').topics;
  const group = await repo.createWordGroup({ words: ['lucid', 'abate'], kind: 'relation', name: '我的一组' });
  const topic = await repo.createWordGroup({ words: ['lucid', 'abate'], kind: 'topic', name: '今天重点' });
  const state = await repo.getState();
  assert.equal(state.relations.groups.find(g => g.id === group.id).type, 'custom');
  assert.deepEqual(state.relations.assignments.find(a => a.word === 'lucid').topics, [...original, topic.id]);
  assert.deepEqual(selectReviewWords(state, { scope: 'all', topic: '', group: group.id }).map(w => w.word), ['abate', 'lucid']);
  const packet = await repo.backup();
  assert.deepEqual((await readPackage(packet)).data.events.filter(e => e.kind === 'vocab_word_group').map(e => e.payload.name), ['我的一组', '今天重点']);
  const other = await setup();
  await other.repo.importVocabulary(packet);
  assert((await other.repo.getState()).relations.groups.some(g => g.id === group.id));
});

test('round/task and reading batch transactions roll back on storage failure, stable reading retry advances once', async () => {
  const { repo, storage, clock } = await setup();
  const initial = storage.value;
  storage.fail = true;
  await assert.rejects(repo.createReviewTask(config), /disk full/);
  assert.equal(storage.value, initial);
  storage.fail = false;
  const expectedRoundId = (await repo.getState()).quickRound.id;
  const batches = [{ id: crypto.randomUUID(), payload: { items: [{ word: 'lucid', count: 1, viewed_at: clock.value.toISOString(), impression: 'remembered' }] } }];
  storage.fail = true;
  await assert.rejects(repo.finishWallRound({ batches, expectedRoundId }), /disk full/);
  assert.equal(storage.value, initial);
  storage.fail = false;
  const saved = await repo.finishWallRound({ batches, expectedRoundId });
  assert.notEqual(saved.quickRound.id, expectedRoundId);
  const writes = storage.writes;
  await repo.finishWallRound({ batches, expectedRoundId });
  assert.equal(storage.writes, writes);
  assert.equal((await repo.getState()).cardReadings.find(w => w.word === 'lucid').view_count, 1);
  await repo.finishWallRound({ batches: [], expectedRoundId: saved.quickRound.id });
  assert.notEqual((await repo.getState()).quickRound.id, saved.quickRound.id);
});

test('round ordering prioritizes pins and time urgency, done remains separate; no fabricated forgetting score', async () => {
  const { repo, clock } = await setup();
  const first = await repo.createReviewRound({ words: ['lucid'], name: '第一轮' });
  const second = await repo.createReviewRound({ words: ['abate'], name: '第二轮' });
  await repo.updateReviewRound(first.session_id, { pinned: true });
  const state = await repo.getState();
  assert.equal(orderedReviewRounds(state)[0].session_id, first.session_id);
  assert.equal(roundUrgency({ ...second, deadline: '2026-10-26' }, state, clock.value).level, 'urgent');
  assert.equal(roundUrgency({ ...second, deadline: '2026-10-27' }, state, clock.value).level, 'today');
  assert.equal(roundUrgency({ ...second, complete: true, deadline: '2026-10-26' }, state, clock.value).level, 'complete');
});

test('custom group content upgrades do not duplicate mobile events into baseline; legacy group controls still work', async () => {
  const { repo, storage } = await setup();
  const topic = await repo.createWordGroup({ words: ['lucid'], kind: 'topic', name: '一词主题' });
  const group = await repo.createWordGroup({ words: ['lucid'], kind: 'relation', name: '一词关系' });
  const current = JSON.parse(storage.value).current;
  const upgraded = updateCatalog(current, current, 'isolation-test');
  assert.deepEqual(upgraded.events, current.events);
  assert.equal(upgraded.baseline.relations.topics.filter(t => t.id === topic.id).length, 0);
  assert.equal(upgraded.baseline.relations.groups.filter(g => g.id === group.id).length, 0);
  await repo.saveEvent('topic_delete', { id: topic.id });
  await repo.saveEvent('relation_delete', { id: group.id });
  assert.equal((await repo.getState()).relations.topics.find(t => t.id === topic.id).deleted, true);
  assert.equal((await repo.getState()).relations.groups.find(t => t.id === group.id).deleted, true);
  await repo.saveEvent('topic_restore', { id: topic.id });
  await repo.saveEvent('word_topics', { word: 'lucid', topics: ['expression'] });
  assert.deepEqual((await repo.getState()).relations.assignments.find(a => a.word === 'lucid').topics, ['expression']);
});

test('legacy null quick round can save readings and retry without another round', async () => {
  const { repo, clock } = await setup();
  const packet = await readPackage(await repo.backup());
  packet.data.quickRound = null;
  const storage = { value: JSON.stringify({ storage_version: 1, current: packet.data, recovery: null }), async read() { return this.value; }, async write(value) { this.value = value; } };
  const legacy = await openRepository({ storage, now: () => clock.value });
  const batches = [{ id: crypto.randomUUID(), payload: { items: [{ word: 'lucid', count: 1, viewed_at: clock.value.toISOString(), impression: null }] } }];
  const result = await legacy.finishWallRound({ batches });
  await legacy.finishWallRound({ batches });
  assert.equal((await legacy.getState()).quickRound.id, result.quickRound.id);
});
