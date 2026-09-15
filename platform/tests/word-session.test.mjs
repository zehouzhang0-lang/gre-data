import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store,validate,grade} from '../server/store.mjs';
import {projectReview} from '../server/spaced-review.mjs';
import {clozeFor,drillResult,meaningChoices,normalizeSpelling,roundProgress} from '../shared/word-session.mjs';

const words=[{word:'gloomy',meaning:'阴暗；沮丧',pos:'adj.'},{word:'copious',meaning:'大量；丰富',pos:'adj.'},{word:'hallow',meaning:'使神圣',pos:'v.'},{word:'trocar',meaning:'套管针',pos:'n.'},{word:'panoply',meaning:'全套装备',pos:'n.'}];
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gre-word-round-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'vocab'),{recursive:true});await fs.writeFile(path.join(root,'vocab/lexicon.json'),JSON.stringify({items:words}));
  return new Store(root);
}
test('round prompts normalize spelling conservatively and omit ambiguous or related distractors',()=>{
  assert.equal(normalizeSpelling('  FACE–TO–FACE  '),'face-to-face');
  const cloze=clozeFor('gloomy');assert.equal(cloze.display,'g___my');assert.equal(cloze.missing,'loo');
  const item={word:'gloomy',choices:[]};assert.equal(drillResult(item,{stage:'cloze',answer:'LOO',result:'correct'}),'correct');
  assert.equal(drillResult(item,{stage:'spelling',answer:'glooomy',result:'correct'}),'incorrect');
  assert.equal(drillResult(item,{stage:'spelling',answer:'  GLOOMY ',result:'correct'}),'correct');
  const related={groups:[{members:[{word:'gloomy'},{word:'copious'}]}]};
  assert.equal(meaningChoices(words[0],words,related,'seed').length,4);
  assert.ok(!meaningChoices(words[0],words,related,'seed').some(c=>c.word==='copious'));
  assert.deepEqual(meaningChoices(words[0],[words[0],{word:'downcast',meaning:'沮丧'}],{},'seed'),[]);
  assert.throws(()=>validate('vocab_session',{session_id:randomUUID(),words:['gloomy','gloomy'],meaning_passes:2}));
  assert.equal(projectReview({vocabulary:[{word:'old',meaning:'',feedback:'旧作答批改'}],events:[],grade}).items[0].ready,false);
});
test('round saves probes durably, requeues errors, validates grading and settles each word once',async t=>{
  const store=await fixture(t),session_id=randomUUID(),startId=randomUUID(),start={session_id,words:['gloomy','copious'],meaning_passes:2};
  const begin=await store.append('vocab_session',start,startId);
  assert.equal((await store.append('vocab_session',start,startId)).id,begin.id);
  const choices=begin.payload.items[0].choices;assert.equal(choices.length,4);
  await assert.rejects(store.append('vocab_recall',{word:'gloomy',mode:'multistage',session_id}),/所有步骤/);
  await assert.rejects(store.append('vocab_drill',{session_id,word:'gloomy',stage:'meaning_1',answer:choices.find(c=>c.word!=='gloomy').word,result:'correct',response_mode:'choice'}),/结果不一致/);
  const wrong={session_id,word:'gloomy',stage:'meaning_1',answer:choices.find(c=>c.word!=='gloomy').word,result:'incorrect',response_mode:'choice'},wrongId=randomUUID();
  await store.append('vocab_drill',wrong,wrongId);await store.append('vocab_drill',wrong,wrongId);
  let state=await new Store(store.root).state();assert.equal(state.vocabDrills.length,1);assert.equal(state.vocabSessions[0].next.word,'copious');
  assert.equal(state.spacedReview.items.find(w=>w.word==='gloomy').platform_count,0);
  await store.append('vocab_upsert',{word:'gloomy',meaning:'修改后的词义',pos:'adj.',note:''});
  state=await store.state();assert.equal(state.vocabSessions[0].items[0].meaning,'阴暗；沮丧');
  while(state.vocabSessions[0].next) {
    const next=state.vocabSessions[0].next,mode=next.stage.startsWith('meaning_')?'choice':'typing';
    await store.append('vocab_drill',{session_id,word:next.word,stage:next.stage,answer:next.word,result:'correct',response_mode:mode});
    state=await new Store(store.root).state();
  }
  assert.equal(state.vocabSessions[0].drill_count,9);assert.deepEqual(new Set(state.vocabSessions[0].pending_completions),new Set(['gloomy','copious']));
  assert.equal(state.spacedReview.items.find(w=>w.word==='gloomy').platform_count,0);
  const recallId=randomUUID(),recall={word:'gloomy',mode:'multistage',session_id};
  const recorded=await store.append('vocab_recall',recall,recallId);
  assert.equal(recorded.payload.self_rating,'forgotten');assert.equal(recorded.payload.assessment,'locally_checked');
  assert.equal((await store.append('vocab_recall',recall,recallId)).id,recorded.id);
  assert.equal((await store.append('vocab_recall',recall,randomUUID())).id,recorded.id);
  await store.append('vocab_recall',{word:'copious',mode:'multistage',session_id});
  state=await store.state();assert.equal(state.vocabSessions[0].complete,true);assert.ok(state.vocabSessions[0].completed_at);
  assert.equal(state.vocabulary.find(w=>w.word==='gloomy').recalls.length,1);assert.equal(state.spacedReview.items.find(w=>w.word==='gloomy').platform_count,1);
  assert.equal(state.events.filter(e=>e.kind==='vocab_recall').length,2);
  const events=await store.events(),duplicate={...recorded,id:randomUUID()},projection=projectReview({vocabulary:state.vocabulary,events:[...events,duplicate],grade});
  assert.equal(projection.items.find(w=>w.word==='gloomy').platform_count,1);
});
test('self-check fallback remains explicit and spelling errors retain partial outcome after retry',async t=>{
  const store=await fixture(t);await fs.writeFile(path.join(store.root,'vocab/lexicon.json'),JSON.stringify({items:[words[0]]}));
  const session_id=randomUUID();await store.append('vocab_session',{session_id,words:['gloomy'],meaning_passes:1});
  await assert.rejects(store.append('vocab_drill',{session_id,word:'gloomy',stage:'meaning_1',answer:'gloomy',result:'correct',response_mode:'choice'}),/方式不匹配/);
  await store.append('vocab_drill',{session_id,word:'gloomy',stage:'meaning_1',answer:'',result:'correct',response_mode:'self_check'});
  await store.append('vocab_drill',{session_id,word:'gloomy',stage:'cloze',answer:'glooy',result:'incorrect',response_mode:'typing'});
  await store.append('vocab_drill',{session_id,word:'gloomy',stage:'cloze',answer:'loo',result:'correct',response_mode:'typing'});
  await store.append('vocab_drill',{session_id,word:'gloomy',stage:'spelling',answer:'GLOOMY',result:'correct',response_mode:'typing'});
  const recall=await store.append('vocab_recall',{session_id,word:'gloomy',mode:'multistage'});assert.equal(recall.payload.self_rating,'partial');assert.equal(recall.payload.assessment,'mixed');
  const state=await store.state();assert.equal(roundProgress(state.vocabSessions[0],state.vocabDrills,state.events).complete,true);
});
