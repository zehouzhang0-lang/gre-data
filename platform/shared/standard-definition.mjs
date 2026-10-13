export const definitionStatusLabels = { dictionary_checked: '本次词典核验', historical_checked: '沿用既有词典核验', coach_draft: '释义待核验', spelling_pending: '拼写待确认', spelling_redirect: '截断拼写已归入正确词条', changed: '编辑后待重新整理' };
export const partOfSpeechLabels = { 'n.':'名词', 'v.':'动词', 'adj.':'形容词', 'adv.':'副词', 'prep.':'介词', 'conj.':'连词', 'pron.':'代词', 'interj.':'感叹词', 'phr.':'短语', 'n. phr.':'名词短语', 'v. phr.':'动词短语', 'adv. phr.':'副词短语', 'adj. phr.':'形容词短语', 'prefix':'前缀' };
export function formatDefinition(senses) {
  return senses.map(s => `${s.pos}${s.meanings.join('；')}`).join('\n');
}
export function validateStandardDefinition(d) {
  if (!d || typeof d.word!=='string' || !d.word || d.word.length>120 || !d.input || typeof d.input.pos!=='string' || typeof d.input.meaning!=='string' || d.input.meaning.length>10000 || !Array.isArray(d.senses) || d.senses.length>20 || !Object.hasOwn(definitionStatusLabels,d.status)) throw Error('规范释义字段无效');
  if (!d.senses.length && !['spelling_pending','spelling_redirect'].includes(d.status)) throw Error('规范释义不能为空');
  if (new Set(d.senses.map(s=>s.pos)).size!==d.senses.length) throw Error('词性分组重复');
  for(const s of d.senses) if (!Object.hasOwn(partOfSpeechLabels,s.pos) || !Array.isArray(s.meanings) || !s.meanings.length || s.meanings.length>100 || s.meanings.some(m=>typeof m!=='string'||!m.trim()||m.length>3000)) throw Error('词性或义项无效');
  return {word:d.word,input:{pos:d.input.pos,meaning:d.input.meaning},senses:d.senses.map(s=>({pos:s.pos,meanings:[...s.meanings]})),status:d.status,note:typeof d.note==='string'?d.note.slice(0,3000):'',sources:(Array.isArray(d.sources)?d.sources:[]).slice(0,20).filter(s=>/^https?:\/\//.test(s.url)).map(s=>({publisher:String(s.publisher||'词典').slice(0,100),url:s.url.slice(0,2000),checked_at:String(s.checked_at||'').slice(0,30)}))};
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
