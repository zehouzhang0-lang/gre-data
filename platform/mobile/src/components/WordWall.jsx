import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildIndexes, emptyFilters, entrySections, filterCount, filterEntries, PAGE_SIZE, ratingLabels, relationshipLabels, wordRating } from '../model.mjs';
import { loadWallView, searchWall, wallSwipe, wallViewKey } from '../wall-navigation.mjs';
import { createCardReadingDraft } from '../card-reading-draft.mjs';
import { useBackAction } from '../useBack';
import { Confirm, Empty, Icon, Pager, Sheet } from './Primitives';
import { FilterSheet, SizeSheet, SortSheet } from './WallSheets';
import WordTile from './WordTile';
import WordDetail from './WordDetail';
import '../wordwall-redesign.css';

export default function WordWall({ state, repo, busy, active, mutate, notify, onSelectionMode, onStartReview }) {
  const [view, setView] = useState(() => loadWallView(globalThis.localStorage, state.datasetId, state.settings));
  const { filters, display, page, seed } = view;
  const [selected, setSelected] = useState(new Set()), [flipped, setFlipped] = useState(new Set());
  const [selecting, setSelecting] = useState(false), [sheet, setSheet] = useState(null), [confirm, setConfirm] = useState(null);
  const [detail, setDetail] = useState(null), [group, setGroup] = useState(null);
  const [draftName, setDraftName] = useState(''), [groupKind, setGroupKind] = useState('topic');
  const scroll = useRef(null), viewRef = useRef(view), settingsTimer = useRef(null), gesture = useRef(null), suppressClick = useRef(false), savingReadings = useRef(false);
  const lastView = useRef(view);
  if (lastView.current !== view) { viewRef.current = view; lastView.current = view; }
  const readingDraft = useRef(null);
  if (!readingDraft.current) readingDraft.current = createCardReadingDraft();
  const live = useMemo(() => new Map(state.vocabulary.filter(w => !w.deleted).map(w => [w.word, w])), [state.vocabulary]);
  const indexes = useMemo(() => buildIndexes(state), [state]);
  const membership = useMemo(() => state.vocabulary.filter(w => !w.deleted).map(w => w.word).join('\n'), [state.vocabulary]);
  // A page/flip never reprojects the whole library. Keep rated words in place;
  // only a changed filter or vocabulary membership rebuilds the browse list.
  const entries = useMemo(() => filterEntries(state, filters, seed, indexes), [filters, seed, membership]);
  const present = useMemo(() => entries.filter(e => live.has(e.word)), [entries, live]);
  const unique = useMemo(() => [...new Set(present.map(e => e.word))], [present]);
  const ready = useMemo(() => unique.filter(word => live.get(word)?.meaning?.trim()), [unique, live]);
  const selectedWords = useMemo(() => [...selected].filter(word => live.has(word)), [selected, live]);
  const selectedReady = selectedWords.length > 0 && selectedWords.every(word => live.get(word)?.meaning?.trim());
  const pages = Math.max(1, Math.ceil(present.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1);
  const visible = useMemo(() => present.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE), [present, currentPage]);
  const pageWords = useMemo(() => [...new Set(visible.map(entry => entry.word))], [visible]);
  const sections = useMemo(() => entrySections(visible), [visible]);
  useEffect(() => { onSelectionMode(selecting && active); return () => onSelectionMode(false); }, [selecting, active, onSelectionMode]);
  const saveView = useCallback(() => {
    clearTimeout(settingsTimer.current);
    try { localStorage.setItem(wallViewKey(state.datasetId), JSON.stringify(viewRef.current)); } catch { /* Browsing remains available if preferences storage is full. */ }
  }, [state.datasetId]);
  const queueViewSave = useCallback(() => { clearTimeout(settingsTimer.current); settingsTimer.current = setTimeout(saveView, 180); }, [saveView]);
  useEffect(() => { queueViewSave(); }, [view, queueViewSave]);
  useEffect(() => {
    const flush = () => saveView();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { saveView(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); };
  }, [saveView]);
  useLayoutEffect(() => { if (active && scroll.current) scroll.current.scrollTop = viewRef.current.scrollTop; }, [active, filters, page, entries]);
  const cancelSelection = useCallback(() => { setSelecting(false); setSelected(new Set()); }, []);
  useBackAction(cancelSelection, active && selecting, 60);
  const flip = useCallback(word => {
    const next = new Set(flipped);
    if (next.has(word)) next.delete(word);
    else { next.add(word); readingDraft.current.record(word, new Date().toISOString()); }
    setFlipped(next);
  }, [flipped]);
  const select = useCallback(word => {
    setSelected(previous => { const next = new Set(previous); next.has(word) ? next.delete(word) : next.add(word); return next; });
  }, []);
  const longPress = useCallback(word => {
    if (gesture.current) gesture.current.cancelled = true;
    setSelecting(true); setSelected(previous => new Set([...previous, word]));
  }, []);
  function changeFilter(next, nextSeed = seed) {
    const apply = () => {
      setView(previous => ({ ...previous, filters: next, seed: nextSeed, page: 0, scrollTop: 0 }));
      setSelected(new Set()); setSheet(null);
    };
    setSheet(null);
    if (selected.size) setConfirm({ title: '更换筛选条件', text: `将清空当前选中的 ${selected.size} 个词。已经保存的记忆标记不会改变。`, action: '清空选择并应用', run: apply });
    else apply();
  }
  function changePage(value) {
    const next = Math.max(0, Math.min(pages - 1, value));
    if (next === currentPage) return;
    setView(previous => ({ ...previous, page: next, scrollTop: 0 }));
  }
  function changeQuery(query) {
    setView(previous => searchWall(previous, query, scroll.current?.scrollTop || 0));
  }
  function swipeDown(event) {
    suppressClick.current = false;
    if (event.isPrimary === false || selecting || busy || sheet || event.target.closest('button:not(.tile-face),input,select,textarea,a')) { gesture.current = null; return; }
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), pointerType: event.pointerType };
  }
  function swipeMove(event) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
    if (dy > 12 && dy > dx) start.cancelled = true;
    if (!start.cancelled && dx > 12 && dx > dy * 1.6) suppressClick.current = true;
  }
  function swipeEnd(event) {
    const start = gesture.current; gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const direction = wallSwipe(start, { x: event.clientX, y: event.clientY, time: performance.now() }, { selecting, textSelected: !!window.getSelection()?.toString() });
    if (direction) { suppressClick.current = true; changePage(currentPage + direction); }
  }
  async function createSelection() {
    if (!draftName.trim() || !selectedWords.length) return;
    const isGroup = sheet === 'create-group';
    if (await mutate(() => isGroup ? repo.createWordGroup({ words: selectedWords, kind: groupKind, name: draftName.trim() }) : repo.createReviewRound({ words: selectedWords, name: draftName.trim() }), isGroup ? `已创建${groupKind === 'topic' ? '语义主题' : '关系'}“${draftName.trim()}”` : `已创建复习轮“${draftName.trim()}”`)) setSheet(null);
  }
  async function rate(rating, words = selectedWords) {
    if (!words.length || words.some(word => !live.get(word)?.meaning?.trim())) return;
    if (await mutate(() => repo.rate(words, rating), `已标记 ${words.length} 词 · ${ratingLabels[rating]}`)) {
      cancelSelection(); setDetail(null);
    }
  }
  async function saveCardReadings() {
    if (savingReadings.current || busy) return;
    savingReadings.current = true;
    try {
    const batches = readingDraft.current.prepareAll(word => {
      const rating = wordRating(live.get(word));
      return rating === 'unrated' ? null : rating;
    }, word => live.has(word));
    const hasRatings = state.events?.some(event => event.kind === 'vocab_quick_review' && (event.payload?.session_id || event.session_id) === state.quickRound?.id);
    if (!batches.length && !hasRatings) { notify('没有新的卡片状态可记录'); setSheet(null); return; }
    if (!await mutate(() => repo.finishWallRound({ batches, expectedRoundId: state.quickRound?.id }))) return;
    readingDraft.current.commitAll();
    setFlipped(new Set()); setSheet(null);
    const count = new Set(batches.flatMap(batch => batch.payload.items.map(item => item.word))).size;
    notify(`已记录${count ? ` ${count} 词的翻阅状态，` : '，'}已进入新一轮`);
    } finally { savingReadings.current = false; }
  }
  function selectPage() {
    setSelected(previous => new Set([...previous, ...pageWords]));
  }
  function selectAll() {
    setConfirm({ title: '选中全部筛选结果', text: `将选中所有页面的 ${unique.length} 个不同单词，不只是本页。跨组重复词只选中一次。`, action: `确认选择 ${unique.length} 词`, run: () => setSelected(new Set(unique)) });
  }
  async function requestCuration() {
    if (!selectedWords.length) return;
    let added = 0;
    if (await mutate(async () => { added = (await repo.requestCuration(selectedWords)).added; })) {
      notify(added ? `已标记 ${added} 词待补充整理` : '所选单词已标记待补充整理');
      setSheet(null); cancelSelection();
    }
  }
  const scopeLabel = { all: '全部单词', due: '今日待复习', new: '待首轮回忆', missing: '待补释义', curation: '待补充整理' }[filters.scope];
  const context = filters.groups.length ? indexes.groups.filter(g => filters.groups.includes(g.id)).map(g => g.name).join(' / ') : filters.relations.length ? `同组排列 · ${filters.relations.map(r => relationshipLabels[r]).join(' / ')}` : `${scopeLabel} · ${filters.sort === 'az' ? 'A–Z' : filters.sort === 'za' ? 'Z–A' : '随机'}`;
  const detailWord = live.get(detail);
  return <section className="screen wall-screen" hidden={!active} aria-label="手机单词墙" style={{ '--columns': display.columns, '--card-height': `${display.height}px`, '--card-font': `${display.font}px` }}>
    <header className={`screen-header ${selecting ? 'selection-header' : ''}`}>
      {selecting ? <><button className="text-button" onClick={cancelSelection}>取消</button><h1>已选 {selectedWords.length} 词</h1><button className="icon-button" aria-label="多选更多操作" onClick={() => setSheet('more')}><Icon name="more"/></button></> : <><h1>词库</h1><div className="header-actions"><button onClick={() => setSheet('size')}>{display.columns} 列 <Icon name="down" size={14}/></button><button onClick={() => setSelecting(true)}>多选</button></div></>}
    </header>
    {!selecting && <div className="wall-toolbar" role="group" aria-label="词库搜索与筛选"><div className="wall-inline-search"><Icon name="search" size={18}/><input aria-label="搜索词库" type="search" autoCapitalize="none" autoComplete="off" placeholder="搜索单词" value={filters.query} onChange={e => changeQuery(e.target.value)}/>{filters.query && <button className="icon-button" aria-label="清空搜索" onClick={() => changeQuery('')}><Icon name="close" size={16}/></button>}</div><button aria-label="筛选" onClick={() => setSheet('filter')}><Icon name="filter"/>筛选{filterCount(filters) ? <span className="filter-count">{filterCount(filters)}</span> : null}</button><button onClick={() => setSheet('sort')}><Icon name="sort"/>排序</button></div>}
    {selecting && <div className="selection-tools"><button disabled={busy || !pageWords.length} onClick={selectPage}>选中本页 <small>{pageWords.length} 词</small></button><button disabled={busy || !unique.length} onClick={selectAll}>选全部结果 <small>{unique.length} 词</small></button></div>}
    <div className="wall-context"><span>{context}{filters.query ? ` · “${filters.query}”` : ''}{filterCount(filters) ? ` · ${filterCount(filters)} 项筛选` : ''}</span>{!selecting && <button className="icon-button" aria-label="词库更多操作" onClick={() => setSheet('more')}><Icon name="more" size={18}/></button>}</div>
    <main ref={scroll} className="screen-scroll wall-scroll" data-testid="word-wall-scroll" onScroll={e => { if (active) { viewRef.current = { ...viewRef.current, scrollTop: e.currentTarget.scrollTop }; queueViewSave(); } }}
      onPointerDownCapture={swipeDown} onPointerMoveCapture={swipeMove} onPointerUpCapture={swipeEnd} onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
      onClickCapture={e => { if (suppressClick.current) { suppressClick.current = false; e.preventDefault(); e.stopPropagation(); } }}>
      <div className="wall-page" key={`${currentPage}:${filters.query}`}>
      {sections.map(section => <section className="wall-section" key={section.id}>
        {section.group && <button className="group-heading" onClick={() => setGroup(section.group)}>词组 {String(section.number).padStart(2, '0')}<span>{relationshipLabels[section.group.type]}</span></button>}
        <div className="word-grid">{section.entries.map(entry => <WordTile key={entry.key} entry={entry} word={live.get(entry.word)} selected={selected.has(entry.word)} flipped={flipped.has(entry.word)} selecting={selecting} busy={busy} onFlip={flip} onSelect={select} onLongPress={longPress} onDetail={setDetail}/>)}</div>
      </section>)}
      </div>
      {!visible.length && <Empty><p>减少筛选条件，或导入你的词库。</p><button onClick={() => changeFilter({ ...emptyFilters })}>清除筛选</button></Empty>}
    </main>
    {!!present.length && <div className="wall-pager"><Pager page={currentPage} pages={pages} count={present.length} onChange={changePage}/></div>}
    {selecting && <div className="rating-bar" aria-label="批量记忆标记">{Object.entries(ratingLabels).map(([id, label]) => <button key={id} disabled={busy || !selectedReady} title={!selectedReady ? '所选词需先补齐释义' : undefined} className={`rating-${id}`} onClick={() => rate(id)}>{label}</button>)}</div>}
    {active && sheet === 'size' && <SizeSheet display={display} busy={busy} onChange={display => setView(previous => ({ ...previous, display, scrollTop: viewRef.current.scrollTop }))} onClose={() => setSheet(null)}/>}
    {active && sheet === 'filter' && <FilterSheet filters={filters} indexes={indexes} onApply={changeFilter} onClose={() => setSheet(null)}/>}
    {active && sheet === 'sort' && <SortSheet sort={filters.sort} onChange={sort => changeFilter({ ...filters, sort }, seed + 1)} onClose={() => setSheet(null)}/>}
    {active && sheet === 'more' && <Sheet title="词库操作" onClose={() => setSheet(null)}><div className="action-list">
      <button disabled={busy} onClick={saveCardReadings}>记录本轮卡片状态</button>
      {selecting && <button disabled={busy || !selectedWords.length} onClick={requestCuration}>补充整理</button>}
      {selecting && <button onClick={() => { setSelected(new Set()); setSheet(null); }}>清空选择</button>}
      {selectedWords.length === 1 && <button onClick={() => { setDetail(selectedWords[0]); setSheet(null); }}>查看所选词详情</button>}
      {selecting && <button disabled={busy || !selectedWords.length} onClick={() => { setDraftName(''); setGroupKind('topic'); setSheet('create-group'); }}>为当前多选单词分组</button>}
      {selecting ? <button disabled={busy || !selectedReady} title={!selectedReady ? '所选词需先补齐释义' : undefined} onClick={() => { setDraftName(new Date().toLocaleDateString('sv-SE')); setSheet('create-review'); }}>为当前选中单词设置复习轮</button> : <button disabled={busy || !ready.length} onClick={() => { setSheet(null); onStartReview(ready.map(word => live.get(word))); }}>背诵筛选词 · {ready.length} 词</button>}
      <button disabled={busy || !state.undoId} onClick={async () => { if (await mutate(() => repo.undoQuickReview(), '已撤销上次标记，次数和排期已恢复')) setSheet(null); }}>撤销上次标记</button>
    </div><p className="hint">本轮改标不重复计次。记录卡片状态成功后自动进入新一轮。</p></Sheet>}
    {active && ['create-group', 'create-review'].includes(sheet) && <Sheet title={sheet === 'create-group' ? '为当前多选单词分组' : '为当前选中单词设置复习轮'} onClose={() => { if (!busy) setSheet(null); }} footer={<button className="primary" disabled={busy || !draftName.trim()} onClick={createSelection}>{busy ? '保存中…' : '创建'}</button>}>
      <p className="hint">已选 {selectedWords.length} 词</p>
      {sheet === 'create-group' && <label className="field">分组归属<select value={groupKind} onChange={e => setGroupKind(e.target.value)}><option value="topic">语义主题</option><option value="relation">关系</option></select></label>}
      <label className="field">{sheet === 'create-group' ? '分组名称' : '复习轮名称'}<input autoFocus maxLength={80} value={draftName} onChange={e => setDraftName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy && !e.nativeEvent.isComposing) createSelection(); }}/></label>
    </Sheet>}
    {active && detailWord && <WordDetail key={detailWord.word} word={detailWord} state={state} busy={busy} onSave={payload => mutate(() => repo.saveEvent('vocab_upsert', payload), '词条已保存')} onRate={rate} onClose={() => setDetail(null)}/>}
    {active && group && <Sheet title="组内辨析" onClose={() => setGroup(null)}><h3>{group.title}</h3><p>{group.note}</p>{group.members.map(m => <div className="detail-relation" key={m.word}><strong className="english">{m.word}</strong><p>{m.usage || live.get(m.word)?.meaning || '待补释义'}</p>{m.example && <p>{m.example}</p>}</div>)}<p className="hint">关系适用于所列义项，不等于 SE 句子中一定等价。</p></Sheet>}
    {active && confirm && <Confirm title={confirm.title} action={confirm.action} busy={busy} onClose={() => setConfirm(null)} onConfirm={async () => { const task = confirm; setConfirm(null); await task.run(); }}>{confirm.text}</Confirm>}
  </section>;
}
