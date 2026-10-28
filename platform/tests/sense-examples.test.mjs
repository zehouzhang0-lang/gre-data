import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStandardDefinition} from '../shared/standard-definition.mjs';
import {attachSenseExamples,validateQuotationBudget,mergeSenseExampleEntries} from '../shared/sense-examples.mjs';
import {openRepository,emptyData} from '../mobile/src/data/repository.mjs';
import {createPackage,readPackage,SEED_FORMAT} from '../mobile/src/data/packages.mjs';
const example={en:'These seats are reserved for special guests.',zh:'这些座位专为贵宾保留。',kind:'quotation',review_status:'source_checked',source:{publisher:'Oxford Advanced Learner’s Dictionary',url:'https://www.oxfordlearnersdictionaries.com/definition/english/reserve_2'}};
const definition={word:'reserve',input:{pos:'v.',meaning:'保留；预订'},senses:[{pos:'v.',meanings:['保留','预订']}],status:'dictionary_checked',sources:[]};
const original={en:'The committee will reserve two seats for local residents.',zh:'委员会将为当地居民保留两个席位。',kind:'coach_original',review_status:'coach_authored',source:{publisher:'GRE AI教练（自拟）',created_at:'2026-10-29',record:'vocab/examples/verified-20261028-corpus.json'}};

test('explicitly authored examples remain distinct from quotations and cannot carry fake dictionary attribution',()=>{
 const enriched=attachSenseExamples(definition,{senses:[{...definition.senses[0],examples:[original,null]}]});
 assert.deepEqual(validateStandardDefinition(enriched).senses[0].examples[0],original);
 validateQuotationBudget([{senses:[{examples:Array(50).fill(original)}]}]);
 for(const bad of [{...original,review_status:'source_checked'},{...original,source:{...original.source,url:'https://www.merriam-webster.com/dictionary/reserve'}},{...original,source:{...original.source,publisher:'ETS'}},{...original,source:{...original.source,record:'../../secrets.json'}}]) assert.throws(()=>attachSenseExamples(definition,{senses:[{...definition.senses[0],examples:[bad,null]}]}));
});

test('supplements fill nulls without replacing quotes or reassigning old sense positions',()=>{
 const entry={word:'reserve',senses:[{...definition.senses[0],examples:[example,null]}]};
 const supplement={word:'reserve',senses:[{...definition.senses[0],examples:[null,original]}]};
 const merged=mergeSenseExampleEntries([entry,supplement]);
 assert.deepEqual(merged[0].senses[0].examples,[example,original]);
 assert.equal(entry.senses[0].examples[1],null);
 assert.throws(()=>mergeSenseExampleEntries([entry,{...supplement,senses:[{...supplement.senses[0],examples:[original,null]}]}]));
 assert.throws(()=>mergeSenseExampleEntries([entry,{...supplement,senses:[{...supplement.senses[0],meanings:['预订','保留']}]}]));
});
test('source examples survive validation and remain attached to the exact sense',()=>{
 const enriched=attachSenseExamples(definition,{senses:[{...definition.senses[0],examples:[example,null]}]});
 assert.deepEqual(validateStandardDefinition(enriched).senses[0].examples,[example,null]);
 const edited=attachSenseExamples({...definition,senses:[{pos:'v.',meanings:['预订','保留']}]},enriched);
 assert.deepEqual(edited.senses[0].examples,[null,null]);
 assert.throws(()=>validateStandardDefinition({...enriched,senses:[{...enriched.senses[0],examples:[example]}]}));
});
test('rejects invented source labels, unapproved hosts and excessive per-page quotation',()=>{
 for(const bad of [{...example,kind:'authored'},{...example,source:{...example.source,url:'https://oxfordlearnersdictionaries.com.evil.example/'}},{...example,review_status:'draft'},{...example,zh:''}]) {
  assert.throws(()=>attachSenseExamples(definition,{senses:[{...definition.senses[0],examples:[bad,null]}]}));
 }
 assert.throws(()=>validateQuotationBudget([{senses:[{examples:Array(4).fill(example)}]}]));
 validateQuotationBudget([{senses:[{examples:[example,null]}]}]);
});
test('catalog update and subsequent backup retain examples without changing phone recall evidence',async()=>{
 const initial=emptyData();initial.baseline.vocabulary=[{word:'reserve',...definition.input}];
 const storage={value:null,async read(){return this.value},async write(v){this.value=v}};
 const repo=await openRepository({storage,seed:initial});
 await repo.rate(['reserve'],'partial');
 const before=(await readPackage(await repo.backup())).data;
 const incoming=structuredClone(before);incoming.baseline.definitions=[attachSenseExamples(definition,{senses:[{...definition.senses[0],examples:[example,null]}]})];
 const packet=await createPackage(incoming,SEED_FORMAT);
 const upgraded=await openRepository({storage,catalogUpdate:{revision:'examples-test',load:async()=>packet}});
 const exported=(await readPackage(await upgraded.backup())).data;
 assert.deepEqual(exported.events,before.events);
 assert.deepEqual(exported.baseline.definitions[0].senses[0].examples,[example,null]);
 const reopened=await openRepository({storage});
 assert.equal((await reopened.getState()).vocabulary[0].senses[0].examples[0].en,example.en);
});

test('ETS page locators survive validation and PDF aliases share one quotation budget',()=>{
 const ets={...example,source:{publisher:'ETS',url:'https://www.ets.org/pdfs/gre/sample-issue-task.pdf#page=8',locator:'PDF 第 8 页 · 官方点评'}};
 const enriched=attachSenseExamples(definition,{senses:[{...definition.senses[0],examples:[ets,null]}]});
 assert.deepEqual(validateStandardDefinition(enriched).senses[0].examples[0].source,ets.source);
 const alias={...ets,source:{...ets.source,url:'https://www.ets.org/content/dam/ets-org/pdfs/gre/sample-issue-task.pdf#page=9'}};
 assert.throws(()=>validateQuotationBudget([{senses:[{examples:[ets,ets,alias,alias]}]}]));
});
