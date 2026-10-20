import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { answerReady, selectAnswer, navigationStatus, unitsFor, unitKey } from './navigation.mjs';
import { readPracticeSnapshot, questionDetail, practiceDataPlugin } from './practice-data.mjs';

test('selection respects pair, multiple, separate blanks, and sentence responses', () => {
  const pair = { mode: 'pair' };
  assert.deepEqual(selectAnswer(pair, ['A', 'B'], 'C'), ['A', 'B']);
  assert.deepEqual(selectAnswer(pair, ['A', 'B'], 'A'), ['B']);
  assert.equal(answerReady(pair, ['A']), false);
  assert.deepEqual(selectAnswer({ mode: 'multiple' }, ['A', 'B'], 'C'), ['A', 'B', 'C']);
  const blanks = { groups: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']] };
  assert.deepEqual(selectAnswer(blanks, ['A', 'E'], 'B'), ['E', 'B']);
  assert.equal(answerReady(blanks, ['A', 'B', 'C']), false);
  assert.equal(answerReady(blanks, ['A', 'D', 'I']), true);
  assert.equal(answerReady({ mode: 'entry' }, ['  ']), false);
  assert.deepEqual(selectAnswer({ mode: 'sentence' }, ['Earlier sentence.'], 'Exact original sentence.'), ['Exact original sentence.']);
});

test('navigation keeps source identity and separates saved records from preview drafts', () => {
  const first = { key: 'first', material: 'one', unit: 'passage1', unitLabel: 'Passage 1', materialLabel: 'Source A', submitted: true };
  const second = { ...first, key: 'second', material: 'two', materialLabel: 'Source B', submitted: false };
  assert.notEqual(unitKey(first), unitKey(second));
  assert.equal(unitsFor([first, second]).length, 2);
  assert.equal(unitsFor([first, second], 'source b').length, 1);
  assert.equal(navigationStatus(first, {}, {}), 'submitted');
  assert.equal(navigationStatus(first, { first: ['A'] }, {}), 'draft');
  assert.equal(navigationStatus(first, { first: ['A'] }, { first: true }), 'preview');
  assert.equal(first.submitted, true);
  assert.equal(navigationStatus(second, {}, {}), 'unseen');
});

test('history reads are immutable, timezone aware, and do not double count legacy evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gre-navigation-'));
  try {
    await fs.mkdir(path.join(root, '.gre-platform'));
    await fs.mkdir(path.join(root, 'platform/events'), { recursive: true });
    await fs.mkdir(path.join(root, 'verbal/submissions'), { recursive: true });
    const question = { material: 'text_completion_2000', unit: 'unit1', question: '1', type: 'tc', mode: 'single', prompt: 'Fixture only.', options: ['a', 'b', 'c', 'd', 'e'], native: true };
    question.key = JSON.stringify([question.material, question.unit, question.question]);
    for (const material of ['text_completion_2000', 'reading_440', 'quant_900']) {
      await fs.writeFile(path.join(root, '.gre-platform', `questions-${material}.json`), JSON.stringify({ questions: material === question.material ? [question] : [] }));
    }
    const events = [
      { id: 'a', kind: 'attempt', recorded_at: '2026-10-21T00:00:00+08:00', payload: { ...question, answer: 'A' } },
      { id: 'b', kind: 'attempt', recorded_at: '2026-10-20T20:00:00Z', payload: { ...question, answer: 'B' } },
    ];
    for (const event of events) await fs.writeFile(path.join(root, `platform/events/${event.id}.json`), JSON.stringify(event));
    const legacy = '---\nmode: text_completion\nstarted_at: \"2026-10-19T20:00:00Z\"\nanswered: 1\nsource:\n  material_id: text_completion_2000\n  unit: unit1\n  question_range: \"1\"\n---\n';
    await fs.writeFile(path.join(root, 'verbal/submissions/legacy.md'), legacy);
    const snapshot = await readPracticeSnapshot(root), detail = questionDetail(snapshot, question.key);
    assert.equal(snapshot.catalog.tc.questions.length, 1);
    assert.equal(snapshot.catalog.tc.questions[0].submitted, true);
    assert.equal(detail.history.count, 2);
    assert.equal(detail.history.answer, 'B');
    assert.equal('answer' in detail, false);
    assert.equal('expected' in detail, false);
    assert.equal(questionDetail(snapshot, 'unknown'), null);
    assert.deepEqual(await fs.readdir(path.join(root, 'platform/events')), ['a.json', 'b.json']);
    for (const event of events) assert.equal(await fs.readFile(path.join(root, `platform/events/${event.id}.json`), 'utf8'), JSON.stringify(event));
    assert.equal(await fs.readFile(path.join(root, 'verbal/submissions/legacy.md'), 'utf8'), legacy);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('gre-navigation-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('preview endpoint rejects writes and cross-origin access without loading the real bank', async () => {
  let middleware;
  practiceDataPlugin().configureServer({ middlewares: { use: handler => { middleware = handler; } } });
  for (const [method, headers, expected] of [
    ['POST', { host: '127.0.0.1:4175' }, 405],
    ['GET', { host: 'evil.example:4175' }, 403],
    ['GET', { host: '127.0.0.1:4175', origin: 'https://evil.example' }, 403],
    ['GET', { host: '127.0.0.1:4175', 'sec-fetch-site': 'cross-site' }, 403],
  ]) {
    let status;
    await middleware({ url: '/preview-api/catalog', method, headers }, {
      writeHead: code => { status = code; }, end: () => {},
    }, () => assert.fail('must not forward a preview API request'));
    assert.equal(status, expected);
  }
});
