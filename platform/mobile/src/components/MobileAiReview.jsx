import { useEffect, useRef, useState } from 'react';
import { connectionStatus, listModels, requestReview, stopReview, openUsage } from '../ai/client.mjs';
import { buildReviewRequest, parseReview, reviewIdentity } from '../ai/review.mjs';
import '../ai/ai.css';

function submittedQuestion(question) {
  const snapshot = question.history?.practice?.question_snapshot;
  return snapshot?.version === 2 ? { ...question, ...snapshot, history:question.history, aiReviews:question.aiReviews } : question;
}
export default function MobileAiReview({ question, repository, vocabularyRepo, notify, onConnection }) {
  const [connection,setConnection] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState(''), [saved,setSaved] = useState(null);
  const operation = useRef(0), mounted = useRef(true);
  useEffect(()=>{ mounted.current=true; return()=>{mounted.current=false;operation.current++;void stopReview().catch(()=>{});}; },[]);
  useEffect(()=>{
    let cancelled=false;
    const update=()=>connectionStatus().then(status=>{if(!cancelled)setConnection(status);}).catch(e=>{if(!cancelled)setError(e.message);});
    update(); window.addEventListener('gre-chatgpt-connection',update);
    return()=>{cancelled=true;window.removeEventListener('gre-chatgpt-connection',update);};
  },[]);
  const current = submittedQuestion(question), attemptId=question.history?.event_id;
  const stored=(question.aiReviews || []).filter(item=>item.attempt_id===attemptId).at(-1);
  useEffect(()=>{setSaved(null);setError('');},[question.key,attemptId]);
  const result=(saved?.attempt_id===attemptId ? saved : stored)?.result;
  const run=async()=>{
    if(busy || !attemptId)return;
    const seq=++operation.current;setBusy(true);setError('');
    try {
      const status=await connectionStatus();setConnection(status);
      if(!status.eligible)throw Error(status.message || '请先在设置中连接 ChatGPT 并授权计划使用。');
      const available=await listModels(),settings=(await vocabularyRepo.getState()).settings;
      const model=available.find(m=>m.slug===settings.aiModel)?.slug || available[0]?.slug;
      if(!model)throw Error('当前账号没有可用解析模型，请重新连接或检查 ChatGPT 计划权限。');
      const inputHash=await reviewIdentity(current),body=await buildReviewRequest(current,model);
      const response=await requestReview(body);
      if(!mounted.current || operation.current!==seq)return;
      const analysis=parseReview(response.text,current);
      const record={id:crypto.randomUUID(),recorded_at:new Date().toISOString(),attempt_id:attemptId,question_key:question.key,input_hash:inputHash,model:response.model || model,provisional:true,result:analysis};
      await repository.saveAiReview(record);
      if(mounted.current && operation.current===seq){setSaved(record);notify('AI 解析已保存。');}
    }catch(e){if(mounted.current && operation.current===seq)setError(e.message);}
    finally{if(mounted.current && operation.current===seq)setBusy(false);}
  };
  const cancel=async()=>{operation.current++;await stopReview().catch(()=>{});setBusy(false);setError('本次解析已停止，原作答保留。');};
  if(!attemptId)return null;
  return <section className="mobile-ai-review" aria-label="AI题目解析">
    <div className="ai-review-heading"><h2>AI 解析</h2>{connection?.eligible && <small>使用 ChatGPT 计划</small>}</div>
    {connection && !connection.eligible && <p className="muted">{connection.message || '先在设置中连接 ChatGPT，即可独立解析本题。'}</p>}
    <div className="ai-review-actions"><button className="primary" disabled={busy || connection?.available===false} onClick={run}>{busy ? '正在解析…' : result ? '重新解析本题' : '解析本题'}</button>{busy && <button onClick={cancel}>停止</button>}{connection?.available!==false && !connection?.eligible && <button onClick={onConnection}>连接 ChatGPT</button>}</div>
    {error && <div role="alert" className="ai-error"><p>{error}</p>{/额度|limit/i.test(error) && <button onClick={()=>openUsage().catch(e=>setError(e.message))}>管理额度</button>}</div>}
    {result && <div className="ai-review-result"><span className="ai-provisional">AI 暂定讲解</span><h3>完整题干翻译</h3><p>{result.question_translation}</p>
      {result.option_explanations.map(option=><article key={option.label} className="ai-option"><h3>{option.label}</h3><p><strong>含义：</strong>{option.meaning}</p><p><strong>翻译：</strong>{option.translation}</p><p><strong>依据：</strong>{option.reasoning}</p></article>)}
      <h3>推理与证据</h3><p>{result.summary}</p><p>{result.evidence}</p><p>{result.reasoning_gap}</p><h3>下次怎么做</h3><p>{result.next_action}</p>
      {result.assessment==='needs_review' && <p className="ai-error">本题存在证据不足或答案冲突，需进一步核对。</p>}
    </div>}
  </section>;
}
