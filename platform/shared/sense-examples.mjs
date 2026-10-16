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
    const u=new URL(e.source.url);const host=u.hostname.replace(/^www\./,'');
    const path=u.pathname.replace('/us/definition/','/definition/').replace(/\/$/,'');
    const key=host+(host==='ets.org'?path.replace(/^\/content\/dam\/ets-org\/pdfs\//,'/pdfs/'):path);
    const n=e.en.trim().split(/\s+/).length;counts.set(key,(counts.get(key)||0)+n);
  }
  for(const [url,count] of counts) if(count>25) throw Error(`原例句摘录超过单页25词：${url} (${count})`);
  return counts;
}
