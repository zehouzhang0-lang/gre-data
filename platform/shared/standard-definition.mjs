export const definitionStatusLabels = { dictionary_checked: '本次词典核验', historical_checked: '沿用既有词典核验', coach_draft: '释义待核验', spelling_pending: '拼写待确认', spelling_redirect: '截断拼写已归入正确词条', changed: '编辑后待重新整理' };
export const partOfSpeechLabels = { 'n.':'名词', 'v.':'动词', 'adj.':'形容词', 'adv.':'副词', 'prep.':'介词', 'conj.':'连词', 'pron.':'代词', 'interj.':'感叹词', 'phr.':'短语', 'n. phr.':'名词短语', 'v. phr.':'动词短语', 'adv. phr.':'副词短语', 'adj. phr.':'形容词短语', 'prefix':'前缀' };
export function formatDefinition(senses) {
  return senses.map(s => `${s.pos}${s.meanings.join('；')}`).join('\n');
}
export function validateSenseExample(e) {
  if (e == null) return null;
  if (!e || typeof e.en !== 'string' || !e.en.trim() || e.en.length > 1000 || typeof e.zh !== 'string' || !e.zh.trim() || e.zh.length > 1000) throw Error('例句须包含完整英文和中文译文');
  if (e.kind === 'coach_original') {
    if (e.review_status !== 'coach_authored' || !e.source || e.source.publisher !== 'GRE AI教练（自拟）' || !/^\d{4}-\d{2}-\d{2}$/.test(e.source.created_at || '') || e.source.url !== undefined || (e.source.record !== undefined && !/^vocab\/examples\/[A-Za-z0-9._-]+\.json$/.test(e.source.record))) throw Error('自拟例句须明确标注作者与日期，不得伪造词典链接');
    return {en:e.en.trim(),zh:e.zh.trim(),kind:'coach_original',review_status:'coach_authored',source:{publisher:'GRE AI教练（自拟）',created_at:e.source.created_at,...(e.source.record?{record:e.source.record}:{})}};
  }
  if (e.kind !== 'quotation' || e.review_status !== 'source_checked') throw Error('原例句必须经过来源核对');
  let url; try { url = new URL(e.source?.url); } catch { throw Error('例句来源缺失'); }
  if (url.protocol !== 'https:' || !['ets.org','oxfordlearnersdictionaries.com','oxfordreference.com','oed.com','merriam-webster.com','dictionary.cambridge.org'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)) || typeof e.source.publisher !== 'string' || !e.source.publisher.trim()) throw Error('原例句须来自已支持的权威词典或 ETS 可追溯页面');
  return {en:e.en.trim(),zh:e.zh.trim(),kind:'quotation',review_status:'source_checked',source:{publisher:e.source.publisher.slice(0,150),url:url.href,...(e.source.checked_at?{checked_at:String(e.source.checked_at).slice(0,10)}:{}),...(typeof e.source.locator==='string'&&e.source.locator.trim()?{locator:e.source.locator.trim().slice(0,500)}:{})}};
}
export function validateStandardDefinition(d) {
  if (!d || typeof d.word!=='string' || !d.word || d.word.length>120 || !d.input || typeof d.input.pos!=='string' || typeof d.input.meaning!=='string' || d.input.meaning.length>10000 || !Array.isArray(d.senses) || d.senses.length>20 || !Object.hasOwn(definitionStatusLabels,d.status)) throw Error('规范释义字段无效');
  if (!d.senses.length && !['spelling_pending','spelling_redirect'].includes(d.status)) throw Error('规范释义不能为空');
  if (new Set(d.senses.map(s=>s.pos)).size!==d.senses.length) throw Error('词性分组重复');
  for(const s of d.senses) if (!Object.hasOwn(partOfSpeechLabels,s.pos) || !Array.isArray(s.meanings) || !s.meanings.length || s.meanings.length>100 || s.meanings.some(m=>typeof m!=='string'||!m.trim()||m.length>3000)) throw Error('词性或义项无效');
  const senses=d.senses.map(s=>{
    if(s.examples !== undefined && (!Array.isArray(s.examples)||s.examples.length!==s.meanings.length)) throw Error('例句必须逐义项对应');
    return {pos:s.pos,meanings:[...s.meanings],...(s.examples===undefined?{}:{examples:s.examples.map(validateSenseExample)})};
  });
  let curation;
  if (d.curation !== undefined) {
    const c=d.curation;
    if (!c || c.status!=='completed' || c.scope!=='definition_examples' || !/^\d{4}-\d{2}-\d{2}$/.test(c.reviewed_at||'') || c.record!=='vocab/curation-resolutions.json' || !Array.isArray(c.request_ids) || c.request_ids.length>10000 || new Set(c.request_ids).size!==c.request_ids.length || c.request_ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) || !senses.some(s=>s.examples?.some(Boolean))) throw Error('整理完成须有明确审核记录、原请求编号和例句');
    curation={status:c.status,scope:c.scope,reviewed_at:c.reviewed_at,record:c.record,request_ids:[...c.request_ids]};
  }
  return {word:d.word,input:{pos:d.input.pos,meaning:d.input.meaning},senses,status:d.status,note:typeof d.note==='string'?d.note.slice(0,3000):'',sources:(Array.isArray(d.sources)?d.sources:[]).slice(0,20).filter(s=>/^https?:\/\//.test(s.url)).map(s=>({publisher:String(s.publisher||'词典').slice(0,100),url:s.url.slice(0,2000),checked_at:String(s.checked_at||'').slice(0,30)})),...(curation?{curation}:{})};
}
export function applyStandardDefinition(word, definition = word.standard_definition) {
  if (!definition) return word;
  const matches = (word.meaning || '') === definition.input.meaning && (word.pos || '') === definition.input.pos;
  const already = word.meaning === formatDefinition(definition.senses) && word.pos === '';
  if (!matches && !already) return { ...word, standard_definition: definition, definition_status: 'changed', senses: [], sense_count: 0 };
  return { ...word, standard_definition: definition, senses: definition.senses,
    sense_count: definition.senses.reduce((n,s)=>n+s.meanings.length,0), definition_status: definition.status,
    meaning: definition.senses.length ? formatDefinition(definition.senses) : '', pos: '',
    definition_source: definitionStatusLabels[definition.status], dictionary_url: definition.sources?.[0]?.url || word.dictionary_url || '' };
}
export function matchesDefinitionFilters(word, filters) {
  const senses=word.senses || [];
  return (!filters.pos || senses.some(s=>s.pos===filters.pos))
    && (!filters.status || word.definition_status===filters.status)
    && (!filters.type || (filters.type==='phrase' ? /\s/.test(word.word) : !/\s/.test(word.word)))
    && (!filters.senses || (filters.senses==='multiple' ? word.sense_count>1 : word.sense_count===1));
}
