import {validateSenseExample} from './standard-definition.mjs';

// Match both POS and the exact meaning array: editing senses must never attach
// a sentence to a different sense merely because its old index still exists.
export function attachSenseExamples(definition, entry) {
  return {...definition,senses:definition.senses.map(group=>{
    const found=entry?.senses?.find(s=>s.pos===group.pos && JSON.stringify(s.meanings)===JSON.stringify(group.meanings));
    if(found && (!Array.isArray(found.examples)||found.examples.length!==group.meanings.length)) throw Error('例句义项数量不一致：'+definition.word);
    return {...group,examples:found?found.examples.map(validateSenseExample):group.meanings.map(()=>null)};
  })};
}

export function validateQuotationBudget(entries) {
  const counts=new Map();
  for(const entry of entries) for(const group of entry.senses) for(const e of group.examples||[]) {
    if(!e)continue; validateSenseExample(e);
    if(e.kind === 'coach_original')continue;
    const u=new URL(e.source.url);const host=u.hostname.replace(/^www\./,'');
    const path=u.pathname.replace('/us/definition/','/definition/').replace(/\/$/,'');
    const key=host+(host==='ets.org'?path.replace(/^\/content\/dam\/ets-org\/pdfs\//,'/pdfs/'):path);
    const n=e.en.trim().split(/\s+/).length;counts.set(key,(counts.get(key)||0)+n);
  }
  for(const [url,count] of counts) if(count>25) throw Error(`原例句摘录超过单页25词：${url} (${count})`);
  return counts;
}

// Editorial supplements may fill empty slots, but never replace an existing
// quotation or attach an example by a stale sense index.
export function mergeSenseExampleEntries(entries) {
  const merged=new Map();
  for(const entry of entries) {
    const previous=merged.get(entry.word);
    if(!previous){const clean=structuredClone(entry);for(const s of clean.senses){if(s.examples?.length!==s.meanings.length)throw Error('例句义项数量不一致：'+entry.word);s.examples=s.examples.map(validateSenseExample);}merged.set(entry.word,clean);continue;}
    if(previous.senses.length!==entry.senses.length || previous.senses.some((group,i)=>group.pos!==entry.senses[i].pos || JSON.stringify(group.meanings)!==JSON.stringify(entry.senses[i].meanings)))throw Error('重复词条例句的义项不一致：'+entry.word);
    previous.senses.forEach((group,i)=>{
      const addition=entry.senses[i];
      if(group.examples?.length!==group.meanings.length || addition.examples?.length!==group.meanings.length)throw Error('例句义项数量不一致：'+entry.word);
      group.examples=group.examples.map((old,j)=>{
        const next=validateSenseExample(addition.examples[j]);
        if(old && next && JSON.stringify(old)!==JSON.stringify(next))throw Error('例句补充试图替换已有内容：'+entry.word);
        return old || next || null;
      });
    });
  }
  return [...merged.values()];
}
