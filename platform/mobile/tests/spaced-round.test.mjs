import test from 'node:test';
import assert from 'node:assert/strict';
import { openRepository, emptyData } from '../src/data/repository.mjs';
import { validateData } from '../src/data/model.mjs';
import { clozeFor, roundProgress, SPACED_GAP } from '../../shared/word-session.mjs';

const now = () => new Date('2026-11-23T02:00:00Z');
function memory() { return { kind: 'memory', value: null, async read() { return this.value; }, async write(value) { this.value = value; } }; }
function fixture(size = 40) {
  const data = emptyData('Asia/Shanghai');
  data.baseline.vocabulary = Array.from({ length: size }, (_, i) => ({ word: `spaced-${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`, meaning: String.fromCharCode(0x4e00 + i), pos: 'n.', note: 'synthetic' }));
  return validateData(data);
}
const sessionOf = async (repo, id) => (await repo.getState()).vocabSessions.find(s => s.session_id === id);
async function answer(repo, session, correct) {
  const { word, stage } = session.next, item = session.items.find(i => i.word === word), meaning = stage.startsWith('meaning_');
  const right = meaning ? word : stage === 'cloze' ? clozeFor(word).missing : word;
  const wrong = meaning ? item.choices.find(c => c.word !== word).word : 'zzzz';
  await repo.saveEvent('vocab_drill', { session_id: session.session_id, word, stage, answer: correct ? right : wrong, result: correct ? 'correct' : 'incorrect', response_mode: meaning ? 'choice' : 'typing' });
  return { word, stage };
}

test('a missed word comes back after three other cards, and a correct one goes to the back for its next stage', async () => {
  const seed = fixture(), repo = await openRepository({ storage: memory(), seed, now });
  const words = seed.baseline.vocabulary.slice(0, 10).map(w => w.word);
  const round = await repo.createReviewRound({ words, name: 'spaced', meaning_passes: 1, order: 'spaced' });
  assert.equal(round.order, 'spaced');
  let session = await sessionOf(repo, round.session_id);
  assert.deepEqual(session.next, { stage: 'meaning_1', word: words[0], remaining: 10 });

  await answer(repo, session, false);
  const seen = [];
  for (let i = 0; i < SPACED_GAP + 1; i++) { session = await sessionOf(repo, round.session_id); seen.push((await answer(repo, session, true)).word); }
  assert.deepEqual(seen, [words[1], words[2], words[3], words[0]]);

  // The rest of the meaning pass, then the first word to have passed returns for the cloze stage.
  for (let i = 0; i < 6; i++) { session = await sessionOf(repo, round.session_id); assert.equal(session.next.stage, 'meaning_1'); await answer(repo, session, true); }
  session = await sessionOf(repo, round.session_id);
  assert.deepEqual(session.next, { stage: 'cloze', word: words[1], remaining: 10 });
  assert.equal(session.passed, 10);
  assert.equal(session.total, 30);
});

test('the save rule rejects an answer for any card other than the next one', async () => {
  const seed = fixture(), repo = await openRepository({ storage: memory(), seed, now });
  const words = seed.baseline.vocabulary.slice(0, 5).map(w => w.word);
  const round = await repo.createReviewRound({ words, name: 'strict', meaning_passes: 1, order: 'spaced' });
  await assert.rejects(repo.saveEvent('vocab_drill', { session_id: round.session_id, word: words[1], stage: 'meaning_1', answer: words[1], result: 'correct', response_mode: 'choice' }), /顺序/);
  await assert.rejects(repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words, meaning_passes: 1, order: 'random' }), /顺序/);
});

test('a spaced round can be finished, settled, and replayed after reopening and after a backup restore', async () => {
  const seed = fixture(), storage = memory();
  let repo = await openRepository({ storage, seed, now });
  const words = seed.baseline.vocabulary.slice(0, 4).map(w => w.word);
  const round = await repo.createReviewRound({ words, name: 'finish', meaning_passes: 1, order: 'spaced' });
  let session = await sessionOf(repo, round.session_id), step = 0;
  while (session.next) { await answer(repo, session, step++ % 4 !== 1); session = await sessionOf(repo, round.session_id); assert.ok(step < 200); }
  assert.deepEqual([...session.ready_words].sort(), [...words].sort());
  for (const word of session.pending_completions) await repo.saveEvent('vocab_recall', { word, mode: 'multistage', session_id: round.session_id });
  const before = await repo.getState(), finished = before.vocabSessions.find(s => s.session_id === round.session_id);
  assert.equal(finished.complete, true);
  const backup = await repo.backup();
  await repo.close();

  repo = await openRepository({ storage, seed: emptyData(), now });
  assert.deepEqual((await repo.getState()).vocabSessions, before.vocabSessions);
  const restoredStorage = memory(), replacement = await openRepository({ storage: restoredStorage, seed: emptyData(), now });
  await replacement.restore(backup);
  assert.deepEqual((await replacement.getState()).vocabSessions, before.vocabSessions);
});

test('rounds without the order field still follow the original stage-by-stage rule', () => {
  const session = { session_id: 's', words: ['a', 'b', 'c'], meaning_passes: 1 };
  const miss = { session_id: 's', word: 'a', stage: 'meaning_1', result: 'incorrect' };
  assert.deepEqual(roundProgress(session, [miss]).next, { stage: 'meaning_1', word: 'b', remaining: 3 });
  assert.deepEqual(roundProgress({ ...session, order: 'spaced' }, [miss]).next, { stage: 'meaning_1', word: 'b', remaining: 3 });
  const five = { session_id: 's', words: ['a', 'b', 'c', 'd', 'e', 'f'], meaning_passes: 1 };
  const oldOrder = roundProgress(five, [miss, { ...miss, word: 'b', result: 'correct' }, { ...miss, word: 'c', result: 'correct' }, { ...miss, word: 'd', result: 'correct' }]);
  assert.equal(oldOrder.next.word, 'e');
  const newOrder = roundProgress({ ...five, order: 'spaced' }, [miss, { ...miss, word: 'b', result: 'correct' }, { ...miss, word: 'c', result: 'correct' }, { ...miss, word: 'd', result: 'correct' }]);
  assert.equal(newOrder.next.word, 'a');
});
