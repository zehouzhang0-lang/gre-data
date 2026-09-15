// The same deterministic round rules run in the UI and when accepting events.
export const WORD_STAGES = ['meaning_1', 'meaning_2', 'cloze', 'spelling'];
export const stageLabels = {meaning_1:'认词 · 第 1 遍',meaning_2:'认词 · 第 2 遍',cloze:'补全拼写',spelling:'中文 → 英文'};
export const normalizeSpelling = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/[‐‑‒–—]/g,'-').trim().replace(/\s+/g,' ');
export const stagesFor = session => WORD_STAGES.filter(s=>session.meaning_passes===2 || s!=='meaning_2');
export function clozeFor(word) {
  let missing='';
  const display=word.replace(/[a-z]+/gi,part=>{
    if(part.length<3)return part;
    const count=Math.min(4,Math.max(1,Math.floor(part.length/2))),start=Math.floor((part.length-count)/2);
    missing+=part.slice(start,start+count);
    return part.slice(0,start)+'_'.repeat(count)+part.slice(start+count);
  });
  // Very short entries still get a real retrieval prompt.
  if(!missing)return {display:word.replace(/[a-z]/gi,'_'),missing:word.replace(/[^a-z]/gi,'')};
  return {display,missing};
}
function hash(value) { let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0; }
export function shuffled(values,seed) {return [...values].sort((a,b)=>hash(seed+JSON.stringify(a))-hash(seed+JSON.stringify(b)));}
const meaningText = value => String(value||'').replace(/\s+/g,'').replace(/[的地得；;，,。.:：()（）]/g,'');
function meaningPieces(value) { const text=meaningText(value);return new Set(Array.from({length:Math.max(0,text.length-1)},(_,i)=>text.slice(i,i+2))); }
export function meaningChoices(item,vocabulary,relations,seed) {
  const target=meaningText(item.meaning),pieces=meaningPieces(item.meaning),related=new Set([item.word]);
  for(const group of relations?.groups||[])if(!group.deleted&&group.members.some(m=>m.word===item.word))for(const member of group.members)related.add(member.word);
  const candidates=shuffled(vocabulary.filter(w=>!w.deleted&&w.meaning&&!related.has(w.word)&&w.word!==item.word),seed),chosen=[{word:item.word,meaning:item.meaning}];
  for(const candidate of candidates) {
    const text=meaningText(candidate.meaning);
    if(!text || text===target || text.includes(target)||target.includes(text)||[...meaningPieces(candidate.meaning)].some(p=>pieces.has(p)))continue;
    if(chosen.some(c=>meaningText(c.meaning)===text))continue;
    chosen.push({word:candidate.word,meaning:candidate.meaning});if(chosen.length===4)break;
  }
  return chosen.length===4?chosen:[];
}
export function drillResult(item,payload) {
  if(payload.result==='revealed')return 'revealed';
  if(payload.stage.startsWith('meaning_')) {
    if(!item.choices.length)return payload.result; // Explicit self-check fallback, never free-text Chinese grading.
    return payload.answer===item.word?'correct':'incorrect';
  }
  const answer=normalizeSpelling(payload.answer),full=normalizeSpelling(item.word);
  return answer===full || payload.stage==='cloze'&&answer===normalizeSpelling(clozeFor(item.word).missing)?'correct':'incorrect';
}
export function roundProgress(session,drills=[],recalls=[]) {
  const relevant=drills.filter(d=>d.session_id===session.session_id),stages=stagesFor(session),completed=new Set(recalls.filter(r=>r.session_id===session.session_id&&r.mode==='multistage'&&session.words.includes(r.word)).map(r=>r.word));
  let next=null,passed=0;
  for(const stage of stages) {
    const queue=[...session.words],seen=new Set();
    for(const drill of relevant.filter(d=>d.stage===stage)) {
      if(seen.has(drill.word))continue;
      const at=queue.indexOf(drill.word);if(at===-1)continue;queue.splice(at,1);
      if(drill.result==='correct') {seen.add(drill.word);passed++;} else queue.push(drill.word);
    }
    if(!next&&queue.length)next={stage,word:queue[0],remaining:queue.length};
  }
  const ready=session.words.filter(word=>stages.every(stage=>relevant.some(d=>d.word===word&&d.stage===stage&&d.result==='correct')));
  return {next,passed,total:session.words.length*stages.length,completed_words:[...completed],ready_words:ready,pending_completions:ready.filter(w=>!completed.has(w)),drill_count:relevant.length,complete:completed.size===session.words.length};
}
export function roundRating(session,word,drills) {
  const first=stagesFor(session).map(stage=>drills.find(d=>d.session_id===session.session_id&&d.word===word&&d.stage===stage));
  if(first.some(d=>!d))throw Error('本轮尚未完成');
  if(first.some(d=>d.stage.startsWith('meaning_')&&d.result!=='correct'))return 'forgotten';
  return first.every(d=>d.result==='correct')?'remembered':'partial';
}
