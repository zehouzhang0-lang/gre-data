import test from 'node:test';
import assert from 'node:assert/strict';
import { openRepository, emptyData } from '../src/data/repository.mjs';
import { cleanPayload, validateData } from '../src/data/model.mjs';
import { readPackage } from '../src/data/packages.mjs';

const now = () => new Date('2026-10-16T15:00:00Z');
function memory() {
  return { kind: 'memory', value: null, writes: 0, async read() { return this.value; }, async write(value) { this.value = value; this.writes++; } };
}
function fixture(size = 100) {
  const data = emptyData('Asia/Kuala_Lumpur');
  // Deliberately synthetic entries kept entirely in memory. Distinct meanings
  // exercise actual choice validation without reading or writing study records.
  data.baseline.vocabulary = Array.from({ length: size }, (_, i) => ({
    word: `test-word-${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`,
    meaning: String.fromCharCode(0x4e00 + i), pos: 'n.', note: 'isolated test fixture',
  }));
  return validateData(data);
}
async function answerNext(repo, sessionId) {
  const session = (await repo.getState()).vocabSessions.find(s => s.session_id === sessionId);
  const item = session.items.find(i => i.word === session.next.word);
  assert.equal(item.choices.length, 4);
  return repo.saveEvent('vocab_drill', {
    session_id: sessionId, word: item.word, stage: session.next.stage,
    answer: item.word, result: 'correct', response_mode: 'choice',
  });
}

for (const size of [1, 20, 37, 100]) {
  test(`${size}-word custom round retains order, snapshots and progress through reopen and backup restore`, async () => {
    const seed = fixture(), storage = memory();
    let repo = await openRepository({ storage, seed, now });
    // Reverse selection to prove callers' order is preserved, not re-sorted.
    const words = seed.baseline.vocabulary.slice(0, size).map(w => w.word).reverse();
    const sessionId = crypto.randomUUID();
    const created = await repo.saveEvent('vocab_session', { session_id: sessionId, words, meaning_passes: 2 });
    assert.deepEqual(created.payload.words, words);
    assert.deepEqual(created.payload.items.map(i => i.word), words);
    assert.equal(created.payload.items.length, size);
    const snapshots = structuredClone(created.payload.items);
    const drill = await answerNext(repo, sessionId);
    assert.equal(drill.payload.assessment, 'locally_checked');

    await repo.saveEvent('vocab_upsert', { word: words[0], meaning: 'changed after session start', pos: 'n.', note: '' });
    const before = await repo.getState();
    assert.deepEqual(before.vocabSessions[0].items, snapshots);
    assert.equal(before.vocabSessions[0].passed, 1);
    assert.equal(before.vocabSessions[0].drill_count, 1);
    assert.equal(before.vocabSessions[0].total, size * 4);
    assert.deepEqual(before.vocabSessions[0].completed_words, []);
    assert(before.vocabulary.every(w => w.recalls.length === 0));
    const originalData = JSON.parse(storage.value).current;
    await repo.close();

    repo = await openRepository({ storage, seed: emptyData(), now });
    const reopened = await repo.getState();
    assert.deepEqual(reopened.vocabSessions, before.vocabSessions);
    assert.deepEqual(reopened.vocabDrills, before.vocabDrills);
    const backup = await repo.backup();
    assert.deepEqual((await readPackage(backup)).data, originalData);

    const restoredStorage = memory();
    const replacement = await openRepository({ storage: restoredStorage, seed: emptyData(), now });
    await replacement.restore(backup);
    await replacement.close();
    const restored = await openRepository({ storage: restoredStorage, now });
    const after = await restored.getState();
    assert.deepEqual(after.vocabSessions, before.vocabSessions);
    assert.deepEqual(after.vocabDrills, before.vocabDrills);
    assert.deepEqual(JSON.parse(restoredStorage.value).current, originalData);
    await answerNext(restored, sessionId);
    const continued = (await restored.getState()).vocabSessions[0];
    assert.equal(continued.passed, 2);
    assert.equal(continued.drill_count, 2);
    assert.deepEqual(continued.items, snapshots);
    await repo.close();
    await restored.close();
  });
}

test('custom rounds reject invalid selections atomically, including an invalid item after the former 20-word boundary', async () => {
  const seed = fixture();
  seed.baseline.vocabulary.push({ word: 'undefined-meaning', meaning: '' });
  seed.baseline.vocabulary.push({ word: 'hidden-word', meaning: 'hidden', deleted: true });
  const storage = memory(), repo = await openRepository({ storage, seed, now });
  const words = seed.baseline.vocabulary.slice(0, 37).map(w => w.word);
  for (const selection of [[], [...words, words[0].toUpperCase()], [...words, 'unknown-word'], [...words, 'undefined-meaning'], [...words, 'hidden-word']]) {
    const saved = storage.value, writes = storage.writes;
    await assert.rejects(repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words: selection, meaning_passes: 2 }));
    assert.equal(storage.value, saved);
    assert.equal(storage.writes, writes);
    assert.equal((await repo.getState()).vocabSessions.length, 0);
  }
  await repo.close();
});

test('custom round arrays retain the common structural safeguard', () => {
  const payload = { session_id: crypto.randomUUID(), words: Array.from({ length: 50000 }, (_, i) => `word-${i}`), meaning_passes: 1 };
  assert.equal(cleanPayload('vocab_session', payload).words.length, 50000);
  assert.throws(() => cleanPayload('vocab_session', { ...payload, words: [...payload.words, 'overflow'] }), /数量/);
});
