import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, validate, grade } from '../server/store.mjs';
import { quickReviewEvents } from '../shared/quick-review.mjs';
import { projectReview } from '../server/spaced-review.mjs';
import { wallEntries, wallSettings, wordRating, dragSelection, intersectsBox } from '../web/src/word-wall-model.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gre-quick-review-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  for (const word of ['abash', 'aback', 'abate']) await store.append('vocab_upsert', { word, meaning: `测试释义 ${word}` });
  return store;
}
test('atomic quick batch, idempotent retry, correction, undo and fresh round preserve evidence', async t => {
  const store = await fixture(t), session_id = randomUUID(), id = randomUUID();
  const payload = { session_id, items: ['abash', 'aback'].map(word => ({ word, self_rating: 'forgotten' })) };
  const first = await store.append('vocab_quick_review', payload, id);
  await store.append('vocab_quick_review', payload, id);
  let state = await store.state();
  assert.equal(state.vocabulary.find(w => w.word === 'abash').recalls.length, 1);
  assert.equal(state.spacedReview.items.find(i => i.word === 'abash').platform_count, 1);
  assert.equal(state.vocabulary.find(w => w.word === 'abash').status, '未检验');
  const corrected = await store.append('vocab_quick_review', { session_id, items: [{word:'abash',self_rating:'remembered'}] });
  state = await store.state();
  const recall = state.vocabulary.find(w => w.word === 'abash').recalls[0];
  assert.equal(recall.self_rating, 'remembered'); assert.equal(recall.recorded_at, first.recorded_at);
  assert.equal(recall.assessment, 'self_reported');
  assert.equal(state.spacedReview.items.find(i => i.word === 'abash').platform_count, 1);
  await store.append('vocab_quick_undo', {target_id:corrected.id});
  state = await store.state(); assert.equal(wordRating(state.vocabulary.find(w => w.word === 'abash')), 'forgotten');
  await store.append('vocab_quick_undo', {target_id:first.id});
  state = await store.state();
  assert.equal(state.vocabulary.find(w => w.word === 'abash').recalls.length, 0);
  assert.equal(state.spacedReview.items.find(i => i.word === 'abash').has_history, false);
  await store.append('vocab_quick_review', { ...payload, session_id: randomUUID() });
  state = await store.state(); assert.equal(state.vocabulary.find(w => w.word === 'abash').recalls.length, 1);
  assert.deepEqual((await store.events()).find(e => e.id === first.id), first);
});
test('unknown or removed words reject whole batch; invalid ratings and unrelated undo rejected', async t => {
  const store = await fixture(t), session_id = randomUUID();
  const count = (await store.events()).length;
  await assert.rejects(store.append('vocab_quick_review', { session_id, items:[{word:'abash',self_rating:'partial'},{word:'missing',self_rating:'partial'}] }));
  assert.equal((await store.events()).length, count);
  const deleted = await store.append('vocab_delete', {word:'abash'});
  await assert.rejects(store.append('vocab_quick_review', { session_id, items:[{word:'abash',self_rating:'partial'}] }));
  await assert.rejects(store.append('vocab_quick_undo', {target_id:deleted.id}));
  assert.throws(() => validate('vocab_quick_review', {session_id,items:[{word:'x',self_rating:'mastered'}]}));
  assert.throws(() => validate('vocab_quick_review', {session_id,items:[{word:'X',self_rating:'partial'},{word:'x',self_rating:'partial'}]}));
});
test('quick self-ratings use spaced review without advancing early repetitions or counting undo', () => {
  const vocabulary = [{word:'abash',meaning:'测试'}], session1 = randomUUID(), session2 = randomUUID();
  const event = (time,session_id,rating) => ({id:randomUUID(),kind:'vocab_quick_review',recorded_at:time,payload:{session_id,items:[{word:'abash',self_rating:rating}]}});
  const first = event('2026-10-10T01:00:00Z',session1,'forgotten');
  const state = events => projectReview({vocabulary,events,grade,now:new Date('2026-10-10T02:00:00Z')}).items[0];
  assert.equal(state([first]).retry_at,'2026-10-10T01:10:00.000Z');
  const correction = event('2026-10-10T01:01:00Z',session1,'partial');
  assert.equal(state([first,correction]).platform_count,1);
  assert.equal(state([first,correction]).due_date,'2026-10-11');
  const second = event('2026-10-10T01:11:00Z',session2,'remembered');
  const s=state([first,second]);assert.equal(s.platform_count,2);assert.equal(s.stage,0);assert.equal(s.due_date,'2026-10-11');
  const undo={id:randomUUID(),kind:'vocab_quick_undo',recorded_at:'2026-10-10T01:12:00Z',payload:{target_id:second.id}};
  assert.equal(state([first,second,undo]).platform_count,1);
  assert.equal(quickReviewEvents([first,correction]).length,1);
});
test('group layout keeps overlapping groups adjacent without adding filtered-out members', () => {
  const words=['aback','abash','abate'].map(word=>({word}));
  const groups=[{id:'a',type:'lookalike',members:[{word:'abash'},{word:'aback'}]},{id:'b',type:'lookalike',members:[{word:'abash'},{word:'abate'}]}];
  const entries=wallEntries(words,groups,'lookalike','',false);
  assert.deepEqual(entries.map(e=>e.word),['aback','abash','abash','abate']);
  assert.equal(new Set(entries.map(e=>e.key)).size,4);
  assert.equal(new Set(entries.map(e=>e.word)).size,3);
  assert.deepEqual(wallEntries(words.slice(0,1),groups,'lookalike','',false).map(e=>e.word),['aback']);
  assert.equal(wallEntries(words,groups,'antonym','',false).length,0);
  assert.deepEqual(wallEntries(words,groups,'lookalike','b',false).map(e=>e.word),['abash','abate']);
});
test('layout preferences clamp invalid values and unmarked is never remembered', () => {
  assert.deepEqual(wallSettings(),{columns:12,rows:10,height:64,font:16});
  assert.deepEqual(wallSettings({columns:100,rows:-1,height:1,font:'oops'}),{columns:18,rows:3,height:48,font:16});
  assert.equal(wordRating({recalls:[]}), 'unrated');
});

test('desktop marquee replaces, adds or toggles from its starting snapshot and deduplicates groups', () => {
  const base = new Set(['abash', 'aback']), hits = ['aback', 'abate', 'abate'];
  assert.deepEqual([...dragSelection(base, hits)], ['aback', 'abate']);
  assert.deepEqual([...dragSelection(base, hits, 'add')], ['abash', 'aback', 'abate']);
  assert.deepEqual([...dragSelection(base, hits, 'toggle')], ['abash', 'abate']);
  assert.deepEqual([...base], ['abash', 'aback']);
  assert.deepEqual([...dragSelection(base, [], 'toggle')], [...base]);
  assert.equal(intersectsBox({left:0,right:50,top:0,bottom:50},{left:49,right:100,top:49,bottom:100}), true);
  assert.equal(intersectsBox({left:0,right:50,top:0,bottom:50},{left:50,right:100,top:0,bottom:50}), false);
});
