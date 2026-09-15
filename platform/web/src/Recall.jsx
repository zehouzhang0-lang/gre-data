import { useState } from 'react';
import ReviewDashboard from './ReviewDashboard';
import QuestionReview from './QuestionReview';
import WordSession from './WordSession';
import './word-session.css';
export default function Recall(props) {
  const [words,setWords]=useState(props.initialWords || null),[questions,setQuestions]=useState(null),[session,setSession]=useState(null);
  if(questions)return <QuestionReview {...props} items={questions} onExit={()=>setQuestions(null)}/>;
  if(words||session)return <WordSession {...props} initialWords={words||[]} initialSession={session} onExit={()=>{setWords(null);setSession(null);}}/>;
  const unfinished=(props.state.vocabSessions||[]).filter(s=>!s.complete);
  return <>
    {unfinished.length>0&&<aside className="word-resume" aria-label="未完成的单词复习"><div><strong>继续上次复习</strong><span>{unfinished[0].words.length} 词 · {unfinished[0].passed} / {unfinished[0].total} 步已保存</span></div><button className="primary" onClick={()=>setSession(unfinished[0])}>继续这一轮 →</button>{unfinished.length>1&&<details><summary>其他 {unfinished.length-1} 轮</summary>{unfinished.slice(1).map(s=><button key={s.session_id} onClick={()=>setSession(s)}>{new Date(s.recorded_at).toLocaleDateString('zh-CN')} · {s.words.length} 词 · {s.passed}/{s.total} 步</button>)}</details>}</aside>}
    <ReviewDashboard {...props} onWords={setWords} onQuestions={setQuestions}/>
  </>;
}
