import { useCallback, useState } from 'react';
import Practice from './Practice';
import { Header, Empty } from './components';
import QuestionNavigator from './QuestionNavigator';
export default function QuestionReview({items,onExit,...props}) {
  const [index,setIndex]=useState(0);
  const [drafts,setDrafts]=useState({});
  const [busy,setBusy]=useState(false);
  const [finished,setFinished]=useState(false);
  const onDraftChange=useCallback((key,draft)=>setDrafts(previous=>({...previous,[key]:draft})),[]);
  const target=!finished&&items[index];
  const savedCount=items.filter(item=>drafts[item.key]?.saved).length;
  const onNavigate=next=>{if(!busy&&next>=0&&next<items.length){setIndex(next);setFinished(false);}};
  const reviewSession={items,index,drafts,onDraftChange,onNavigate,onBusyChange:setBusy,onFinish:()=>setFinished(true)};
  return <>
    <Header title="题目复习" description={target?`本组 ${index+1} / ${items.length} · 已保存 ${savedCount} 题`:`本组已保存 ${savedCount} / ${items.length} 题`}><button disabled={busy} onClick={onExit}>返回今日复习</button></Header>
    {target?<Practice {...props} reviewTarget={target} reviewSession={reviewSession}/>:<div className="question-review-empty">
      {!!items.length&&<QuestionNavigator questions={items} current="" materials={props.state.materials} completed={new Set()} drafts={drafts} busy={busy} review onChoose={question=>onNavigate(items.findIndex(item=>item.key===question.key))}/>}
      <Empty title={savedCount===items.length?"本组作答已保存":"本组暂时结束"}><p>{savedCount===items.length?'复习次数与下次日期已更新。':`还有 ${items.length-savedCount} 题未保存，可从题号继续。`}</p><div className="actions">{savedCount<items.length&&<button onClick={()=>onNavigate(items.findIndex(item=>!drafts[item.key]?.saved))}>继续未完成的题</button>}<button className="primary" onClick={onExit}>查看今日剩余任务</button></div></Empty>
    </div>}
  </>;
}
