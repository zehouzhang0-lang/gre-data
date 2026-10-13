import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath}from 'node:url';
import {applyStandardDefinition,validateStandardDefinition,matchesDefinitionFilters}from '../shared/standard-definition.mjs';
import {Store}from '../server/store.mjs';
const definition={word:'reserve',input:{pos:'n./v.',meaning:'储备；保留、预订'},senses:[{pos:'n.',meanings:['储备','矜持']},{pos:'v.',meanings:['保留','预订']}],status:'dictionary_checked',sources:[]};
test('multi-POS formatting preserves evidence and never overwrites later edits',()=>{
 const recalls=[{answer:'原答',self_rating:'partial'}];
 const word={word:'reserve',...definition.input,recalls,deleted:true};
 const normalized=applyStandardDefinition(word,definition);
 assert.equal(normalized.meaning,'n.储备；矜持\nv.保留；预订');
 assert.equal(normalized.recalls,recalls);assert.equal(normalized.deleted,true);
 assert.equal(matchesDefinitionFilters(normalized,{pos:'v.',senses:'multiple'}),true);
 assert.equal(matchesDefinitionFilters(normalized,{pos:'adj.'}),false);
 const edited=applyStandardDefinition({...normalized,meaning:'我的新释义'},definition);
 assert.equal(edited.meaning,'我的新释义');assert.equal(edited.definition_status,'changed');assert.deepEqual(edited.senses,[]);
});
test('rejects empty senses and duplicate POS groups',()=>{
 assert.throws(()=>validateStandardDefinition({...definition,senses:[]}));
 assert.throws(()=>validateStandardDefinition({...definition,senses:[definition.senses[0],definition.senses[0]]}));
 assert.throws(()=>validateStandardDefinition({...definition,senses:[{pos:'n.',meanings:['']}]}));
});
test('whole repository vocabulary has complete structured definitions and categories',async()=>{
 const data=JSON.parse(await fs.readFile(new URL('../../vocab/standardized.json',import.meta.url),'utf8'));
 assert.equal(new Set(data.items.map(w=>w.word)).size,data.items.length);
 data.items.forEach(validateStandardDefinition);
 const state=await new Store(fileURLToPath(new URL('../..',import.meta.url))).state();
 const active=state.vocabulary.filter(w=>!w.deleted);
 assert(active.length>2000);
 for(const w of active){assert(w.senses?.length,w.word);assert(w.meaning.trim(),w.word);assert.notEqual(w.definition_status,'coach_draft',w.word);assert.notEqual(w.definition_status,'changed',w.word);}
 assert.equal(state.relations.assignments.filter(a=>!a.topics.length).length,0);
});
