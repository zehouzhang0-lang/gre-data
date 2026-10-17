import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practiceProgress, resumeQuestion, nextFreshQuestion, firstFreshIn } from '../web/src/practice-navigation.mjs';

const q = (key, content_id = key, unit = 'u') => ({ key, material: 'book', unit, question: key, type: 'se', content_id });
const questions = [q('a', 'same'), q('b', 'same', 'v'), q('c', 'new', 'v'), q('d', 'other', 'v')];

test('same-content completion skips aliases without claiming original source was answered', () => {
  const snapshot = JSON.stringify(questions);
  const p = practiceProgress(questions, { completed: ['a'] });
  assert.deepEqual([...p.completedKeys], ['a']);
  assert.deepEqual([...p.skippedKeys], ['b']);
  assert.equal(p.completedContentCount, 1);
  assert.equal(p.totalContent, 3);
  assert.equal(nextFreshQuestion(questions, p, 'a').key, 'c');
  assert.equal(firstFreshIn(questions, p, 'book', 'v').key, 'c');
  assert.equal(JSON.stringify(questions), snapshot);
});

test('resume rejects completed source or alias even with stale backend recommendation, but keeps unseen draft position', () => {
  const p = practiceProgress(questions, { attempts: [{ key: 'a', type: 'se' }] });
  assert.equal(resumeQuestion(questions, p, 'b', 'a').key, 'c');
  assert.equal(resumeQuestion(questions, p, 'a', 'b').key, 'c');
  assert.equal(resumeQuestion(questions, p, 'd', 'c').key, 'd');
});

test('confirmed save skips duplicates before state refresh; drafts alone do not complete content', () => {
  assert.equal(nextFreshQuestion(questions, practiceProgress(questions), 'a').key, 'b');
  const p = practiceProgress(questions, { confirmedAttempts: [{ key: 'a', type: 'se' }] });
  assert.equal(nextFreshQuestion(questions, p, 'a').key, 'c');
  assert.equal(resumeQuestion(questions, p, 'b', 'a').key, 'c');
});

test('all done is empty, and end-of-bank wrap finds only earlier unseen content', () => {
  const full = practiceProgress(questions, { completed: ['a', 'c', 'd'] });
  assert.equal(resumeQuestion(questions, full, 'b', null), undefined);
  assert.equal(nextFreshQuestion(questions, full, 'd', 1, true), undefined);
  assert.equal(firstFreshIn(questions, full, 'book', 'v'), undefined);
  const partial = practiceProgress(questions, { completed: ['c', 'd'] });
  assert.equal(nextFreshQuestion(questions, partial, 'd', 1, true).key, 'a');
  assert.equal(nextFreshQuestion(questions, partial, 'a', -1), undefined);
});

test('unavailable content IDs stay independent and updated content mappings do not reuse stale groups', () => {
  const unknown = [{ key: 'x' }, { key: 'y' }];
  assert.equal(nextFreshQuestion(unknown, practiceProgress(unknown, { completed: ['x'] }), 'x').key, 'y');
  const updated = [q('a', 'changed'), q('b', 'same')];
  assert.equal(resumeQuestion(updated, practiceProgress(updated, { completed: ['a'] }), 'b', null).key, 'b');
});

test('attempts and successful-save acknowledgements from another type never complete this bank', () => {
  const p = practiceProgress(questions, { attempts: [{ key: 'a', type: 'tc' }], confirmedAttempts: [{ key: 'c', type: 'tc' }] });
  assert.equal(p.completedContentCount, 0);
  assert.equal(resumeQuestion(questions, p, 'b', null).key, 'b');
  assert.equal(nextFreshQuestion(questions, p, 'b').key, 'c');
});
