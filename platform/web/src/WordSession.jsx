import {useMemo,useRef,useState} from 'react';
import {Header,Empty} from './components';
import {save} from './api';
import {clozeFor,drillResult,roundProgress,shuffled,stageLabels,stagesFor} from '../../shared/word-session.mjs';

const pendingKey=id=>`gre-word-round-pending:${id}`;
function readPending(id) {try{return id?JSON.parse(localStorage.getItem(pendingKey(id))||'null'):null;}catch{return null;}}
function rememberPending(id,operation) {try{if(operation)localStorage.setItem(pendingKey(id),JSON.stringify(operation));else localStorage.removeItem(pendingKey(id));}catch{/* Server saving still works when browser storage is disabled. */}}
function unionById(a,b) {return [...new Map([...a,...b].map(x=>[x.id,x])).values()].sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at)||a.id.localeCompare(b.id));}
export default function WordSession({state,initialWords,initialSession,refresh,notify,onExit}) {
  const [session,setSession]=useState(initialSession),[count,setCount]=useState(Math.min(10,initialWords.length)),[passes,setPasses]=useState(2),[localDrills,setLocalDrills]=useState([]),[localRecalls,setLocalRecalls]=useState([]);
  const [feedback,setFeedback]=useState(null),[answer,setAnswer]=useState(''),[selfReveal,setSelfReveal]=useState(false),[busy,setBusy]=useState(false),[failure,setFailure]=useState(()=>readPending(initialSession?.session_id));
  const [error,setError]=useState(()=>readPending(initialSession?.session_id)?'上次回答尚待确认保存，请重试。':'');
  const guard=useRef(false),startOperation=useRef(null),completionOperations=useRef(new Map()),input=useRef(null);
  const available=initialWords.filter(w=>!w.deleted&&w.meaning).slice(0,20);
  const currentSession=state.vocabSessions?.find(s=>s.session_id===session?.session_id)||session;
  const drills=useMemo(()=>unionById(state.vocabDrills||[],localDrills),[state.vocabDrills,localDrills]);
  const recalls=useMemo(()=>unionById((state.events||[]).filter(e=>e.kind==='vocab_recall'&&e.mode==='multistage'),localRecalls),[state.events,localRecalls]);
  const progress=currentSession?roundProgress(currentSession,drills,recalls):null;
  const step=feedback||failure?.kind==='vocab_drill'&&failure.payload||progress?.next;
  const item=currentSession?.items.find(w=>w.word===step?.word);
  const meaningStage=step?.stage?.startsWith('meaning_'),selfCheck=meaningStage&&!item?.choices.length;
  const choices=item?.choices?.length?shuffled(item.choices,`${currentSession.session_id}:${step.stage}:${item.word}`):[];
  const syncRefresh=()=>refresh().catch(()=>notify('已保存，页面稍后自动更新'));
  async function execute(operation) {
    if(guard.current)return false;
    guard.current=true;setBusy(true);setError('');
    const id=operation.payload.session_id;
    rememberPending(id,operation);
    try {
      const event=await save(operation.kind,operation.payload,operation.id);
      rememberPending(id,null);setFailure(null);
      if(operation.kind==='vocab_session')setSession({...event.payload,id:event.id,recorded_at:event.recorded_at});
      if(operation.kind==='vocab_drill') {setLocalDrills(list=>unionById(list,[{...event.payload,id:event.id,recorded_at:event.recorded_at}]));setFeedback({...event.payload,id:event.id});}
      if(operation.kind==='vocab_recall')setLocalRecalls(list=>unionById(list,[{...event.payload,id:event.id,recorded_at:event.recorded_at}]));
      syncRefresh();return true;
    } catch(e) {setError(e.message);setFailure(operation);return false;}
    finally {guard.current=false;setBusy(false);}
  }
  function start() {
    if(!startOperation.current)startOperation.current={kind:'vocab_session',id:crypto.randomUUID(),payload:{session_id:crypto.randomUUID(),words:available.slice(0,count).map(w=>w.word),meaning_passes:passes}};
    execute(startOperation.current);
  }
  function submit(result,selectedAnswer=answer) {
    if(!item||!step)return;
    const payload={session_id:currentSession.session_id,word:item.word,stage:step.stage,answer:result==='revealed'?'':selectedAnswer.trim(),result:result||'correct',response_mode:meaningStage?(selfCheck?'self_check':'choice'):'typing'};
    if(result!=='revealed'&&!selfCheck)payload.result=drillResult(item,payload);
    execute({kind:'vocab_drill',id:crypto.randomUUID(),payload});
  }
  async function next() {
    if(guard.current)return;
    const pending=progress.pending_completions[0];
    if(pending) {
      let operation=completionOperations.current.get(pending);
      if(!operation) {operation={kind:'vocab_recall',id:crypto.randomUUID(),payload:{word:pending,mode:'multistage',session_id:currentSession.session_id}};completionOperations.current.set(pending,operation);}
      if(!await execute(operation))return;
    }
    setFeedback(null);setAnswer('');setSelfReveal(false);
    setTimeout(()=>input.current?.focus(),0);
  }
  const header=<Header title="记忆与背诵" description="认词、补全、默写；错过的词会在本轮再次出现。"><button disabled={busy} onClick={onExit}>{session?'保存进度，稍后继续':'返回今日复习'}</button></Header>;
  if(!currentSession)return <>{header}<section className="word-round setup"><span className="word-round-kicker">开始一轮</span><h2>先认得，再想得出</h2><div className="word-round-route"><span>英文认义 × {passes}</span><span>补全拼写</span><span>中文默写</span></div>{available.length?<><div className="word-round-options"><label>本轮词数<select aria-label="本轮词数" disabled={busy||!!failure} value={Math.min(count,available.length)} onChange={e=>{setCount(Number(e.target.value));startOperation.current=null;}}>{[...new Set([Math.min(5,available.length),Math.min(10,available.length),Math.min(20,available.length)])].map(n=><option key={n} value={n}>{n} 词</option>)}</select></label><label>英文认义<select aria-label="认词遍数" disabled={busy||!!failure} value={passes} onChange={e=>{setPasses(Number(e.target.value));startOperation.current=null;}}><option value={2}>2 遍</option><option value={1}>1 遍</option></select></label></div><p className="muted">每个词完成全部步骤记作一轮复习；中途退出后可以接着练。</p><button className="primary" disabled={busy||!!failure} onClick={start}>{busy?'正在开始…':'开始复习 →'}</button></>:<Empty title="这组词需要先补充释义"/>}{error&&<p className="error" role="alert">{error}</p>}{failure&&<button disabled={busy} onClick={()=>execute(failure)}>重试保存</button>}</section></>;
  if(progress.complete)return <>{header}<section className="word-round round-complete"><span className="word-round-kicker">本轮已保存</span><h2>{currentSession.words.length} 个词，完成一整轮</h2><p>{progress.drill_count} 次作答与补练 · 下次复习已按本轮表现安排</p><div className="word-round-results">{currentSession.words.map(word=>{const recall=recalls.find(r=>r.session_id===currentSession.session_id&&r.word===word);return <div key={word}><strong>{word}</strong><span>{recall?.self_rating==='remembered'?'本轮顺利':recall?.self_rating==='forgotten'?'10 分钟后再练':'明天再练'}</span></div>;})}</div><button className="primary" onClick={onExit}>查看今日剩余任务</button></section></>;
  return <>{header}<section className="word-round" aria-label="单词多步复习"><ol className="word-stage-nav" aria-label="本轮步骤">{stagesFor(currentSession).map(stage=><li key={stage} aria-current={step?.stage===stage?'step':undefined} className={step?.stage===stage?'active':''}>{stageLabels[stage]}</li>)}</ol><div className="word-round-progress"><progress value={progress.passed} max={progress.total}/><span>{progress.passed} / {progress.total} 步</span></div>
    {item?<>
      <div className="word-round-prompt"><small>{meaningStage?'选择这个英文的中文义':step.stage==='cloze'?'补全缺失字母':'根据中文，写出英文'}</small>{meaningStage?<h2 className="word-round-word">{item.word}</h2>:step.stage==='cloze'?<><p className="word-round-meaning">{item.pos} {item.meaning}</p><h2 className="word-round-cloze">{clozeFor(item.word).display}</h2></>:<h2 className="word-round-meaning">{item.pos} {item.meaning}</h2>}</div>
      {!feedback&&!failure&&meaningStage&&!selfCheck&&<div className="word-meaning-choices">{choices.map((choice,index)=><button disabled={busy} key={choice.word} onClick={()=>submit(null,choice.word)}><span>{String.fromCharCode(65+index)}</span>{choice.meaning}</button>)}</div>}
      {!feedback&&!failure&&selfCheck&&<div className="word-self-check">{selfReveal?<><p>{item.pos} {item.meaning}</p><button disabled={busy} onClick={()=>submit('incorrect','')}>没记住</button><button className="primary" disabled={busy} onClick={()=>submit('correct','')}>记得</button></>:<button disabled={busy} onClick={()=>setSelfReveal(true)}>我已回想，核对释义</button>}<small>这一词采用自检记录</small></div>}
      {!feedback&&!failure&&!meaningStage&&<form className="word-spelling-form" onSubmit={e=>{e.preventDefault();if(answer.trim())submit();}}><input ref={input} autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-label={step.stage==='cloze'?'缺失字母或完整单词':'英文拼写'} placeholder={step.stage==='cloze'?'缺失字母，或完整英文':'输入英文'} value={answer} disabled={busy} onChange={e=>setAnswer(e.target.value)}/><button className="primary" disabled={busy||!answer.trim()}>核对答案</button></form>}
      {feedback&&<div className={`word-drill-feedback ${feedback.result==='correct'?'correct':'retry'}`} role="status"><strong>{feedback.result==='correct'?'答对了':feedback.result==='revealed'?'记住这个词，稍后再试':'这次有遗漏，稍后再试'}</strong><p><b>{item.word}</b> · {item.pos} {item.meaning}</p>{feedback.answer&&feedback.result==='incorrect'&&<small>你的回答：{feedback.response_mode==='choice'?item.choices.find(c=>c.word===feedback.answer)?.meaning:feedback.answer}</small>}<button className="primary" disabled={busy||!!failure} onClick={next}>{progress.pending_completions.length?'保存本词，继续 →':progress.next?.stage!==step.stage?'进入下一步 →':'继续 →'}</button></div>}
      {!feedback&&!failure&&<button className="text-button word-dont-know" disabled={busy} onClick={()=>submit('revealed')}>暂时想不起</button>}
    </>:<div className="word-round-finalize"><h2>本轮练习已完成</h2><p>保存本轮结果，安排下次复习。</p><button className="primary" disabled={busy||!!failure} onClick={next}>保存本轮结果</button></div>}
    {error&&<div className="word-save-error" role="alert"><p>{error}</p>{failure&&<button disabled={busy} onClick={()=>execute(failure)}>重试保存</button>}</div>}
    <footer className="word-round-foot"><span>本轮 {currentSession.words.length} 词 · 已完成 {progress.completed_words.length} 词</span><span>已保存 {progress.drill_count} 次作答</span></footer>
  </section></>;
}
