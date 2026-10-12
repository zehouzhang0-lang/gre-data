import { useState } from 'react';
import { Empty } from './Primitives';

export default function Review({ state, active, onStart, onResume, onWall }) {
  const [scope, setScope] = useState('due'), [page, setPage] = useState(0);
  const items = (state.spacedReview?.items || []).filter(i => i.kind === 'word');
  const words = new Map(state.vocabulary.filter(w => !w.deleted).map(w => [w.word, w]));
  const due = items.filter(i => i.due && i.ready && words.has(i.word));
  const first = items.filter(i => !i.has_history && i.ready && words.has(i.word));
  const remaining = items.filter(i => i.due_today && words.has(i.word));
  const sessions = (state.vocabSessions || []).filter(s => !s.completed_at && s.completed_words?.length !== s.words.length).slice().reverse();
  const list = (scope === 'due' ? remaining : scope === 'new' ? first : items).filter(i => words.has(i.word));
  const pages = Math.max(1, Math.ceil(list.length / 20)), currentPage = Math.min(page, pages - 1);
  const visible = list.slice(currentPage * 20, (currentPage + 1) * 20);
  const nextText = i => !i.has_history ? '待首轮回忆' : i.retry_at && !i.due ? '稍后再练' : i.due_today ? i.overdue ? '已到期' : '今天' : i.due_date || '已安排';
  return <section className="screen" hidden={!active} aria-label="复习安排"><header className="screen-header"><h1>复习</h1></header><main className="screen-scroll review-content">
    {!!sessions.length && <section className="review-resume"><h2>继续未完成的一轮</h2>{sessions.map(s => <button key={s.session_id} className="resume-row" onClick={() => onResume(s)}><span>{s.words.length} 词 · 已完成 {s.completed_words?.length || 0} 词<small>从上次保存的步骤继续</small></span><span>继续</span></button>)}</section>}
    <section className="review-start"><div><h2>今日待复习</h2><p>{remaining.length} 词 · 现在可练 {due.length} 词</p></div><button className="primary" disabled={!due.length} onClick={() => onStart(due.map(i => words.get(i.word)))}>开始复习</button></section>
    <div className="review-secondary"><button disabled={!first.length} onClick={() => onStart(first.map(i => words.get(i.word)))}>首轮回忆 · {first.length} 词</button><button onClick={onWall}>回到单词墙</button></div>
    <div className="review-list-heading"><h2>复习记录</h2><select aria-label="复习记录范围" value={scope} onChange={e => { setScope(e.target.value); setPage(0); }}><option value="due">今日待复习</option><option value="new">待首轮</option><option value="all">全部记录</option></select></div>
    {visible.map(i => <article className="review-word-row" key={i.id || i.word}><div><strong className="english">{i.word}</strong><small>{nextText(i)} · 已复习 {i.review_count ?? 0} 次{!i.ready ? ' · 待补释义' : ''}</small></div><button disabled={!i.ready} onClick={() => onStart([words.get(i.word)])}>再练</button></article>)}
    {!visible.length && <Empty title="这个范围暂无任务"><p>可以开始首轮回忆，或查看全部记录。</p></Empty>}
    {list.length > 20 && <nav className="pager"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>}
    <details className="review-explanation"><summary>复习如何安排</summary><p>一轮依次练认义、补全拼写和中文回忆英文。所有阶段通过才结算该词；纠正不会抹去本轮第一次的困难。</p><p>忘记后 10 分钟再练，部分记得次日再练；跨日顺利回忆逐步延长间隔。同一天多次标为记得不会连续跳级。自评不等于长期掌握。</p></details>
  </main></section>;
}
