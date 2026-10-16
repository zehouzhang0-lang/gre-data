import fs from 'node:fs/promises';
import { Store } from '../server/store.mjs';
import { formatDefinition, validateStandardDefinition } from '../shared/standard-definition.mjs';
import {attachSenseExamples,validateQuotationBudget} from '../shared/sense-examples.mjs';

// Reproducible migration of the effective vocabulary. Source records and recalls
// remain untouched. Unmarked mixed-POS entries require explicit editorial input.
const root=process.cwd(), store=new Store(root);
const readJson=store.json.bind(store);
store.json=(name,fallback)=>name==='vocab/standardized.json'?Promise.resolve({items:[]}):readJson(name,fallback);
const snapshot=await store.state();
const lexicon=await store.json('vocab/lexicon.json');
const originals=new Map(lexicon.items.map(w=>[w.word,w]));
const edits=JSON.parse(await fs.readFile('vocab/definition-edits.json','utf8'));
const checks=await store.json('vocab/definition-checks.json',{items:[]});
const verified=new Map(checks.items.map(x=>[x.word,x]));
const exampleEntries=[];
for(const name of await fs.readdir('vocab/examples').catch(()=>[])) if(/^verified-.*\.json$/.test(name)) exampleEntries.push(...JSON.parse(await fs.readFile('vocab/examples/'+name,'utf8')).items);
if(new Set(exampleEntries.map(x=>x.word)).size!==exampleEntries.length)throw Error('例句词条重复');
validateQuotationBudget(exampleEntries);
const examples=new Map(exampleEntries.map(x=>[x.word,x]));
const chinese={名词:'n.',动词:'v.',形容词:'adj.',副词:'adv.'};
function parse(w) {
  const raw=w.meaning.replace(/（(名词|动词|形容词|副词)）/g,(_,x)=>chinese[x]);
  const tags=[...raw.matchAll(/\b(adj\.|adv\.|n\.|v\.|prep\.|conj\.|pron\.|interj\.|prefix)\s*/g)];
  const positions=[...new Set(w.pos.match(/adj\.|adv\.|n\.|v\.|prep\.|conj\.|pron\.|interj\.|prefix/g)||[])];
  const split=s=>s.replace(/^[；;\s]+|[；;\s]+$/g,'').split(/[；;]/).map(x=>x.trim()).filter(Boolean);
  if(tags.length) {
    const parts=[];
    if(tags[0].index>0 && split(raw.slice(0,tags[0].index)).length) parts.push({pos:positions[0],meanings:split(raw.slice(0,tags[0].index))});
    tags.forEach((t,i)=>parts.push({pos:t[1],meanings:split(raw.slice(t.index+t[0].length,tags[i+1]?.index))}));
    const merged=[];
    for(const p of parts){const old=merged.find(x=>x.pos===p.pos);if(old)old.meanings.push(...p.meanings);else merged.push(p);}
    return merged;
  }
  if(positions.length===1) return [{pos:/phr|短语/.test(w.pos)?positions[0]+' phr.':positions[0],meanings:split(raw)}];
  if(/phrase|短语/.test(w.pos))return [{pos:'phr.',meanings:split(raw)}];
  throw Error('需要逐项整理：'+w.word+' | '+w.pos+' | '+w.meaning);
}
const items=[], failures=[];
for(const w of snapshot.vocabulary) {
  const original=originals.get(w.word), edit=edits[w.word], checked=verified.get(w.word);
  try {
    const senses=edit?.senses || parse(w);
    for(const s of senses)if(!s.pos||!s.meanings.length||s.meanings.some(m=>!m.trim()))throw Error('无效字段：'+w.word);
    const oldSources=original?.meaning===w.meaning ? original.definition_sources||[] : [];
    const historicallyChecked=oldSources.some(s=>['checked','dictionary_checked'].includes(s.status));
    const status=['spelling_pending','spelling_redirect'].includes(edit?.status)?edit.status:checked?'dictionary_checked':historicallyChecked?'historical_checked':'coach_draft';
    items.push(attachSenseExamples({word:w.word,input:{pos:w.pos||'',meaning:w.meaning||''},senses,status,
      sources:checked?[checked.source]:oldSources,
      note:edit?.note||'',normalized_at:'2026-10-13',
      content_type:/\s/.test(w.word)?'phrase':'word',
      formatted:formatDefinition(senses)},examples.get(w.word)));
  }catch(e){failures.push(e.message);}
}
if(failures.length){console.log(failures.join('\n'));process.exitCode=1;}else{
  items.forEach(validateStandardDefinition);
  await fs.writeFile('vocab/standardized.json',JSON.stringify({schema_version:1,generated_at:'2026-10-13',scope:'all_effective_vocabulary_including_removed',items},null,2)+'\n');
  console.log(JSON.stringify({total:items.length,status:items.reduce((a,w)=>(a[w.status]=(a[w.status]||0)+1,a),{})}));
}
