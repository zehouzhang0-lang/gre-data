import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {projectReview,legacyWordReviews,dayKey} from '../server/spaced-review.mjs';
import {readLegacyQuestions} from '../server/legacy-review.mjs';
import {Store,grade} from '../server/store.mjs';
const vocabulary=[{word:'gloomy',meaning:'忧郁的'},{word:'blank',meaning:''},{word:'new',meaning:'新的'}];
const event=(kind,payload,recorded_at,id=recorded_at)=>({id,kind,payload,recorded_at});
const word=(rating,date,id)=>event('vocab_recall',{word:'gloomy',self_rating:rating},date,id);
const project=(events,now,extra={})=>projectReview({vocabulary,events,grade,now:new Date(now),...extra});
const find=s=>s.items.find(i=>i.word==='gloomy');

test('spaced review grows on due days; early and same-day repetitions cannot skip stages',()=>{
  const events=[word('remembered','2026-09-01T16:10:00Z')]; // Sep 2 in Shanghai
  let s=project(events,'2026-09-01T16:15:00Z');
  assert.equal(s.today,'2026-09-02');assert.equal(find(s).due_date,'2026-09-03');assert.equal(find(s).review_count,0);assert.equal(s.summary.word.first_today,1);
  events.push(word('remembered','2026-09-02T09:00:00Z'));
  s=project(events,'2026-09-02T09:01:00Z');assert.equal(find(s).stage,0);assert.equal(find(s).due_date,'2026-09-03');assert.equal(find(s).review_count,1);
  events.push(word('remembered','2026-09-03T01:00:00Z'));
  s=project(events,'2026-09-03T01:01:00Z');assert.equal(find(s).stage,1);assert.equal(find(s).due_date,'2026-09-05');assert.equal(s.summary.word.completed,1);
  events.push(word('remembered','2026-09-03T02:00:00Z'));
  assert.equal(find(project(events,'2026-09-03T02:01:00Z')).due_date,'2026-09-05');
  assert.equal(find(project(events,'2026-09-06T01:00:00Z')).overdue,true);
});
test('failure waits ten minutes, remains due today, then reappears; partial is next-day',()=>{
  const events=[word('remembered','2026-09-01T01:00:00Z'),word('forgotten','2026-09-02T01:00:00Z')];
  let s=project(events,'2026-09-02T01:09:00Z');assert.equal(s.summary.word.due,0);assert.equal(s.summary.word.waiting,1);assert.equal(s.summary.word.completed,0);assert.equal(s.summary.word.remaining,1);
  s=project(events,'2026-09-02T01:10:00Z');assert.equal(s.summary.word.due,1);
  events.push(word('remembered','2026-09-02T01:11:00Z'));
  s=project(events,'2026-09-02T01:12:00Z');assert.equal(find(s).due_date,'2026-09-03');assert.equal(find(s).stage,0);assert.equal(s.summary.word.completed,1);assert.equal(s.summary.word.repetitions,2);
  events.push(word('partial','2026-09-03T01:00:00Z'));assert.equal(find(project(events,'2026-09-03T02:00:00Z')).due_date,'2026-09-04');
});
test('question attempts enroll automatically and use answers available at submission time',()=>{
  const q={material:'book',unit:'one',question:'1',type:'tc'};
  const events=[event('attempt',{...q,answer:'B'},'2026-09-01T01:00:00Z'),event('keys_import',{items:[{...q,answer:'A'}]},'2026-09-01T02:00:00Z')];
  let s=project(events,'2026-09-01T03:00:00Z');let item=s.items.find(i=>i.kind==='question');assert.equal(item.last_result,'unknown');assert.equal(item.due_date,'2026-09-02');assert.equal(item.attempt_count,1);
  events.push(event('attempt',{...q,answer:'B'},'2026-09-02T01:00:00Z'));
  s=project(events,'2026-09-02T01:11:00Z');item=s.items.find(i=>i.kind==='question');assert.equal(item.review_count,1);assert.equal(item.last_result,'forgotten');assert.equal(item.due,true);
  events.push(event('attempts_import',{items:[{...q,answer:'A'}]},'2026-09-02T01:12:00Z'));
  item=project(events,'2026-09-02T02:00:00Z').items.find(i=>i.kind==='question');assert.equal(item.attempt_count,3);assert.equal(item.review_count,2);assert.equal(item.due_date,'2026-09-03');
});
test('legacy counters do not sum overlapping evidence, blocked and untested words stay distinct',()=>{
  const evidence={word:'gloomy',record:'vocab/homework/20260901_1300_test.md',recorded_at:'2026-09-01T13:00:00+08:00'};
  const legacyWords=legacyWordReviews({homework:{groups:[{status:'answered',record:evidence.record,responses:[{word:'gloomy'}]}]},lexicon:{items:[{word:'gloomy',review_evidence:[evidence]}]},difficult:{items:[{word:'gloomy',review_count:3,last_review:'2026-09-01'},{word:'blank',review_count:1,last_review:'2026-09-01'}]},mastered:{items:[]}});
  assert.equal(legacyWords[0].review_count,3);
  let s=project([word('remembered','2026-09-02T01:00:00Z')],'2026-09-02T01:01:00Z',{legacyWords});assert.equal(find(s).review_count,4);assert.equal(s.summary.word.blocked,1);assert.equal(s.summary.word.new,1);
  s=project([],'2026-09-02T01:01:00Z',{legacyWords,vocabulary:[{word:'gloomy',meaning:'忧郁',deleted:true}]});assert.equal(s.items.length,0);
});
test('legacy question migration excludes unsubmitted answers; fresh day changes revision without writes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gre-spaced-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new Store(root);await fs.mkdir(path.join(root,'verbal/submissions'),{recursive:true});
  await fs.writeFile(path.join(root,'verbal/submissions/test.md'),'---\nmode: text_completion\ndate: "2026-09-01"\nsource: {material_id: book, unit: one, question_range: "1-2"}\nanswered: 1\nerrors:\n  - {question_id: "1", user_answer: A}\n  - {question_id: "2", user_answer: null}\n---\n');
  const old=await readLegacyQuestions(store);assert.deepEqual(old.map(q=>q.question),['1']);
  const before=await store.state(new Date('2026-09-01T15:59:00Z')),after=await store.state(new Date('2026-09-01T16:00:00Z'));
  assert.notEqual(before.revision,after.revision);assert.equal(before.spacedReview.summary.question.due,0);assert.equal(after.spacedReview.summary.question.due,1);assert.equal((await store.events()).length,0);
  assert.equal(dayKey('2026-09-01T23:00:00Z','America/New_York'),'2026-09-01');
});
