import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {projectRelations} from '../server/word-relations.mjs';

test('classification overrides and group CRUD retain word history and survive reload', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gre-relations-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new Store(root);
  await fs.mkdir(path.join(root,'vocab'),{recursive:true});
  await fs.writeFile(path.join(root,'vocab/relations.json'),JSON.stringify({topics:[{id:'mood',name:'心情',pattern:'悲观'},{id:'environment',name:'环境',pattern:'阴暗'}],groups:[]}));
  await store.append('vocab_upsert',{word:'gloomy',meaning:'悲观；阴暗'});
  await store.append('vocab_upsert',{word:'downbeat',meaning:'悲观'});
  await store.append('vocab_recall',{word:'gloomy',answer:'阴暗',self_rating:'partial',mode:'recall'});
  assert.deepEqual((await store.state()).relations.assignments.find(a=>a.word==='gloomy').topics,['mood','environment']);
  await store.append('word_topics',{word:'gloomy',topics:[]});
  assert.deepEqual((await store.state()).relations.assignments.find(a=>a.word==='gloomy').topics,[]);
  await store.append('word_topics',{word:'gloomy',topics:[],automatic:true});
  await store.append('topic_delete',{id:'mood'});
  assert.deepEqual((await store.state()).relations.assignments.find(a=>a.word==='gloomy').topics,['environment']);
  await store.append('topic_restore',{id:'mood'});
  const payload={id:'low-mood',type:'synonym',title:'低落',note:'注意对象',members:[{word:'gloomy',usage:'可用于环境'},{word:'downbeat',usage:'情绪或评价'}]},operation=randomUUID();
  await store.append('relation_upsert',payload,operation);
  await store.append('relation_upsert',{...payload,title:'低落的区别'});
  await store.append('relation_delete',{id:payload.id});
  assert.equal((await store.state()).relations.groups[0].deleted,true);
  await store.append('relation_restore',{id:payload.id});
  await store.append('vocab_delete',{word:'downbeat'});
  await store.append('relation_upsert',payload,operation); // retry original event remains idempotent
  const state=await new Store(root).state();
  assert.equal(state.relations.groups[0].title,'低落的区别');
  assert.equal(state.relations.groups[0].deleted,false);
  assert.equal(state.relations.groups[0].members[1].available,false);
  assert.equal(state.vocabulary.find(w=>w.word==='gloomy').recalls.length,1);
  await assert.rejects(store.append('relation_upsert',{...payload,id:'other'}),/生词本/);
  await assert.rejects(store.append('relation_upsert',{...payload,members:[payload.members[0],payload.members[0]]}),/重复/);
  await assert.rejects(store.append('word_topics',{word:'gloomy',topics:['missing']}),/不存在/);
  await assert.rejects(store.append('topic_upsert',{id:'duplicate',name:'心情'}),/同名/);
});

test('spelling suggestions never become semantic facts; curated pairs are excluded',()=>{
  const words=['wane','wary','ware','gloomy'].map(word=>({word,meaning:''}));
  const seed={topics:[],groups:[]};
  const state=projectRelations(words,seed,[]);
  assert.equal(state.groups.length,0);
  assert(state.suggestions.some(s=>s.pair==='ware|wary'));
  seed.groups=[{id:'pair',type:'lookalike',members:[{word:'ware'},{word:'wary'}]}];
  assert(!projectRelations(words,seed,[]).suggestions.some(s=>s.pair==='ware|wary'));
});

test('shipped groups refer to existing vocabulary and all topic patterns compile',async()=>{
  const root=path.resolve(import.meta.dirname,'../..'),state=await new Store(root).state();
  assert(state.relations.groups.length>=35);
  assert(state.relations.groups.every(g=>g.members.every(m=>state.vocabulary.some(w=>w.word===m.word))));
  assert(state.relations.topics.length>=16);
});
