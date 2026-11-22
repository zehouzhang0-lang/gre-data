import React, { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, RotateCcw, PenLine, Settings as SettingsIcon, Search, X, ChevronLeft, ChevronRight, Check, RefreshCw, ArrowUpRight, SlidersHorizontal, CircleCheck, ArrowLeft, AlertCircle, Bookmark, ArrowUp, Grip } from 'lucide-react';
import { words, byId, labels, createPages, freshPages, storageKey } from './data.mjs';
import './style.css';

const initial = { schema: 1, theme: 'clear', tab: 'wall', query: '', searchOrigin: null, filter: 'all', sort: 'demo', scopes: {}, reviews: [7, 0, 4, 0], practiceIndex: 0, drafts: {} };
function load() { try { const s = JSON.parse(localStorage.getItem(storageKey)); return s?.schema === 1 ? { ...initial, ...s } : initial; } catch { return initial; } }
const Icon = ({ type: Type, ...props }) => <Type size={20} strokeWidth={1.7} aria-hidden="true" {...props} />;
const rounds = [
  { name: '温和与坚定', hint: '英文认义', total: 20, due: '已到期', color: 'urgent' },
  { name: '表达与判断', hint: '英文认义', total: 16, due: '今日复习', color: 'today' },
  { name: '容易混淆的近义词', hint: '英文认义', total: 12, due: '继续上次', color: 'calm' },
  { name: '阅读中的新朋友', hint: '英文认义', total: 10, due: '待开始', color: 'calm' },
];

function App() {
  const [state, setState] = useState(load);
  const [width, setWidth] = useState(390);
  const [scenario, setScenario] = useState('normal');
  const [toast, setToast] = useState(null);
  const [undo, setUndo] = useState(null);
  const [flips, setFlips] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [multi, setMulti] = useState(false);
  const [reviewRound, setReviewRound] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false);
  const [saved, setSaved] = useState(true);
  const [reduce, setReduce] = useState(false);
  const [motion, setMotion] = useState({ type: '', id: 0 });
  const gridRef = useRef(null), metrics = useRef([]), pending = useRef(null);
  const scope = JSON.stringify([state.filter, state.sort, state.query.trim().toLowerCase()]);
  const basePages = useMemo(() => createPages(state.query, state.filter, state.sort), [state.query, state.filter, state.sort]);
  const pages = state.scopes[scope]?.pages ?? basePages;
  const index = Math.max(0, Math.min(state.scopes[scope]?.index ?? 0, pages.length - 1));
  const current = pages[index] ?? [];
  const total = pages.reduce((n, p) => n + p.length, 0);
  const activeRounds = rounds.map((round, i) => ({ ...round, i })).filter(round => state.reviews[round.i] < round.total);
  const doneRounds = rounds.map((round, i) => ({ ...round, i })).filter(round => state.reviews[round.i] >= round.total);
  const mark = (action) => { pending.current = { action, start: performance.now() }; };
  const update = (patch) => setState(s => ({ ...s, ...patch }));
  const move = (type) => setMotion(m => ({ type, id: m.id + 1 }));

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); setSaved(true); }
    catch { setSaved(false); }
  }, [state]);

  useLayoutEffect(() => {
    if (!pending.current) return;
    const sample = pending.current; pending.current = null;
    sample.commit = performance.now() - sample.start;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      metrics.current.push({ action: sample.action, commitMs: sample.commit, paintProxyMs: performance.now() - sample.start, theme: state.theme });
    }));
  });
  useLayoutEffect(() => {
    if (!gridRef.current || reduce || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dir = motion.type === 'next' ? 18 : motion.type === 'previous' ? -18 : 0;
    const y = motion.type === 'fresh' ? 12 : 0;
    if (!motion.type) return;
    const animation = gridRef.current.animate([
      { opacity: 0.65, transform: `translate(${dir}px, ${y}px)` },
      { opacity: 1, transform: 'translate(0, 0)' },
    ], { duration: motion.type === 'fresh' ? 180 : 150, easing: 'cubic-bezier(.2,.75,.3,1)' });
    return () => animation.cancel();
  }, [motion.id, reduce]);

  useEffect(() => {
    window.prototypeQA = {
      snapshot: () => ({ index, pages, ids: current, total, theme: state.theme, filter: state.filter, sort: state.sort, query: state.query, reviews: state.reviews, selected: [...selected], flips: [...flips], saved, scope }),
      metrics: () => [...metrics.current],
      clearMetrics: () => { metrics.current = []; },
    };
  });

  const setPage = (next) => {
    if (next < 0 || next >= pages.length || next === index || scenario !== 'normal') return;
    mark(next > index ? 'next' : 'previous'); move(next > index ? 'next' : 'previous');
    setState(s => ({ ...s, scopes: { ...s.scopes, [scope]: { pages, index: next } } }));
    setToast(null); setFlips(new Set()); setSelected(new Set());
  };
  const fresh = () => {
    if (multi || scenario !== 'normal') return;
    const next = freshPages(pages, index); if (!next) return;
    mark('fresh'); move('fresh');
    setUndo({ scope, pages, index });
    setState(s => ({ ...s, scopes: { ...s.scopes, [scope]: { pages: next.pages, index } } }));
    setFlips(new Set());
    setToast({ text: `本页 ${current.length} 词已后移 ${next.distance} 页`, detail: state.query ? '仅调整本次搜索结果的顺序' : '记忆状态保持不变', undo: true });
  };
  const undoFresh = () => {
    if (!undo || undo.scope !== scope) return;
    mark('undo'); move('previous');
    setState(s => ({ ...s, scopes: { ...s.scopes, [scope]: { pages: undo.pages, index: undo.index } } }));
    setUndo(null); setFlips(new Set()); setToast({ text: '已恢复 fresh 前的这一页' });
  };
  const query = (value) => {
    mark(value ? 'search' : 'clear');
    setState(s => ({ ...s, query: value,
      ...(value.trim() ? { searchOrigin: s.searchOrigin || { filter: s.filter, sort: s.sort } }
        : s.searchOrigin ? { ...s.searchOrigin, searchOrigin: null } : {}),
    }));
    setToast(null); setSelected(new Set()); setMulti(false); setFlips(new Set()); setScenario('normal');
  };
  const reset = () => {
    setState(initial); setScenario('normal'); setToast(null); setUndo(null); setFlips(new Set()); setSelected(new Set()); setMulti(false); setReviewRound(null); setCompleted(false); setShowMeaning(false); setReduce(false);
  };
  const changeTab = (tab) => { update({ tab }); setToast(null); setScenario('normal'); setReviewRound(null); };
  const toggleTile = (id) => {
    const setter = multi ? setSelected : setFlips;
    setter(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const longPress = (id) => { setMulti(true); setSelected(old => new Set([...old, id])); };
  const gesture = useWallGestures({ onNext: () => setPage(index + 1), onPrevious: () => setPage(index - 1), onFresh: fresh, onLong: longPress, enabled: state.tab === 'wall' && scenario === 'normal', multi });

  const header = (title, subtitle, action) => <header className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>;
  const pager = (count, onPrevious, onNext, previousDisabled, nextDisabled, caption) => <div className="pager"><button className="icon-button" aria-label="上一页" disabled={previousDisabled} onClick={onPrevious}><Icon type={ChevronLeft}/></button><div><strong>{count}</strong><small>{caption}</small></div><button className="icon-button" aria-label="下一页" disabled={nextDisabled} onClick={onNext}><Icon type={ChevronRight}/></button></div>;

  return <div className="workbench">
    <aside className="review-panel">
      <div className="review-heading"><BookOpen size={25}/><span>GRE / 界面工作室</span></div>
      <h2>单词墙<br/>交互对照稿</h2>
      <p className="intro">让注意力留在词上。<br/>每一次操作，都能自然接着学。</p>
      <div className="safe-note"><span className="status-dot"/>合成词条与演示进度 · 独立原型</div>
      <section className="directions" aria-label="视觉方向">
        <button className={`direction ${state.theme === 'clear' ? 'chosen' : ''}`} onClick={() => update({ theme: 'clear' })}><span className="swatch clear">Aa</span><span><b>A · 清爽白底</b><small>熟悉的青绿，更清楚的层级</small></span>{state.theme === 'clear' && <Icon type={Check}/>}</button>
        <button className={`direction ${state.theme === 'paper' ? 'chosen' : ''}`} onClick={() => update({ theme: 'paper' })}><span className="swatch paper">Aa</span><span><b>B · 纸感阅读</b><small>柔和纸色，更安静的英文阅读</small></span>{state.theme === 'paper' && <Icon type={Check}/>}</button>
      </section>
      <div className="review-controls"><span>画布宽度</span><div className="segmented"><button aria-pressed={width === 360} onClick={() => setWidth(360)}>360</button><button aria-pressed={width === 390} onClick={() => setWidth(390)}>390</button></div></div>
      <label className="review-controls"><span>减少动态效果</span><input type="checkbox" checked={reduce} onChange={e => setReduce(e.target.checked)}/></label>
      <div className="review-controls"><label htmlFor="scenario">演示状态</label><select id="scenario" value={scenario} onChange={e => { update({ tab: 'wall' }); setToast(null); setScenario(e.target.value); }}><option value="normal">正常</option><option value="loading">载入中</option><option value="empty">无结果</option><option value="error">载入失败</option></select></div>
      <div className="try-list"><h3>可以这样试</h3><p><span>01</span>翻到第 3 页，搜索，再清空。</p><p><span>02</span>点 fresh，查看新的一页，再撤销。</p><p><span>03</span>长按多选，或轻触翻看释义。</p><p><span>04</span>继续一轮复习，切走，再回来。</p></div>
      <button className="reset-demo" onClick={reset}><Icon type={RotateCcw} size={15}/>重置演示</button>
      <p className="outside-caption">不读取你的词库，不产生真实学习记录。<br/>两套视觉共享同一状态，可随时对照。</p>
    </aside>

    <div className="device-stage"><div className="device-caption"><span>{state.theme === 'clear' ? 'A — 清爽白底' : 'B — 纸感阅读'}</span><span>{width} × 844</span></div>
    <div className={`phone theme-${state.theme} ${reduce ? 'reduced' : ''}`} style={{ '--phone-width': `${width}px` }}>
      <main className="phone-main" key={state.tab}>
      {state.tab === 'wall' && <section className="wall-page">
        {header('词库', '随时认识，新鲜的一页', <button className="text-button" onClick={() => { setMulti(!multi); setSelected(new Set()); }}>{multi ? '完成' : '多选'}</button>)}
        <div className="search-field"><Icon type={Search}/><input type="search" aria-label="搜索单词、释义或笔记" placeholder="搜索单词、释义或笔记" value={state.query} onChange={e => query(e.target.value)} autoComplete="off"/>{state.query && <button aria-label="清空搜索" onClick={() => query('')}><Icon type={X} size={17}/></button>}</div>
        <div className="wall-toolbar"><select aria-label="筛选词库" value={state.filter} onChange={e => { update({ filter: e.target.value }); setToast(null); setSelected(new Set()); }}><option value="all">全部单词</option>{Object.entries(labels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="排序" value={state.sort} onChange={e => { update({ sort: e.target.value }); setToast(null); }}><option value="demo">演示顺序</option><option value="az">A–Z</option></select></div>
        <div className="legend" aria-label="记忆状态图例">{['forgot', 'partial', 'clear'].map(s => <span key={s}><i className={s}/>{labels[s]}</span>)}</div>
        {multi && <div className="selection-bar"><span>已选 {selected.size} 词</span><button onClick={() => setSelected(new Set(current))}>全选本页</button><button onClick={() => setSelected(new Set())}>清空</button></div>}
        <div className="wall-content" ref={gesture.ref} onClickCapture={gesture.suppressClick}>
          {scenario === 'loading' ? <div className="state-view"><div className="skeleton-grid">{Array.from({ length: 28 }, (_, i) => <i key={i}/>)}</div><p role="status">正在读取词库…</p><button className="text-button" onClick={() => setScenario('normal')}>显示载入结果</button></div>
          : scenario === 'error' ? <div className="empty-state"><Icon type={AlertCircle} size={30}/><h2>这次没能载入词库</h2><p>当前位置已经保留。<br/>重试后从这里继续。</p><button className="primary" onClick={() => setScenario('normal')}>重新载入</button></div>
          : !current.length || scenario === 'empty' ? <div className="empty-state"><Icon type={Search} size={30}/><h2>暂时没有匹配的词</h2><p>试试更短的词形或中文释义。</p><button className="outline" onClick={() => { query(''); update({ filter: 'all' }); }}>清空搜索与筛选</button></div>
          : <div className="word-grid" ref={gridRef}>{current.map(id => { const w = byId[id]; return <button key={id} data-word-id={id} className={`word-tile ${w.status} ${selected.has(id) ? 'selected' : ''} ${flips.has(id) ? 'flipped' : ''}`} aria-label={`${w.word}，${w.meaning}，${labels[w.status]}`} aria-pressed={multi ? selected.has(id) : flips.has(id)} onClick={() => toggleTile(id)} onPointerDown={e => gesture.mouseDown(e,id)} onPointerUp={gesture.mouseUp} onPointerLeave={gesture.mouseUp}>
            <span>{flips.has(id) ? w.meaning : w.word}</span>{selected.has(id) && <Check className="selection-check" size={12} strokeWidth={3}/>}
          </button>; })}</div>}
        </div>
        {pager(`${pages.length && scenario !== 'empty' ? index + 1 : 0} / ${scenario === 'empty' ? 0 : pages.length}`, () => setPage(index - 1), () => setPage(index + 1), index === 0 || scenario !== 'normal', index >= pages.length - 1 || scenario !== 'normal', `${scenario === 'empty' ? 0 : total} 词${state.query ? ' · 搜索结果' : ''}`)}
        <button className="primary fresh-button" onClick={fresh} disabled={index >= pages.length - 1 || !pages.length || multi || scenario !== 'normal'}><Icon type={RefreshCw}/><span>fresh 本页</span></button>
        <p className="gesture-hint">{multi ? '完成多选后，可以 fresh 本页' : index >= pages.length - 1 && pages.length ? '已到最后一页，向前翻看更多词' : '双指上滑，换一页新鲜词'}</p>
      </section>}

      {state.tab === 'review' && <section className="review-page">
        {reviewRound == null ? <>
          {header('复习', '每次回来，都从上次继续。')}
          <button className="outline task-create" onClick={() => setToast({ text: '任务设置将在正式方案中沿用现有创建流程', detail: '此处先评审任务卡片与继续状态' })}><Icon type={SlidersHorizontal}/>设置复习任务</button>
          <div className="section-title"><h2>复习记录</h2><span>{completed ? doneRounds.length + 1 : activeRounds.length} 轮</span></div>
          <div className="review-tabs"><button className={!completed ? 'active' : ''} onClick={() => setCompleted(false)}>未完成</button><button className={completed ? 'active' : ''} onClick={() => setCompleted(true)}>已完成</button></div>
          {completed ? <><div className="completed-card"><Icon type={CircleCheck}/><div><h3>简明与清晰</h3><p>本轮已完成 · 12 / 12 词</p></div></div>{doneRounds.map(round => <button className="completed-card completed-button" key={round.name} onClick={() => setReviewRound(round.i)}><Icon type={CircleCheck}/><div><h3>{round.name}</h3><p>本轮已完成 · {round.total} / {round.total} 词</p></div><Icon type={ChevronRight}/></button>)}</> : <div className="round-list">{activeRounds.map(round => { const i = round.i; return <button className={`round-card ${round.color}`} key={round.name} onClick={() => { setReviewRound(i); setShowMeaning(false); }}><div className="round-top"><span>{round.due}</span>{i === 0 && <Icon type={Bookmark} size={14}/>}</div><h3>{round.name}</h3><div className="progress-line"><span>{state.reviews[i]} / {round.total} 词</span><b>{state.reviews[i] ? '继续' : '开始'}<ChevronRight size={15}/></b></div><div className="progress-track"><i style={{ width: `${state.reviews[i] / round.total * 100}%` }}/></div></button>; })}</div>}
        </> : <>
          <button className="back-button" onClick={() => setReviewRound(null)}><Icon type={ArrowLeft}/>复习记录</button>
          <div className="session-heading"><span>{rounds[reviewRound].hint}</span><h1>{rounds[reviewRound].name}</h1><p>{Math.min(state.reviews[reviewRound], rounds[reviewRound].total)} / {rounds[reviewRound].total} 词已练</p><div className="progress-track"><i style={{ width: `${state.reviews[reviewRound] / rounds[reviewRound].total * 100}%` }}/></div></div>
          {state.reviews[reviewRound] >= rounds[reviewRound].total ? <div className="session-complete"><Icon type={CircleCheck} size={44}/><h2>这一轮，完成了。</h2><p>下次复习，继续巩固。</p><button className="primary" onClick={() => setReviewRound(null)}>返回复习记录</button></div> : <><div className="recall-card"><span className="recall-label">试着回想它的意思</span><strong>{words[(reviewRound * 28 + state.reviews[reviewRound]) % words.length].word}</strong>{showMeaning ? <p>{words[(reviewRound * 28 + state.reviews[reviewRound]) % words.length].meaning}</p> : <button className="text-button" onClick={() => setShowMeaning(true)}>查看释义</button>}</div><div className="recall-actions"><button className="outline" onClick={() => { setShowMeaning(true); setToast({ text: '再看一遍，然后继续', detail: '尚未计入本轮已练词数' }); }}>再想想</button><button className="primary" onClick={() => { const next = [...state.reviews]; next[reviewRound]++; setSaved(false); update({ reviews: next }); setShowMeaning(false); setToast(null); }}>记得，继续<ChevronRight size={17}/></button></div></>}
          <p className={`save-state ${saved ? '' : 'unsaved'}`} role="status"><Icon type={saved ? CircleCheck : AlertCircle} size={14}/>{saved ? '本轮位置已保存在此设备' : '尚未保存，请保持页面打开'}</p>
        </>}
      </section>}

      {state.tab === 'practice' && <Practice state={state} update={update} saved={saved} notify={setToast}/>}
      {state.tab === 'settings' && <section className="settings-page">{header('设置', '顺手的习惯，留在这里。')}
        <h2>阅读外观</h2><div className="settings-choices">{[['clear','清爽白底'],['paper','纸感阅读']].map(([key,name]) => <button key={key} className={state.theme === key ? 'active' : ''} onClick={() => update({ theme: key })}><span className={`swatch ${key}`}>Aa</span><b>{name}</b>{state.theme === key && <Icon type={Check}/>}</button>)}</div>
        <label className="settings-row"><span><b>减少动态效果</b><small>保留反馈，减少位移</small></span><input type="checkbox" checked={reduce} onChange={e => setReduce(e.target.checked)}/></label>
        <h2>本机记录</h2><div className="settings-row"><span><b>{saved ? '演示状态已保存' : '演示状态尚未保存'}</b><small>仅在这个原型地址中使用</small></span><Icon type={saved ? CircleCheck : AlertCircle}/></div>
        <div className="settings-note"><p>这里使用合成词条和演示进度。不会导入、覆盖或同步你的学习记录。</p><button className="outline" onClick={reset}>重置这份演示</button></div>
      </section>}
      </main>
      {toast && <div className="toast" role="status"><div><strong>{toast.text}</strong>{toast.detail && <small>{toast.detail}</small>}</div>{toast.undo && undo?.scope === scope ? <button onClick={undoFresh}>撤销</button> : <button aria-label="关闭提示" onClick={() => setToast(null)}><Icon type={X} size={15}/></button>}</div>}
      <nav className="bottom-nav" aria-label="主导航">{[['wall','词库',BookOpen],['review','复习',RotateCcw],['practice','刷题',PenLine],['settings','设置',SettingsIcon]].map(([id,title,icon]) => <button key={id} onClick={() => changeTab(id)} className={state.tab === id ? 'active' : ''} aria-current={state.tab === id ? 'page' : undefined}><Icon type={icon} size={23}/><span>{title}</span>{state.tab === id && <i/>}</button>)}</nav>
    </div><p className="stage-footnote">双指手势请在触屏设备体验 · 桌面可使用按钮</p></div>
  </div>;
}

function useWallGestures({ onNext, onPrevious, onFresh, onLong, enabled, multi }) {
  const ref = useRef(null), callbacks = useRef(), track = useRef(null), timer = useRef(), suppressUntil = useRef(0);
  callbacks.current = { onNext, onPrevious, onFresh, onLong, enabled, multi };
  const cancelHold = () => clearTimeout(timer.current);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const points = touches => [...touches].map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
    const start = e => {
      cancelHold(); if (!callbacks.current.enabled) return;
      if (e.touches.length > 2) { track.current = null; return; }
      track.current = { start: points(e.touches), end: points(e.touches), began: performance.now(), moved: false, fired: false };
      if (e.touches.length === 2) { suppressUntil.current = Date.now() + 900; return; }
      const id = e.target.closest('[data-word-id]')?.dataset.wordId;
      if (id) timer.current = setTimeout(() => { callbacks.current.onLong(id); suppressUntil.current = Date.now() + 900; if (track.current) track.current.fired = true; }, 450);
    };
    const move = e => {
      const g = track.current; if (!g || g.fired) return;
      if (e.touches.length !== g.start.length) { cancelHold(); track.current = null; return; }
      g.end = points(e.touches);
      const delta = g.start.map(p => { const q = g.end.find(t => t.id === p.id); return q ? { x: q.x - p.x, y: q.y - p.y } : null; });
      if (delta.some(d => !d)) { cancelHold(); track.current = null; return; }
      if (delta.some(d => Math.hypot(d.x,d.y) > 10)) { cancelHold(); g.moved = true; suppressUntil.current = Date.now() + 500; }
      if (delta.length === 2 && !callbacks.current.multi) {
        const [a,b] = delta;
        if (a.y < -14 && b.y < -14 && Math.abs(a.x) < 32 && Math.abs(b.x) < 32 && Math.abs(a.y - b.y) < 35) {
          if (e.cancelable) e.preventDefault();
          if (a.y < -48 && b.y < -48) { g.fired = true; callbacks.current.onFresh(); suppressUntil.current = Date.now() + 700; }
        }
      } else if (delta.length === 1 && Math.abs(delta[0].x) > 20 && Math.abs(delta[0].x) > Math.abs(delta[0].y) * 1.7) { if (e.cancelable) e.preventDefault(); }
    };
    const end = e => {
      cancelHold(); const g = track.current; if (!g) return;
      if (g.start.length === 1 && !g.fired && !callbacks.current.multi && performance.now() - g.began < 900) {
        const dx = g.end[0].x - g.start[0].x, dy = g.end[0].y - g.start[0].y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.7) { dx < 0 ? callbacks.current.onNext() : callbacks.current.onPrevious(); suppressUntil.current = Date.now() + 700; if (e.cancelable) e.preventDefault(); }
      }
      if (g.fired || g.moved || g.start.length === 2) suppressUntil.current = Date.now() + 700;
      track.current = null;
    };
    const cancel = () => { cancelHold(); track.current = null; suppressUntil.current = Date.now() + 500; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', cancel, { passive: true });
    return () => { cancelHold(); el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', cancel); };
  }, [enabled]);
  return { ref, suppressClick: e => { if (Date.now() < suppressUntil.current) { e.preventDefault(); e.stopPropagation(); } }, mouseDown: (e,id) => { if (e.pointerType !== 'mouse') return; timer.current = setTimeout(() => { callbacks.current.onLong(id); suppressUntil.current = Date.now() + 700; },450); }, mouseUp: cancelHold };
}

const exercises = [
  { text: 'The instructions were so clear that everyone could follow them.', translation: '说明十分清晰，每个人都能照着操作。', options: ['clear', 'confusing', 'incomplete'] },
  { text: 'The team chose a modest design with very little decoration.', translation: '团队选择了一种简朴的设计，几乎没有装饰。', options: ['modest', 'ornate', 'fragile'] },
  { text: 'She checked each detail before sharing the report.', translation: '她在分享报告之前检查了每个细节。', options: ['meticulous', 'careless', 'hasty'] },
];
function Practice({ state, update, saved, notify }) {
  const i = state.practiceIndex, ex = exercises[i];
  const switchQuestion = n => { if (n >= 0 && n < exercises.length) update({ practiceIndex: n }); };
  return <section className="practice-page"><header className="page-header"><div><h1>刷题</h1><p>原创例句 · 交互示例 {i + 1} / 3</p></div></header><div className="practice-mode"><PenLine size={15}/><span>词义辨认</span><span>草稿</span></div><div className="question-copy"><p>{ex.text}</p><small>选择与例句表达相符的词。</small></div><div className="options">{ex.options.map((option,j) => <button key={option} aria-pressed={state.drafts[i] === j} onClick={() => update({ drafts: { ...state.drafts, [i]: j } })}><span>{'ABC'[j]}</span>{option}{state.drafts[i] === j && <Icon type={Check}/>}</button>)}</div><p className="save-state"><Icon type={saved ? CircleCheck : AlertCircle} size={14}/>{state.drafts[i] == null ? '选择后会保留本题草稿' : saved ? '本题草稿已保存' : '草稿尚未保存'}</p><div className="question-nav"><button className="outline" disabled={!i} onClick={() => switchQuestion(i - 1)}><Icon type={ChevronLeft}/>上一题</button><button className="primary" disabled={i >= exercises.length - 1} onClick={() => switchQuestion(i + 1)}>下一题<Icon type={ChevronRight}/></button></div><details className="practice-note"><summary>查看例句中文</summary><p>{ex.translation}</p></details><p className="quiet-copy">仅展示切题与草稿反馈，不做计分。</p></section>;
}

createRoot(document.getElementById('root')).render(<App/>);
