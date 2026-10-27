import { useEffect, useMemo, useRef, useState } from 'react';
import { dayKey } from '../../../server/spaced-review.mjs';
import { orderedReviewRounds, selectReviewWords } from '../data/review-tasks.mjs';
import { Confirm, Empty, Icon, Sheet } from './Primitives';
import '../review-redesign.css';

function RoundCard({ round, onOpen, onManage }) {
  const press = useRef(null), held = useRef(false), start = useRef(null);
  const stop = () => { clearTimeout(press.current); press.current = null; };
  useEffect(() => stop, []);
  const complete = !!(round.completed_at || round.complete);
  return <article className={`review-round-card urgency-${round.urgency.level}`}>
    <button className="review-round-open" aria-label={`${round.name}，${complete ? '已完成' : '未完成'}，打开轮次`}
      onPointerDown={e => { if (e.button !== 0) return; held.current = false; start.current = { x: e.clientX, y: e.clientY }; stop(); press.current = setTimeout(() => { held.current = true; onManage(round); }, 480); }}
      onPointerMove={e => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) stop(); }}
      onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
      onContextMenu={e => { e.preventDefault(); stop(); held.current = true; onManage(round); }}
      onClick={() => { if (held.current) { held.current = false; return; } onOpen(round); }}>
      <span className="review-round-topline"><span className={`round-state ${complete ? 'done' : ''}`}>{complete ? '已完成' : '未完成'}</span>{round.pinned && <span className="round-pin">置顶</span>}</span>
      <strong className="review-round-name">{round.name}</strong>
      <span className="review-round-detail">{round.words.length} 词 · 已完成 {round.completed_words?.length || 0} 词<span>{complete ? '查看本轮结果' : round.drill_count ? '继续上次步骤' : '点击开始'}</span></span>
      <span className="review-round-urgency">{round.urgency.label}</span>
    </button>
    <button className="icon-button review-round-menu" aria-label={`管理轮次 ${round.name}`} onClick={() => onManage(round)}><Icon name="more"/></button>
  </article>;
}

function TaskForm({ state, task, busy, onClose, onSave }) {
  const today = dayKey(new Date(), state.timeZone);
  const [name, setName] = useState(task?.name || today), [count, setCount] = useState(String(task?.word_count || 10));
  const [deadline, setDeadline] = useState(task?.deadline || today);
  const [filter, setFilter] = useState(task?.filter || { scope: 'all', topic: '', group: '' });
  const available = selectReviewWords(state, filter).length;
  const valid = name.trim() && Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 50000 && deadline >= today;
  function update(key, value) { setFilter(previous => ({ ...previous, [key]: value })); }
  return <Sheet title={task ? '调整复习任务' : '设置复习任务'} onClose={busy ? () => {} : onClose}>
    <form className="review-task-form" onSubmit={e => { e.preventDefault(); if (valid) onSave({ name: name.trim(), word_count: Number(count), deadline, filter, meaning_passes: task?.meaning_passes || 2 }); }}>
      <label className="field">{task ? '任务名称' : '当前轮次名称'}<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} disabled={busy}/></label>
      <div className="review-form-pair"><label className="field">每天词数<input required type="number" inputMode="numeric" min="1" max="50000" step="1" value={count} onChange={e => setCount(e.target.value)} disabled={busy}/></label><label className="field">截止日期<input required type="date" min={today} value={deadline} onChange={e => setDeadline(e.target.value)} disabled={busy}/></label></div>
      <label className="field">筛选范围<select value={filter.scope} onChange={e => update('scope', e.target.value)} disabled={busy}><option value="all">全部可练单词</option><option value="due">现在到期</option><option value="new">待首轮回忆</option></select></label>
      <label className="field">语义主题<select value={filter.topic} onChange={e => update('topic', e.target.value)} disabled={busy}><option value="">全部主题</option>{state.relations.topics.filter(t => !t.deleted).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="field">关系组<select value={filter.group} onChange={e => update('group', e.target.value)} disabled={busy}><option value="">全部关系</option>{state.relations.groups.filter(g => !g.deleted).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
      <p className="hint">当前可练 {available} 词，不足设定数量时按实际词数创建。{task ? '调整用于后续轮次，已有轮次的内容和进度保留。' : '现在只创建今日一轮。截止日期内，每天打开 App 时生成当天一轮；错过的日期不补建。'}</p>
      <button className="primary wide-button" disabled={busy || !valid} type="submit">{busy ? '保存中…' : task ? '保存调整' : available ? '创建今日轮次' : '保存任务，等待可练单词'}</button>
    </form>
  </Sheet>;
}

export default function Review({ state, repo, busy = false, mutate, active, onResume, onWall }) {
  const [scope, setScope] = useState('all'), [page, setPage] = useState(0), [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null), [rename, setRename] = useState(null), [name, setName] = useState(''), [confirm, setConfirm] = useState(null), [tasksOpen, setTasksOpen] = useState(false);
  const rounds = useMemo(() => orderedReviewRounds(state, scope), [state, scope]);
  const pages = Math.max(1, Math.ceil(rounds.length / 4)), currentPage = Math.min(page, pages - 1);
  const visible = rounds.slice(currentPage * 4, currentPage * 4 + 4);
  const taskList = state.reviewTasks || [], activeTasks = taskList.filter(t => !t.cancelled && !t.expired);
  const selectedTask = selected?.task_id && taskList.find(t => t.id === selected.task_id);
  const incomplete = (state.reviewRounds || []).filter(r => !r.deleted && !r.completed_at && !r.complete).length;
  async function save(operation, message, close) { if (await mutate(operation, message)) close?.(); }
  return <section className="screen review-redesign" hidden={!active} aria-label="复习安排"><header className="screen-header"><h1>复习</h1></header><main className="screen-scroll review-content">
    <section className="review-overview"><div><span className="review-eyebrow">按自己的节奏</span><h2>{incomplete ? `${incomplete} 轮等待复习` : '准备好下一轮'}</h2><p>从保存的步骤继续，让每一轮都有着落。</p></div><button className="primary" onClick={() => setEditor({})} disabled={busy}>设置复习任务</button></section>
    <div className="review-task-links"><button onClick={() => setTasksOpen(true)}>管理任务 <span>{activeTasks.length}</span></button><button onClick={onWall}>从单词墙选词</button></div>
    <div className="review-records-header"><h2>复习记录</h2><select aria-label="轮次完成状态" value={scope} onChange={e => { setScope(e.target.value); setPage(0); }}><option value="all">全部轮次</option><option value="incomplete">未完成</option><option value="completed">已完成</option></select></div>
    <div className="review-round-list">{visible.map(round => <RoundCard key={round.session_id} round={round} onOpen={onResume} onManage={setSelected}/>)}</div>
    {!visible.length && <Empty title={scope === 'completed' ? '还没有完成的轮次' : scope === 'incomplete' ? '暂无未完成轮次' : '为今天设置一轮复习'}><p>创建任务后，轮次会出现在这里。点击卡片开始。</p></Empty>}
    {rounds.length > 4 && <nav className="pager" aria-label="复习轮次分页"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}<small>共 {rounds.length} 轮</small></span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav>}
    <p className="review-manage-hint">长按卡片管理轮次，也可点击卡片右上角。</p>
    <details className="review-explanation"><summary>复习步骤与颜色</summary><p>英文认义两遍 → 补全拼写 → 中文默写。沿用原轮次设置，已保存步骤会自动续接；所有阶段通过才结算该词。</p><p>红色表示已有到期单词或任务已过截止日；橙色表示当前可练或今天截止。颜色依据复习排期和截止日期，不测量遗忘程度。已完成状态单独标注。</p><p>任务只生成打开 App 当天的轮次，不补建过去、不预建未来。可练词优先选择已到期、在该任务中较久未分配的单词。</p></details>
  </main>
    {editor && <TaskForm key={editor.id || 'new'} state={state} task={editor.id ? editor : null} busy={busy} onClose={() => setEditor(null)} onSave={value => save(() => editor.id ? repo.updateReviewTask(editor.id, value) : repo.createReviewTask(value), editor.id ? '任务已调整，已有轮次保留' : '任务已保存，今日轮次可在复习记录中查看', () => { setEditor(null); setScope('all'); setPage(0); })}/>}
    {selected && <Sheet title={selected.name} onClose={busy ? () => {} : () => setSelected(null)}><div className="review-action-list">
      <button disabled={busy} onClick={() => save(() => repo.updateReviewRound(selected.session_id, { pinned: !selected.pinned }), selected.pinned ? '已取消置顶' : '轮次已置顶', () => setSelected(null))}>{selected.pinned ? '取消置顶' : '置顶轮次'}</button>
      <button disabled={busy} onClick={() => { setRename(selected); setName(selected.name); setSelected(null); }}>修改轮次名称</button>
      {selectedTask && !selectedTask.cancelled && <><button disabled={busy} onClick={() => { setEditor(selectedTask); setSelected(null); }}>调整所属任务</button><button disabled={busy} onClick={() => { setConfirm({ type: 'cancel', task: selectedTask }); setSelected(null); }}>取消后续任务</button></>}
      <button className="danger" disabled={busy} onClick={() => { setConfirm({ type: 'delete', round: selected }); setSelected(null); }}>归档并删除本轮</button>
    </div></Sheet>}
    {rename && <Sheet title="修改轮次名称" onClose={busy ? () => {} : () => setRename(null)}><form className="review-task-form" onSubmit={e => { e.preventDefault(); if (name.trim()) save(() => repo.updateReviewRound(rename.session_id, { name: name.trim() }), '名称已更新，进度保留', () => setRename(null)); }}><label className="field">轮次名称<input autoFocus required maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)}/></label><button className="primary wide-button" disabled={busy || !name.trim()}>保存名称</button></form></Sheet>}
    {tasksOpen && <Sheet title="复习任务" onClose={busy ? () => {} : () => setTasksOpen(false)}><div className="review-task-list">{!taskList.length && <Empty title="暂无复习任务"><p>设置词数、筛选范围与截止日期，按天生成轮次。</p></Empty>}{taskList.slice().reverse().map(task => <article key={task.id}><strong>{task.name}</strong><p>每天最多 {task.word_count} 词 · 截止 {task.deadline}</p><span>{task.cancelled ? '已取消' : task.expired ? '已截止' : '进行中'}</span>{!task.cancelled && <div><button disabled={busy} onClick={() => { setTasksOpen(false); setEditor(task); }}>调整</button><button disabled={busy} onClick={() => { setTasksOpen(false); setConfirm({ type: 'cancel', task }); }}>取消任务</button></div>}</article>)}</div></Sheet>}
    {confirm && <Confirm busy={busy} danger={confirm.type === 'delete'} title={confirm.type === 'delete' ? '删除这轮复习？' : '取消后续任务？'} action={confirm.type === 'delete' ? '删除本轮' : '取消任务'} onClose={() => setConfirm(null)} onConfirm={() => save(() => confirm.type === 'delete' ? repo.deleteReviewRound(confirm.round.session_id) : repo.cancelReviewTask(confirm.task.id), confirm.type === 'delete' ? '本轮已删除' : '任务已取消，已有轮次保留', () => setConfirm(null))}>{confirm.type === 'delete' ? '本轮将从复习记录移除。已有学习证据仍保留；所属任务的后续安排不受影响。' : '停止生成后续每日轮次。已经生成的轮次和进度保留，可分别删除。'}</Confirm>}
  </section>;
}
