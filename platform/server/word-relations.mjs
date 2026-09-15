const kinds = new Set(['synonym', 'antonym', 'lookalike']);
let suggestionCache = { signature: '', value: [] };
const clean = (value, max, required = true) => {
  if (!required && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('请填写有效内容，或缩短过长的文字');
  return value.trim();
};
const id = value => { const s = clean(value, 100); if (!/^[a-z0-9_-]+$/.test(s)) throw Error('无效分类或词组编号'); return s; };
export function validateRelation(kind, p) {
  if (kind === 'topic_upsert') return { id: id(p.id), name: clean(p.name, 40) };
  if (['topic_delete','topic_restore','relation_delete','relation_restore'].includes(kind)) return { id: id(p.id) };
  if (kind === 'word_topics') {
    if (!Array.isArray(p.topics) || p.topics.length > 20) throw Error('每个词最多选择20个主题');
    return { word: clean(p.word,120).toLowerCase().replace(/\s+/g,' '), topics: [...new Set(p.topics.map(id))], automatic: p.automatic === true };
  }
  if (kind !== 'relation_upsert') return null;
  if (!kinds.has(p.type) || !Array.isArray(p.members) || p.members.length < 2 || p.members.length > 12) throw Error('请选择关系类型，添加2–12个词');
  const members = p.members.map(m => ({ word: clean(m.word,120).toLowerCase().replace(/\s+/g,' '), usage: clean(m.usage,1500,false), example: clean(m.example,500,false) }));
  if (new Set(members.map(m=>m.word)).size !== members.length) throw Error('同组不能重复添加同一个词');
  return { id: id(p.id), type:p.type, title:clean(p.title,100), note:clean(p.note,3000,false), members, source:'user_edited' };
}
function distance(a,b) {
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) { const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next; }
  return row[b.length];
}
export function projectRelations(vocabulary, seed, events) {
  const topics=new Map((seed.topics||[]).map(t=>[t.id,{...t,deleted:false}]));
  const groups=new Map((seed.groups||[]).map(g=>[g.id,{...g,deleted:false}])), overrides=new Map();
  for(const e of events) {
    const p=e.payload;
    if(e.kind==='topic_upsert')topics.set(p.id,{...(topics.get(p.id)||{}),...p,deleted:false});
    if(e.kind==='topic_delete'||e.kind==='topic_restore'){const t=topics.get(p.id);if(t)t.deleted=e.kind==='topic_delete';}
    if(e.kind==='word_topics')overrides.set(p.word,p);
    if(e.kind==='relation_upsert')groups.set(p.id,{...p,deleted:false});
    if(e.kind==='relation_delete'||e.kind==='relation_restore'){const g=groups.get(p.id);if(g)g.deleted=e.kind==='relation_delete';}
  }
  const active=[...topics.values()].filter(t=>!t.deleted), rules=active.map(t=>({...t, regex:t.pattern?new RegExp(t.pattern,'i'):null}));
  const words=new Map(vocabulary.map(w=>[w.word,w]));
  const assignments=vocabulary.filter(w=>!w.deleted).map(w=>{
    const override=overrides.get(w.word),manual=override&&!override.automatic;
    const ids=manual?override.topics:rules.filter(t=>(t.words||[]).includes(w.word)||t.regex?.test(w.meaning||'')).map(t=>t.id);
    return {word:w.word,topics:ids.filter(id=>topics.has(id)&&!topics.get(id).deleted),source:manual?'manual':'suggested'};
  });
  const groupList=[...groups.values()].map(g=>({...g,members:g.members.map(m=>({...m,available:words.has(m.word)&&!words.get(m.word).deleted}))}));
  const pairs=new Set(groupList.filter(g=>!g.deleted&&g.type==='lookalike').flatMap(g=>g.members.flatMap((a,i)=>g.members.slice(i+1).map(b=>[a.word,b.word].sort().join('|')))));
  const candidates=vocabulary.filter(w=>!w.deleted&&/^[a-z]{4,16}$/.test(w.word)).map(w=>w.word).sort(),suggestions=[];
  const signature=JSON.stringify([candidates,[...pairs].sort()]);
  if(signature===suggestionCache.signature)return {topics:[...topics.values()].map(({pattern,words,...t})=>t),assignments,groups:groupList,suggestions:suggestionCache.value};
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const a=candidates[i],b=candidates[j],pair=[a,b].join('|');
    if(pairs.has(pair)||Math.abs(a.length-b.length)>1)continue;
    const d=distance(a,b);if(d<=1 || d===2&&Math.min(a.length,b.length)>=8&&a.slice(0,2)===b.slice(0,2))suggestions.push({pair,words:[a,b],distance:d});
  }
  suggestions.sort((a,b)=>a.distance-b.distance||a.pair.localeCompare(b.pair));
  suggestionCache={signature,value:suggestions};
  return {topics:[...topics.values()].map(({pattern,words,...t})=>t),assignments,groups:groupList,suggestions};
}
