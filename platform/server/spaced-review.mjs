// A transparent spaced-retrieval heuristic, not a fitted human forgetting curve.
export const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30, 60];
const DAY = 86400000;
const keyOf = q => JSON.stringify([q.material, q.unit, q.question]);
const wordKey = word => `word:${word}`;
const questionKey = q => `question:${keyOf(q)}`;
export function dayKey(date, timeZone = 'Asia/Shanghai') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(date));
}
export const addDays = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY).toISOString().slice(0,10);
const latestDay = (a,b) => !a || b > a ? b : a;

// Snapshot counters and their underlying evidence overlap: take the maximum, never sum them.
export function legacyWordReviews({ homework, lexicon, difficult, mastered }) {
  const words = new Map();
  const get = word => { const key=word.trim().toLowerCase().replace(/\s+/g,' '); if(!words.has(key))words.set(key,{word:key,review_count:0,last_day:null,records:new Set()});return words.get(key); };
  for(const pool of [difficult,mastered])for(const item of pool.items || []) {
    if(!item.last_review && !item.review_count && !item.initial_result)continue;
    const w=get(item.word); w.review_count=Math.max(w.review_count,Number(item.review_count)||0);
    const date=item.last_review || item.added_on;
    if(date) w.last_day=latestDay(w.last_day,String(date).slice(0,10));
  }
  function evidence(word, record, date) {
    if(!record || !date)return;
    const w=get(word); w.records.add(record);w.last_day=latestDay(w.last_day,date.slice(0,10));
  }
  for(const group of [...(homework.groups||[]),...(homework.retests||[])]) {
    if(group.status !== 'answered')continue;
    const match=group.record?.match(/(\d{4})(\d{2})(\d{2})_\d{4}/);
    for(const r of group.responses||[]) evidence(r.word,group.record,match?`${match[1]}-${match[2]}-${match[3]}`:null);
  }
  for(const item of lexicon.items||[])for(const r of item.review_evidence||[])evidence(item.word,r.record,r.recorded_at);
  return [...words.values()].map(w=>({...w,review_count:Math.max(w.review_count,w.records.size-1),records:[...w.records]}));
}

function initial(id, kind, fields) {
  return { id,kind,...fields,stage:0,platform_count:0,legacy_attempt_count:0,legacy_review_count:0,review_count:0,has_history:false,last_at:null,last_day:null,due_date:null,retry_at:null,last_result:null,today_count:0,today_reviews:0,history:[] };
}
function setNext(item, date, days) { item.due_date=addDays(date,days);item.retry_at=null; }
function update(item, at, result, today, timeZone, source, id) {
  const date=dayKey(at,timeZone), wasReview=item.has_history;
  const due = item.due_date && item.due_date <= date && (!item.retry_at || Date.parse(at)>=Date.parse(item.retry_at));
  if(source==='platform')item.platform_count++;
  if(wasReview)item.review_count++;
  if(date===today && source==='platform') { item.today_count++; if(wasReview)item.today_reviews++; }
  if(result==='forgotten') {
    item.stage=0;item.retry_at=new Date(Date.parse(at)+600000).toISOString();item.due_date=dayKey(item.retry_at,timeZone);
  } else if(result==='remembered') {
    if(!wasReview || item.retry_at) { item.stage=0;setNext(item,date,1); }
    else if(due && item.last_day!==date) { item.stage=Math.min(item.stage+1,REVIEW_INTERVALS.length-1);setNext(item,date,REVIEW_INTERVALS[item.stage]); }
    // Extra successful practice is counted but cannot postpone a review that is not due.
  } else {
    item.stage=Math.max(0,item.stage-1);setNext(item,date,1);
  }
  item.has_history=true;item.last_at=at;item.last_day=date;item.last_result=result;
  item.history.push({id,at,result,source,review:wasReview});
}

export function projectReview({vocabulary,legacyWords=[],legacyQuestions=[],events,grade,now=new Date(),timeZone='Asia/Shanghai'}) {
  const today=dayKey(now,timeZone), map=new Map();
  for(const w of vocabulary)map.set(wordKey(w.word),initial(wordKey(w.word),'word',{word:w.word,deleted:!!w.deleted,ready:!!w.meaning?.trim()}));
  for(const old of legacyWords) {
    const item=map.get(wordKey(old.word));if(!item || !old.last_day)continue;
    item.legacy_review_count=old.review_count;item.review_count=old.review_count;item.has_history=true;item.last_day=old.last_day;setNext(item,old.last_day,1);
  }
  for(const q of [...legacyQuestions].sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at))) {
    const id=questionKey(q);if(!map.has(id))map.set(id,initial(id,'question',{...q,key:keyOf(q),ready:true}));
    const item=map.get(id);item.legacy_attempt_count++;if(item.has_history)item.legacy_review_count++;
    update(item,q.recorded_at,'unknown',today,timeZone,'legacy',q.record);
  }
  const keys=new Map(), completedRounds=new Set();
  for(const event of events) {
    const p=event.payload;
    if(event.kind==='keys_import'||event.kind==='questions_import')for(const q of p.items)if(q.answer)keys.set(keyOf(q),q);
    if(event.kind==='vocab_recall') {
      if(p.mode==='multistage') {
        const roundKey=JSON.stringify([p.session_id,p.word]);
        if(completedRounds.has(roundKey))continue;
        completedRounds.add(roundKey);
      }
      const item=map.get(wordKey(p.word));if(item)update(item,event.recorded_at,p.self_rating,today,timeZone,'platform',event.id);
    }
    if(event.kind==='attempt'||event.kind==='attempts_import') {
      const attempts=event.kind==='attempt'?[p]:p.items;
      attempts.forEach((q,index)=>{
        const id=questionKey(q);if(!map.has(id))map.set(id,initial(id,'question',{material:q.material,unit:q.unit,question:q.question,type:q.type,key:keyOf(q),ready:true}));
        const key=keys.get(keyOf(q));const result=grade(q.answer,key?.answer,q.type,key?.answer_format);
        update(map.get(id),event.recorded_at,result===true?'remembered':result===false?'forgotten':'unknown',today,timeZone,'platform',event.kind==='attempt'?event.id:`${event.id}-${index}`);
      });
    }
  }
  const items=[...map.values()].filter(i=>!i.deleted).map(i=>({...i,
    attempt_count:i.platform_count+i.legacy_attempt_count,
    due:!!i.due_date && i.due_date<=today && (!i.retry_at || Date.parse(i.retry_at)<=+new Date(now)),
    due_today:!!i.due_date && i.due_date<=today,
    overdue:!!i.due_date && i.due_date<today,
    history:i.history.slice(-20).reverse(),
  })).sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999') || a.id.localeCompare(b.id));
  const summary={};
  for(const kind of ['word','question']) {
    const list=items.filter(i=>i.kind===kind),pending=list.filter(i=>i.due_today),reviewed=list.filter(i=>i.today_reviews>0);
    summary[kind]={due:pending.filter(i=>i.ready&&i.due).length,remaining:pending.length,waiting:pending.filter(i=>!i.due&&i.ready).length,blocked:pending.filter(i=>!i.ready).length,overdue:pending.filter(i=>i.overdue).length,
      completed:reviewed.filter(i=>!i.due_today).length,reviewed:reviewed.length,repetitions:list.reduce((n,i)=>n+i.today_reviews,0),first_today:list.filter(i=>i.today_count>i.today_reviews).length,
      new:list.filter(i=>!i.has_history&&i.ready).length,total:list.length};
  }
  const forecast=Array.from({length:7},(_,n)=>{
    const date=addDays(today,n);const due=items.filter(i=>n===0?i.due_today:i.due_date===date);
    return {date,words:due.filter(i=>i.kind==='word').length,questions:due.filter(i=>i.kind==='question').length};
  });
  return {today,time_zone:timeZone,intervals:REVIEW_INTERVALS,items,summary,forecast};
}
