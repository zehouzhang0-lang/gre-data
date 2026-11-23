import { useEffect, useMemo, useRef, useState } from 'react';
import { dayKey } from '../../../server/spaced-review.mjs';
import { orderedReviewRounds, selectReviewWords } from '../data/review-tasks.mjs';
import { play } from '../sound.mjs';
import { Confirm, Sheet } from './Primitives';
import '../review-redesign.css';

const DONE_PAGE = 20;
const COUNTS = [10, 20, 30, 50];
const DAYS = [7, 14, 30];
const DUE_LABEL = { urgent: '逾期', today: '今天' };
const SCOPE_LABEL = { all: '全部单词', due: '只背到期的', new: '只背没背过的' };

const isDone = round => !!(round.completed_at || round.complete);
const shortDate = day => `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8, 10))} 日`;
function addDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Tap opens the round. Holding it (or a right click) opens its menu, so the row needs no extra button.
function useHold(onHold) {
  const timer = useRef(null), held = useRef(false), start = useRef(null);
  const stop = () => { clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  return {
    held,
    handlers: {
      onPointerDown: e => {
        if (e.button !== 0) return;
        held.current = false; start.current = { x: e.clientX, y: e.clientY }; stop();
        timer.current = setTimeout(() => { held.current = true; onHold(); }, 260);
      },
      onPointerMove: e => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) stop(); },
      onPointerUp: stop, onPointerCancel: stop, onPointerLeave: stop,
      onContextMenu: e => { e.preventDefault(); stop(); if (!held.current) { held.current = true; onHold(); } },
    },
  };
}

function RoundRow({ round, onOpen, onManage }) {
  const { held, handlers } = useHold(() => { play('sheetOpen'); onManage(round); });
  const done = isDone(round), total = round.words.length, count = done ? total : round.completed_words?.length || 0;
  const due = DUE_LABEL[round.urgency.level];
  return <li style={{ '--progress': `${total ? count / total * 100 : 0}%` }}>
    <button className="review-row" data-sound="none" {...handlers}
      aria-label={`${round.name}，${due ? `${due}，` : ''}已背 ${count} 词，共 ${total} 词。长按可改名或删除`}
      onClick={() => { if (held.current) { held.current = false; return; } play('enter'); onOpen(round); }}>
      <span className="review-row-name">{round.name}</span>
      {due && <span className={`review-row-due ${round.urgency.level}`}>{due}</span>}
      <span className="review-row-count">{count}<i>/</i>{total}</span>
    </button>
  </li>;
}

function Choices({ label, options, value, onChange, disabled }) {
  return <div className="plan-choice" role="group" aria-label={label}>
    <span>{label}</span>
    <div>{options.map(([key, text]) => <button type="button" key={key} data-sound={value === key ? 'none' : 'chip'} disabled={disabled} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}</div>
  </div>;
}

// Two taps set up a plan: how many words a day and for how long. Nothing has to be typed.
function PlanForm({ state, task, busy, onClose, onSave, onStop }) {
  const today = dayKey(new Date(), state.timeZone);
  const [count, setCount] = useState(task?.word_count || 20);
  const [deadline, setDeadline] = useState(task && task.deadline >= today ? task.deadline : addDays(today, 13));
  const [filter, setFilter] = useState(task?.filter || { scope: 'all', topic: '', group: '' });
  const available = selectReviewWords(state, filter).length;
  const counts = COUNTS.includes(count) ? COUNTS : [...COUNTS, count].sort((a, b) => a - b);
  const ends = DAYS.map(days => [addDays(today, days - 1), `${days} 天`]);
  if (!ends.some(([day]) => day === deadline)) ends.unshift([deadline, `到 ${shortDate(deadline)}`]);
  const topics = state.relations.topics.filter(t => !t.deleted), groups = state.relations.groups.filter(g => !g.deleted);
  const narrowed = filter.scope !== 'all' || filter.topic || filter.group;
  const update = (key, value) => setFilter(previous => ({ ...previous, [key]: value }));
  const submit = () => onSave({ name: task?.name || `每日 ${count} 词`, word_count: count, deadline, filter, meaning_passes: task?.meaning_passes || 1 });
  return <Sheet title={task ? task.name : '每日计划'} closeSound={busy ? 'none' : 'sheetClose'} onClose={busy ? () => {} : onClose}
    footer={<>{task && <button type="button" data-sound="sheetOpen" disabled={busy} onClick={onStop}>停止计划</button>}<button type="button" className="primary" data-sound="submit" disabled={busy} onClick={submit}>{busy ? '保存中…' : task ? '保存' : '开始'}</button></>}>
    <div className="plan-form">
      <Choices label="每天" options={counts.map(n => [n, `${n} 词`])} value={count} onChange={setCount} disabled={busy}/>
      <Choices label="持续" options={ends} value={deadline} onChange={setDeadline} disabled={busy}/>
      <details className="plan-range">
        <summary><span>范围</span><span>{narrowed ? '已缩小' : SCOPE_LABEL.all}</span></summary>
        <select aria-label="背哪些词" value={filter.scope} onChange={e => update('scope', e.target.value)} disabled={busy}>{Object.entries(SCOPE_LABEL).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
        {topics.length > 0 && <select aria-label="主题" value={filter.topic} onChange={e => update('topic', e.target.value)} disabled={busy}><option value="">全部主题</option>{topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        {groups.length > 0 && <select aria-label="关系组" value={filter.group} onChange={e => update('group', e.target.value)} disabled={busy}><option value="">全部关系组</option>{groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}
      </details>
      <p className="plan-note">{available ? `现在可背 ${available} 词。` : '现在没有可背的词，有了会自动开始。'}每天打开 App 时生成当天的一轮。</p>
    </div>
  </Sheet>;
}

// The words picked on the wall that have not been put into a group of ten yet.
function QueueRow({ queue, busy, onContinue, onDrop }) {
  const { held, handlers } = useHold(() => { play('sheetOpen'); onDrop(); });
  return <li style={{ '--progress': `${queue.started / queue.total * 100}%` }}>
    <button className="review-row" data-sound="none" disabled={busy} {...handlers} aria-label={`${queue.base}，还剩 ${queue.words.length} 词，继续背下一组。长按可放弃剩下的词`}
      onClick={() => { if (held.current) { held.current = false; return; } play('enter'); onContinue(); }}>
      <span className="review-row-name">{queue.base}</span>
      <span className="review-row-due">还剩 {queue.words.length} 词</span>
      <span className="review-row-count">{queue.started}<i>/</i>{queue.total}</span>
    </button>
  </li>;
}

export default function Review({ state, repo, busy = false, mutate, active, onResume, onWall, queue, onContinueQueue, onDropQueue }) {
  const [showDone, setShowDone] = useState(false), [doneLimit, setDoneLimit] = useState(DONE_PAGE);
  const [selected, setSelected] = useState(null), [rename, setRename] = useState(null), [name, setName] = useState('');
  const [plans, setPlans] = useState(false), [editor, setEditor] = useState(null), [confirm, setConfirm] = useState(null);
  const rounds = useMemo(() => orderedReviewRounds(state), [state]);
  const todo = rounds.filter(r => !isDone(r)), done = rounds.filter(isDone);
  const dueToday = todo.filter(r => DUE_LABEL[r.urgency.level]).length;
  const activeTasks = (state.reviewTasks || []).filter(t => !t.cancelled && !t.expired);
  const next = todo[0];
  const headline = dueToday ? `今天还有 ${dueToday} 轮` : todo.length ? `还有 ${todo.length} 轮` : queue ? `还剩 ${queue.words.length} 词` : done.length ? '都背完了' : '还没有要背的';
  const close = busy ? () => {} : null;
  async function save(operation, message, after) { if (await mutate(operation, message)) after?.(); }
  function openPlans() { if (activeTasks.length) setPlans(true); else setEditor({}); }

  return <section className="screen review-redesign" data-ui-sounds="" hidden={!active} aria-label="背词">
    <main className="screen-scroll review-content">
      <h1 className="review-headline">{headline}</h1>
      {!todo.length && !queue && <p className="review-empty">在词库里筛出或选中想背的词，点「⋯」里的「背这些词」。</p>}
      {(todo.length > 0 || queue) && <ul className="review-rows rounds">
        {todo.map(round => <RoundRow key={round.session_id} round={round} onOpen={onResume} onManage={setSelected}/>)}
        {queue && <QueueRow queue={queue} busy={busy} onContinue={onContinueQueue} onDrop={() => setConfirm({ type: 'drop' })}/>}
      </ul>}
      <ul className="review-rows quiet">
        {done.length > 0 && <li>
          <button className="review-row" data-sound={showDone ? 'sheetClose' : 'sheetOpen'} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><span className="review-row-name">已完成</span><span className="review-row-count">{done.length} 轮</span></button>
          {showDone && <ul className="review-rows rounds done">
            {done.slice(0, doneLimit).map(round => <RoundRow key={round.session_id} round={round} onOpen={onResume} onManage={setSelected}/>)}
            {done.length > doneLimit && <li><button className="review-row" onClick={() => setDoneLimit(doneLimit + DONE_PAGE)}><span className="review-row-name">更多</span></button></li>}
          </ul>}
        </li>}
        <li><button className="review-row" data-sound="sheetOpen" disabled={busy} onClick={openPlans}><span className="review-row-name">每日计划</span><span className="review-row-count">{activeTasks.length ? `每天 ${activeTasks.reduce((sum, t) => sum + t.word_count, 0)} 词` : '未设置'}</span></button></li>
      </ul>
    </main>
    {next
      ? <button className="primary review-primary" data-sound="enter" onClick={() => onResume(next)}>{next.drill_count ? '继续' : '开始'}<span>{next.name}</span></button>
      : queue ? <button className="primary review-primary" data-sound="enter" disabled={busy} onClick={onContinueQueue}>继续<span>{queue.base} · 下 {Math.min(10, queue.words.length)} 个</span></button>
      : <button className="primary review-primary" data-sound="leave" onClick={onWall}>去词库选词</button>}

    {plans && <Sheet title="每日计划" onClose={close || (() => setPlans(false))}><ul className="review-rows sheet-rows">
      {activeTasks.map(task => <li key={task.id}><button className="review-row" disabled={busy} onClick={() => { setPlans(false); setEditor(task); }}><span className="review-row-name">{task.name}</span><span className="review-row-count">每天 {task.word_count} 词 · 到 {shortDate(task.deadline)}</span></button></li>)}
      <li><button className="review-row" disabled={busy} onClick={() => { setPlans(false); setEditor({}); }}><span className="review-row-name">新建计划</span></button></li>
    </ul></Sheet>}
    {editor && <PlanForm key={editor.id || 'new'} state={state} task={editor.id ? editor : null} busy={busy} onClose={() => setEditor(null)}
      onStop={() => { setConfirm({ type: 'stop', task: editor }); setEditor(null); }}
      onSave={value => save(() => editor.id ? repo.updateReviewTask(editor.id, value) : repo.createReviewTask(value), '计划已保存', () => setEditor(null))}/>}
    {selected && <Sheet title={selected.name} onClose={close || (() => setSelected(null))}><ul className="review-rows sheet-rows">
      <li><button className="review-row" disabled={busy} onClick={() => { setRename(selected); setName(selected.name); setSelected(null); }}><span className="review-row-name">改名</span></button></li>
      <li><button className="review-row" disabled={busy} onClick={() => save(() => repo.updateReviewRound(selected.session_id, { pinned: !selected.pinned }), selected.pinned ? '已取消置顶' : '已置顶', () => setSelected(null))}><span className="review-row-name">{selected.pinned ? '取消置顶' : '置顶'}</span></button></li>
      <li><button className="review-row danger-row" disabled={busy} onClick={() => { setConfirm({ type: 'delete', round: selected }); setSelected(null); }}><span className="review-row-name">删除这一轮</span></button></li>
    </ul></Sheet>}
    {rename && <Sheet title="改名" onClose={close || (() => setRename(null))}>
      <form className="plan-form" onSubmit={e => { e.preventDefault(); if (name.trim()) save(() => repo.updateReviewRound(rename.session_id, { name: name.trim() }), '已改名', () => setRename(null)); }}>
        <input autoFocus required maxLength={100} aria-label="这一轮的名称" value={name} disabled={busy} onChange={e => setName(e.target.value)}/>
        <button className="primary wide-button" disabled={busy || !name.trim()}>保存</button>
      </form>
    </Sheet>}
    {confirm?.type === 'drop' && <Confirm danger title="不背剩下的词了？" action="不背了" onClose={() => setConfirm(null)} onConfirm={() => { onDropQueue(); setConfirm(null); }}>还没开始的 {queue?.words.length} 个词会从这里移走，已经背过的记录保留。</Confirm>}
    {confirm && confirm.type !== 'drop' && <Confirm busy={busy} danger={confirm.type === 'delete'} title={confirm.type === 'delete' ? '删除这一轮？' : '停止这个计划？'} action={confirm.type === 'delete' ? '删除' : '停止'} onClose={() => setConfirm(null)}
      onConfirm={() => save(() => confirm.type === 'delete' ? repo.deleteReviewRound(confirm.round.session_id) : repo.cancelReviewTask(confirm.task.id), confirm.type === 'delete' ? '已删除' : '计划已停止', () => setConfirm(null))}>
      {confirm.type === 'delete' ? '这一轮会从列表里移除，学习记录保留。' : '以后不再生成新的每日一轮，已有的轮保留。'}
    </Confirm>}
  </section>;
}
