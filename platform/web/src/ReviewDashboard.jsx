import { useDeferredValue, useState } from 'react';
import { Header, Modal, Empty, Field } from './components';
import {save} from './api';
const dateText = date => date ? `${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日` : '待首轮';
const resultText = { remembered:'记得 / 答案一致', partial:'不够准确', forgotten:'忘记 / 答案不一致', unknown:'答案待核对' };
const questionTitle = q => `${q.unit.replace(/^test(\d+)_section(\d+)_(\w+)$/,'Test $1 · Section $2 · $3').replace(/^passage(\d+)$/,'Passage $1')} · 第 ${q.question} 题`;
export default function ReviewDashboard({state,onWords,onQuestions,refresh}) {
  const data=state.spacedReview;
  const [kind,setKind]=useState('word'),[scope,setScope]=useState('due'),[search,setSearch]=useState(''),[detail,setDetail]=useState(null),[limit,setLimit]=useState(30);
  const [editing,setEditing]=useState(null),[meaning,setMeaning]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const query=useDeferredValue(search.trim().toLowerCase());
  if(!data)return <Empty title="正在读取复习安排"/>;
  const {items,summary,forecast}=data;
  const dueWords=items.filter(i=>i.kind==='word'&&i.due&&i.ready),dueQuestions=items.filter(i=>i.kind==='question'&&i.due&&i.ready);
  const newWords=items.filter(i=>i.kind==='word'&&!i.has_history&&i.ready);
  const wordMap=new Map(state.vocabulary.map(w=>[w.word,w]));
  const startWords=list=>onWords(list.map(i=>wordMap.get(i.word)).filter(Boolean));
  const visible=items.filter(i=>i.kind===kind&&(scope==='all'||scope==='new'&&!i.has_history||scope==='due'&&i.due_today)&&`${i.word||questionTitle(i)} ${i.kind==='word'?wordMap.get(i.word)?.meaning:''}`.toLowerCase().includes(query));
  const completed=summary.word.completed+summary.question.completed;
  const reviewed=summary.word.reviewed+summary.question.reviewed;
  const repetitions=summary.word.repetitions+summary.question.repetitions;
  const maxForecast=Math.max(1,...forecast.map(d=>d.words+d.questions));
  function nextLabel(item) {
    if(!item.has_history)return '待首轮回忆';
    if(item.retry_at&&item.due_today&&!item.due)return `${new Date(item.retry_at).toLocaleTimeString('zh-CN',{timeZone:data.time_zone,hour:'2-digit',minute:'2-digit'})} 再练`;
    if(item.overdue)return `逾期 · ${dateText(item.due_date)}`;
    return item.due_today?'今天':dateText(item.due_date);
  }
  return <>
    <Header title="记忆与背诵" description={`${dateText(data.today)} · 先处理到期内容，再开始新的学习。`}/>
    <div className="review-overview">
      <section><span>今日单词待复习</span><strong>{summary.word.remaining}<small>词</small></strong><p>{summary.word.overdue ? `含 ${summary.word.overdue} 词逾期` : '按每个词的复习表现安排'}</p><button className="primary" disabled={!dueWords.length} onClick={()=>startWords(dueWords.slice(0,20))}>复习单词{dueWords.length>0?` · ${Math.min(20,dueWords.length)} 词 →`:''}</button>{(summary.word.waiting>0||summary.word.blocked>0)&&<small>{summary.word.waiting>0&&`${summary.word.waiting} 词稍后再练　`}{summary.word.blocked>0&&`${summary.word.blocked} 词需先补释义`}</small>}</section>
      <section><span>今日题目待复习</span><strong>{summary.question.remaining}<small>题</small></strong><p>{summary.question.overdue?`含 ${summary.question.overdue} 题逾期`:'做过的题也会继续安排重做'}</p><button className="primary" disabled={!dueQuestions.length} onClick={()=>onQuestions(dueQuestions.slice(0,10))}>重做题目{dueQuestions.length>0?` · ${Math.min(10,dueQuestions.length)} 题 →`:''}</button>{summary.question.waiting>0&&<small>{summary.question.waiting} 题稍后再练</small>}</section>
      <section className="review-done"><span>今日已完成复习</span><strong>{completed}<small>项</small></strong><p>{reviewed} 项已练 · 共 {repetitions} 次复习</p><small>忘记后需再练的内容仍算待完成。另有 {summary.word.first_today} 词、{summary.question.first_today} 题完成首轮。</small><button disabled={!newWords.length} onClick={()=>startWords(newWords.slice(0,20))}>首轮回忆 · {newWords.length} 词可练</button></section>
    </div>
    <section className="review-forecast" aria-label="未来七天复习量"><div className="section-heading"><h2>接下来 7 天</h2><small>仅含已排定任务；复习后动态更新</small></div><div className="forecast-days">{forecast.map((d,index)=><div key={d.date}><span>{index===0?'今天':dateText(d.date)}</span><div className="forecast-track"><div style={{height:`${Math.max(3,(d.words+d.questions)/maxForecast*100)}%`}}/></div><strong>{d.words}<small> 词</small></strong><span>{d.questions} 题</span></div>)}</div></section>
    <section className="review-inventory"><div className="table-tools"><div className="tabs"><button className={kind==='word'?'selected':''} onClick={()=>{setKind('word');setLimit(30);}}>单词</button><button className={kind==='question'?'selected':''} onClick={()=>{setKind('question');setScope(s=>s==='new'?'all':s);setLimit(30);}}>做过的题</button></div><input aria-label="搜索复习记录" placeholder="搜索单词、释义或题目…" value={search} onChange={e=>{setSearch(e.target.value);setLimit(30);}}/><select aria-label="复习任务筛选" value={scope} onChange={e=>{setScope(e.target.value);setLimit(30);}}><option value="due">今日待复习</option><option value="all">全部记录</option>{kind==='word'&&<option value="new">待首轮</option>}</select></div>
      {visible.slice(0,limit).map(i=><article className="review-item" key={i.id}><div><button className="word-link" onClick={()=>setDetail(i)}>{i.word||questionTitle(i)}</button><small>{i.kind==='question'?`已做 ${i.attempt_count} 次 · `:''}已复习 {i.review_count} 次 · {nextLabel(i)}{!i.ready?' · 待补释义':''}</small></div><button onClick={()=>!i.ready?(setEditing(i),setMeaning(''),setError('')):i.kind==='word'?startWords([i]):onQuestions([i])}>{i.ready?'再练一次':'补充释义'}</button></article>)}
      {!visible.length&&<Empty title="当前筛选下没有任务"><p>可以查看全部记录，或开始首轮回忆。</p></Empty>}
      {visible.length>limit&&<button onClick={()=>setLimit(n=>n+30)}>查看更多</button>}
    </section>
    <details className="review-method"><summary>复习如何安排</summary><p>采用间隔复习：记得后按 {data.intervals.join('、')} 天逐步延长；忘记或答错，10 分钟后再练；不够准确或缺少答案，次日再练。间隔从本次有效复习日算起，到 60 天后仍继续安排。</p><p>提前或同日重复练习会记次数，但不会连续跨级。未完成的任务顺延保留。词汇按自评、题目按提交时已有的参考答案安排；没有答案不算答对。旧复测计数与同源明细取较大值，避免重复累计；初次接触没有回忆证据的词进入首轮。</p><p>这是依照间隔学习原则设置的初始规则，不是个人记忆率测量。<a href="https://doi.org/10.1111/j.1467-9280.2008.02209.x" target="_blank" rel="noreferrer">研究依据 ↗</a></p></details>
    {detail&&<Modal title={detail.word||questionTitle(detail)} onClose={()=>setDetail(null)}><p>已复习 <strong>{detail.review_count}</strong> 次 · 下次：{nextLabel(detail)}</p><p>{detail.kind==='question'?`累计作答 ${detail.attempt_count} 次；`:""}旧记录复测 {detail.legacy_review_count} 次；平台回忆 / 作答 {detail.platform_count} 次（首轮单独计）。</p>{detail.history.map(h=><div className="review-history-row" key={h.id}><span>{new Date(h.at).toLocaleString('zh-CN',{timeZone:data.time_zone})}</span><span>{h.review?'复习':'首轮'} · {resultText[h.result]}</span></div>)}{!detail.history.length&&<p>旧记录仅保留累计次数或日期，详细证据可在学习记录中查看。</p>}<small>此处列出最近20次；完整原记录持续保留，不把复习次数直接视作掌握。</small></Modal>}
    {editing&&<Modal title={`${editing.word} · 补充释义`} onClose={()=>setEditing(null)}><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await save('vocab_upsert',{...wordMap.get(editing.word),meaning});await refresh();setEditing(null);}catch(e){setError(e.message);}finally{setBusy(false);}}}><Field label="核心义"><textarea required value={meaning} onChange={e=>setMeaning(e.target.value)}/></Field><a href={`https://www.merriam-webster.com/dictionary/${encodeURIComponent(editing.word)}`} target="_blank" rel="noreferrer">查词典 ↗</a>{error&&<p role="alert" className="error">{error}</p>}<div className="modal-actions"><button className="primary" disabled={busy}>保存释义</button></div></form></Modal>}
  </>;
}
