import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { regionIdentity, validateRegion } from './export-practice.mjs';
import { requiresTextAnswer, safeAssetPath, verifyPractice } from './verify-practice.mjs';
import { readPracticeSnapshot, questionDetail } from '../preview/practice-data.mjs';
import { answerReady, serializedAnswer, validateSelection } from '../src/practice/model.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');

test('image cache shares whole pages without merging different PDF sources or regions', () => {
  const first = { page: 5, left: 0, top: 0, right: 595, bottom: 842, focusTop: 100, focusBottom: 200 };
  assert.equal(regionIdentity('pdf-one', first), regionIdentity('pdf-one', { ...first, focusTop: 400, focusBottom: 700 }));
  assert.notEqual(regionIdentity('pdf-one', first), regionIdentity('pdf-two', first));
  assert.notEqual(regionIdentity('pdf-one', first), regionIdentity('pdf-one', { ...first, page: 6 }));
  validateRegion(first, 595, 842);
  assert.throws(() => validateRegion({ ...first, top: -1 }, 595, 842));
  assert.throws(() => validateRegion({ ...first, bottom: 900 }, 595, 842));
  for (const value of ['../private.json', '/secret', 'C:/private', 'a\\b', 'https://remote', 'a/./b', 'a//b']) assert.throws(() => safeAssetPath(value));
});

test('unreliable PDF labels preserve original metadata and allow the actual missing option', async () => {
  const snapshot = await readPracticeSnapshot();
  // The original PDF's set_p163 Q2 has A–E, but its existing text index only
  // extracted A/C/E. Do not invent the missing texts or block B/D responses.
  const question = questionDetail(snapshot, '["quant_900","set_p163","2"]');
  assert.deepEqual(question.letters, ['A', 'C', 'E']);
  assert.equal(requiresTextAnswer(question), true);
  const detail = { ...question, answerInput: 'text' };
  for (const answer of ['B', 'D']) {
    assert.deepEqual(validateSelection(detail, [answer]), [answer]);
    assert.equal(answerReady(detail, [answer]), true);
    assert.equal(serializedAnswer(detail, [answer]), answer);
  }
  assert.equal(answerReady(detail, [' ']), false);
  assert.equal(answerReady(detail, ['B', 'D']), false);
  assert.equal(requiresTextAnswer({ ...question, native: true }), false);
  assert.equal(requiresTextAnswer({ ...question, letters: [...'ABCDE'] }), false);
  assert.equal(requiresTextAnswer({ ...question, mode: 'multiple', letters: [...'BCDEFGH'] }), true);
  assert.equal(requiresTextAnswer({ ...question, mode: 'multiple', letters: [] }), true);
  assert.equal(requiresTextAnswer({ ...question, mode: 'blanks', letters: [...'ABCDEF'], groups: [[...'ABC']] }), true);
  assert.equal(requiresTextAnswer({ ...question, mode: 'blanks', letters: [...'ABCDEF'], groups: [[...'ABC'], [...'DEF']] }), false);
});

test('offline verifier rejects damaged bytes and missing question images, preserving raw history', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gre-practice-assets-'));
  t.after(async () => {
    const absolute = path.resolve(directory);
    assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith('gre-practice-assets-'));
    await fs.rm(absolute, { recursive: true, force: true });
  });
  const source = { id: 'book', sha256: 'a'.repeat(64), bytes: 20, repo_path: 'materials/book.pdf', pages: 1 };
  const manifest = {
    format: 'gre-practice-bank', version: 1, revision: 'b'.repeat(64), created_at: '2026-10-21T00:00:00Z',
    sources: [source], catalog: {}, assets: [], history: 'history.json',
  };
  const add = async (relative, bytes, fields = {}) => {
    await fs.mkdir(path.dirname(path.join(directory, relative)), { recursive: true });
    await fs.writeFile(path.join(directory, relative), bytes);
    manifest.assets.push({ path: relative, sha256: hash(bytes), bytes: bytes.length, ...fields });
  };
  const imageBytes = await createCanvas(20, 30).encode('webp', 92);
  await add('images/page.webp', imageBytes, {
    source: 'book', source_sha256: source.sha256, media_type: 'image/webp', width: 20, height: 30,
  });
  for (const type of ['se', 'tc', 'rc', 'quant']) {
    const key = JSON.stringify(['book', type, '1']), content_id = hash(type), relative = `${type}.json`;
    const detail = {
      key, content_id, type, material: 'book', unit: type, question: '1',
      prompt: 'Original question fixture', paragraphs: type === 'rc' ? ['Original passage fixture'] : [],
      images: type === 'quant' ? [{ url: './practice/images/page.webp', width: 20, height: 30 }] : [],
      passageImages: [], answerKey: null, provenance: { material: 'book', source_sha256: source.sha256, pdf_pages: [1] },
    };
    manifest.catalog[type] = { recommended: key, questions: [{ key, content_id, type, material: 'book', unit: type, question: '1', detail: relative }] };
    await add(relative, Buffer.from(JSON.stringify(detail)));
  }
  const history = {
    events: [{ id: 'original-event-id', kind: 'attempt', recorded_at: '2026-10-20T23:00:00+08:00', payload: { material: 'book', unit: 'se', question: '1', type: 'se', answer: 'AC' } }],
    legacy: [{ material: 'book', unit: 'tc', question: '1', type: 'tc', recorded_at: '2026-10-19T12:00:00+08:00', record: 'verbal/submissions/actual-source.md' }],
  };
  await add('history.json', Buffer.from(JSON.stringify(history)));
  const updateRevision = value => {
    value.revision = hash(JSON.stringify({ sources: value.sources, catalog: value.catalog, assets: value.assets, renderSettings: value.render_settings }));
  };
  updateRevision(manifest);
  const options = { manifest, expectedCounts: { se: 1, tc: 1, rc: 1, quant: 1 } };
  const result = await verifyPractice(directory, options);
  assert.equal(result.questions, 4);
  assert.equal(result.attempts, 1);
  assert.equal(result.legacy, 1);
  assert.equal(result.images, 1);
  assert.equal(result.drafts, 0); // Old history with no draft fields remains valid.
  const key = manifest.catalog.quant.questions[0].key;
  const draft = {id:'mobile-draft-final',session_id:'mobile-session',key,answer:['17'],redo:false,updated_at:'2026-10-26T15:00:00.000Z'};
  const mobileHistory = {...history,drafts:[{...draft,id:'mobile-draft-earlier',answer:['1']},draft],draft_heads:{},events:[...history.events,{
    id:'mobile-event',kind:'attempt',recorded_at:'2026-10-26T15:00:01.000Z',payload:{material:'book',unit:'quant',question:'1',type:'quant',answer:'17'},
    practice:{draft_session_id:draft.session_id,draft_id:draft.id,bank_revision:'source-revision',content_id:manifest.catalog.quant.questions[0].content_id,
      question_snapshot:{key,mode:'entry'},selected:['17'],answerKey:null,result:null},
  }]};
  const rewriteHistory = async value=>{
    const bytes = Buffer.from(JSON.stringify(value));
    await fs.writeFile(path.join(directory,'history.json'),bytes);
    Object.assign(manifest.assets.find(asset=>asset.path==='history.json'),{sha256:hash(bytes),bytes:bytes.length});
    updateRevision(manifest);
  };
  await rewriteHistory(mobileHistory);
  const mobileResult = await verifyPractice(directory,options);
  assert.equal(mobileResult.events,2);
  assert.equal(mobileResult.attempts,2);
  assert.equal(mobileResult.drafts,2);
  await rewriteHistory({...mobileHistory,drafts:mobileHistory.drafts.slice(0,1)});
  await assert.rejects(verifyPractice(directory,options),/原始草稿/);
  await rewriteHistory({...mobileHistory,draft_heads:{[key]:'missing-draft'}});
  await assert.rejects(verifyPractice(directory,options),/草稿定位/);
  await rewriteHistory(mobileHistory);
  await fs.writeFile(path.join(directory, 'se.json'), '{}');
  await assert.rejects(verifyPractice(directory, options), /资源损坏/);
  // A valid image hash alone does not allow broken references in a detail.
  const corrupted = { ...manifest, assets: manifest.assets.filter(asset => asset.path !== 'images/page.webp') };
  updateRevision(corrupted);
  const se = { ...JSON.parse(await fs.readFile(path.join(directory, 'tc.json'), 'utf8')), type: 'se' };
  // Restore the exact original SE bytes instead of accepting a new identity.
  se.key = manifest.catalog.se.questions[0].key;
  se.content_id = manifest.catalog.se.questions[0].content_id;
  se.unit = 'se';
  await fs.writeFile(path.join(directory, 'se.json'), JSON.stringify(se));
  await assert.rejects(verifyPractice(directory, { ...options, manifest: corrupted }), /缺原题图像/);
});
