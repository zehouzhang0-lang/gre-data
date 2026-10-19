import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WRITING_NAMESPACE, sessionFromEvent, remainingSeconds, expiredWritingSession, newWritingDraft, editWritingDraft, freezeWritingDraft, submissionPayload, hasWritingContent, readWritingValue, writeWritingValue, writingWordCount, writingTextExport, validWritingExcerpt } from '../web/src/writing-session.mjs';

const start = Date.parse('2026-10-19T08:00:00.000Z');
const topic = { id: 'test', title: 'Test issue', prompt: 'Discuss the claim.', instructions: 'Give reasons.', source_kind: 'coach_original' };
const timed = sessionFromEvent({ id: 'session-test', recorded_at: new Date(start).toISOString(), payload: { topic, mode: 'full_essay', condition: 'timed', parent_id: null } });
function memoryStorage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }

test('session deadline uses server start and never resets when resumed', () => {
  assert.equal(timed.started_at, '2026-10-19T08:00:00.000Z');
  assert.equal(timed.deadline_at, '2026-10-19T08:30:00.000Z');
  const resumed = sessionFromEvent(JSON.parse(JSON.stringify(timed)));
  assert.equal(remainingSeconds(resumed, start + 600_000), 1200);
  assert.equal(remainingSeconds(resumed, start + 1800_000), 0);
  assert.equal(expiredWritingSession(resumed, start + 1800_000), true);
});

test('late input is rejected before it can alter the last honest snapshot', () => {
  let draft = newWritingDraft(timed, {}, start, 'stable-save');
  draft = editWritingDraft(timed, draft, { text: 'My independent answer.', completed: true }, start + 1799_000);
  const late = editWritingDraft(timed, draft, { text: 'Additional late words.' }, start + 1800_001);
  assert.equal(late, draft);
  const frozen = freezeWritingDraft(timed, late, start + 1800_100, 'deadline');
  assert.equal(frozen.frozen.text, 'My independent answer.');
  assert.equal(frozen.frozen.snapshot_at, '2026-10-19T08:29:59.000Z');
  assert.equal(frozen.frozen.frozen_at, '2026-10-19T08:30:00.100Z');
  assert.equal(frozen.save_id, 'stable-save');
});

test('failure retries reuse the frozen content, timestamp, and event ID', () => {
  const draft = newWritingDraft(timed, { text: 'Original answer' }, start + 10_000, 'same-event');
  const frozen = freezeWritingDraft(timed, draft, start + 20_000);
  const again = freezeWritingDraft(timed, frozen, start + 2_000_000);
  assert.equal(again, frozen);
  assert.equal(editWritingDraft(timed, frozen, { text: 'changed' }, start + 25_000), frozen);
  assert.deepEqual(submissionPayload(timed, frozen), submissionPayload(timed, again));
  assert.equal(again.save_id, 'same-event');
});

test('submission payload excludes score, client duration, and local metadata', () => {
  const draft = freezeWritingDraft(timed, newWritingDraft(timed, { text: 'Text' }, start, 'save-id'), start + 1000);
  const payload = submissionPayload(timed, draft);
  assert.deepEqual(Object.keys(payload), ['session_id', 'text', 'outline', 'assistance_used', 'completed', 'snapshot_at']);
  assert.equal(payload.completed, false);
});

test('outline and paragraph cannot declare a completed whole essay', () => {
  for (const mode of ['outline', 'paragraph']) {
    const session = { ...timed, mode, condition: 'practice', deadline_at: null };
    const initial = newWritingDraft(session, {}, start, `save-${mode}`);
    const draft = editWritingDraft(session, initial, { text: 'Some text', outline: 'Some ideas', completed: true }, start + 1000);
    assert.equal(draft.completed, false);
    const frozen = freezeWritingDraft(session, { ...draft, completed: true }, start + 2000);
    assert.equal(submissionPayload(session, frozen).completed, false);
    assert.equal(remainingSeconds(session, start + 1e9), null);
  }
});

test('only outline mode accepts an outline-only submission; empty timed draft is not a fake essay', () => {
  const draft = newWritingDraft(timed, { outline: 'Notes only' }, start, 'outline-only');
  assert.equal(hasWritingContent(timed, draft), false);
  assert.equal(hasWritingContent({ ...timed, mode: 'paragraph' }, draft), false);
  assert.equal(hasWritingContent({ ...timed, mode: 'outline' }, draft), true);
  assert.equal(hasWritingContent(timed, { text: '   ', outline: '' }), false);
});

test('versioned drafts preserve content across serialization and keep sessions isolated', () => {
  const storage = memoryStorage();
  const draft = newWritingDraft(timed, { text: 'Keep this draft', assistance_used: true }, start, 'persisted-event');
  assert.equal(writeWritingValue(storage, 'test-draft-persist', draft).ok, true);
  const serialized = JSON.parse(storage.getItem(`${WRITING_NAMESPACE}test-draft-persist`));
  assert.equal(serialized.version, 1);
  assert.equal(serialized.text, 'Keep this draft');
  assert.equal(readWritingValue(storage, 'test-draft-persist').value.assistance_used, true);
  assert.equal(readWritingValue(storage, 'unrelated-session').value, null);
});

test('corrupt/unsupported storage is visible and is not overwritten by reading', () => {
  const storage = memoryStorage();
  storage.setItem(`${WRITING_NAMESPACE}corrupt-test`, '{broken');
  const result = readWritingValue(storage, 'corrupt-test');
  assert.equal(result.value, null); assert.match(result.error, /无法读取/);
  assert.equal(storage.getItem(`${WRITING_NAMESPACE}corrupt-test`), '{broken');
  storage.setItem(`${WRITING_NAMESPACE}version-test`, JSON.stringify({ version: 2, text: 'future' }));
  assert.match(readWritingValue(storage, 'version-test').error, /版本/);
});

test('quota failures are explicit and retain a volatile copy for SPA navigation', () => {
  const storage = { getItem: () => { throw new Error('Storage blocked'); }, setItem: () => { throw new Error('Quota exceeded'); } };
  const draft = newWritingDraft(timed, { text: 'Recoverable in memory' }, start, 'memory-save');
  const result = writeWritingValue(storage, 'quota-test', draft);
  assert.equal(result.ok, false); assert.match(result.error, /勿刷新/);
  const read = readWritingValue(storage, 'quota-test');
  assert.equal(read.value.text, 'Recoverable in memory'); assert.match(read.error, /无法读取/);
});

test('export includes original task and preserved draft; word counter is not a score', () => {
  const draft = newWritingDraft(timed, { text: "It's a long-term choice.", outline: 'My outline' }, start, 'export-save');
  const output = writingTextExport(timed, draft);
  assert.match(output, /Discuss the claim/); assert.match(output, /Give reasons/); assert.match(output, /My outline/);
  assert.equal(writingWordCount(draft.text), 4);
});

test('partial revisions must begin from a real contiguous excerpt of the original', () => {
  const original = 'The first paragraph.\n\nA second reason with evidence.';
  assert.equal(validWritingExcerpt(original, '  A second reason with evidence.  '), true);
  assert.equal(validWritingExcerpt(original, 'An invented paragraph.'), false);
  assert.equal(validWritingExcerpt(original, ' '), false);
});

test('a failed pointer removal does not resurrect it during same-app navigation', () => {
  const storage = memoryStorage();
  writeWritingValue(storage, 'clear-pointer-test', { session: timed });
  storage.removeItem = () => { throw new Error('Blocked removal'); };
  assert.equal(writeWritingValue(storage, 'clear-pointer-test', null).ok, false);
  assert.equal(readWritingValue(storage, 'clear-pointer-test').value, null);
});
