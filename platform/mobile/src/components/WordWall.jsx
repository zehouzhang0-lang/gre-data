import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { emptyFilters, entrySections, filterCount, ratingLabels, relationshipLabels, wordRating } from '../model.mjs';
import { buildIndexes, filterEntries } from '../wall-search.mjs';
import { loadWallView, postponeWallPage, searchWall, wallFreshSwipe, wallPages, wallSwipe, wallViewKey } from '../wall-navigation.mjs';
import { useWallReading } from '../useWallReading';
import { wallHaptic } from '../wall-display.mjs';
import { play } from '../sound.mjs';
import { useBackAction } from '../useBack';
import { Confirm, Empty, Icon, Pager, Sheet } from './Primitives';
import { FilterSheet } from './WallSheets';
import WordTile, { WallMark } from './WordTile';
import WordDetail from './WordDetail';
import WallTrack from './WallTrack';
import '../wordwall-redesign.css';
import '../wall-candidate.css';

const memoryStates = ['forgotten', 'partial', 'remembered', 'unrated'];
const memoryLabel = rating => ratingLabels[rating] || '未标记';
const quickRatings = ['forgotten', 'partial', 'remembered'];
const quickActions = [...quickRatings, 'group', 'detail'];
const markSounds = { forgotten: 'markForgot', partial: 'markPartial', remembered: 'markClear' };
const actionLabel = action => action === 'group' ? '分组' : action === 'detail' ? '详情' : memoryLabel(action);

// The search box keeps its own text, so a keystroke shows at once. The wall is asked to
// catch up as a transition: React may drop a half-finished result when the next key
// arrives, so fast typing never waits for results nobody will see. While an input method
// is still composing (pinyin letters), nothing is searched at all.
function WallSearchInput({ value, onChange }) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false), sent = useRef([]);
  // The wall's query arrives a moment after it was typed. If it is one this box sent, it
  // is only an echo and the box already shows newer text; anything else (the clear
  // button, a restored view) is a change from outside and replaces what the box shows.
  useEffect(() => {
    const echo = sent.current.lastIndexOf(value);
    if (echo >= 0) { sent.current.splice(0, echo + 1); return; }
    sent.current = [];
    if (!composing.current) setDraft(value);
  }, [value]);
  const search = text => { sent.current.push(text); startTransition(() => onChange(text)); };
  return <input aria-label="搜索词库" type="search" autoCapitalize="none" autoComplete="off" placeholder="搜索单词" value={draft}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={e => { composing.current = false; setDraft(e.currentTarget.value); search(e.currentTarget.value); }}
    onChange={e => { setDraft(e.target.value); if (!composing.current && !e.nativeEvent.isComposing) search(e.target.value); }}/>;
}

export default function WordWall({ state, repo, busy, active, mutate, notify, onStartWords, appearance, onHintSeen }) {
  const [view, setView] = useState(() => loadWallView(globalThis.localStorage, state.datasetId, state.settings));
  const { filters, display, page, seed, freshPages } = view;
  const { look = 'pip', axis = 'x', haptics = false } = appearance || {};
  const font = appearance?.font ?? (display.font === 14.5 ? 15 : display.font);
  const grouped = !!(filters.relations.length || filters.groups.length);
  const [lastFresh, setLastFresh] = useState(null);
  const [wallAnnouncement, announceWall] = useState('');
  const [hold, setHold] = useState(null), [hoverAction, setHoverAction] = useState(null);
  const latestUndo = useRef(null), holdRef = useRef(null), track = useRef(null), wall = useRef(null);
  const [freshMotion, setFreshMotion] = useState(null);
  const [selected, setSelected] = useState(new Set()), [flipped, setFlipped] = useState(new Set());
  const [selecting, setSelecting] = useState(false), [sheet, setSheet] = useState(null), [confirm, setConfirm] = useState(null);
  const [detail, setDetail] = useState(null), [group, setGroup] = useState(null), [groupWord, setGroupWord] = useState(null);
  const [draftName, setDraftName] = useState(''), [groupKind, setGroupKind] = useState('topic');
  const scroll = useRef(null), viewRef = useRef(view), settingsTimer = useRef(null), gesture = useRef(null), suppressClick = useRef(false);
  const multiTouchGeneration = useRef(0);
  const lastView = useRef(view);
  if (lastView.current !== view) { viewRef.current = view; lastView.current = view; }
  const recordReading = useWallReading({ state, repo, busy, mutate, onSaved: () => setFlipped(new Set()) });
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
  // Words that are not in any round yet come first, so taking "20 now" from a large set walks through it over time.
  const reviewWords = useMemo(() => {
    const source = selecting ? selectedWords : ready;
    const inRound = new Set((state.reviewRounds || []).filter(r => !r.deleted).flatMap(r => r.words));
    return [...source.filter(word => !inRound.has(word)), ...source.filter(word => inRound.has(word))];
  }, [selecting, selectedWords, ready, state.reviewRounds]);
  // One tap from the wall starts the first ten words: no count, no name, no settings.
  async function startReview(words) {
    const single = filters.groups.length === 1 && !filters.query ? state.relations.groups.find(g => g.id === filters.groups[0])?.title : '';
    const name = (!selecting && (filters.query?.trim() || single)) || undefined;
    if (await onStartWords(words, name)) { setSheet(null); setSelecting(false); setSelected(new Set()); }
  }
  const cardPages = useMemo(() => wallPages(present, freshPages), [present, freshPages]);
  const pages = Math.max(1, cardPages.length), currentPage = Math.min(page, pages - 1);
  const visible = useMemo(() => cardPages[currentPage] || [], [cardPages, currentPage]);
  const pointerEnabled = active && !busy && !sheet && !detail && !group && !confirm;
  const gesturesEnabled = pointerEnabled && !selecting;
  const canFresh = (gesturesEnabled || (active && !busy && sheet === 'more')) && currentPage < pages - 1;
  const canUndoFresh = lastFresh && freshPages === lastFresh.after;
  const pageWords = useMemo(() => [...new Set(visible.map(entry => entry.word))], [visible]);
  const sections = useMemo(() => entrySections(visible), [visible]);
  const counts = useMemo(() => {
    const basis = filters.ratings.length ? filterEntries(state, { ...filters, ratings: [] }, seed, indexes) : present;
    const result = { remembered: 0, partial: 0, forgotten: 0, unrated: 0 };
    for (const word of new Set(basis.map(entry => entry.word))) {
      if (live.has(word)) result[wordRating(live.get(word))]++;
    }
    return result;
  }, [filters, present, live, seed, indexes, state]);
  const lastCounts = useRef(null);
  useLayoutEffect(() => {
    const before = lastCounts.current;
    lastCounts.current = { counts, filters };
    if (!active || before?.filters !== filters || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const rating of memoryStates) {
      if (counts[rating] <= before.counts[rating]) continue;
      wall.current?.querySelector(`.c-wall-count[data-rating="${rating}"] > span`)?.animate?.(
        [{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
    }
  }, [active, counts, filters]);
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
  useLayoutEffect(() => { if (active && scroll.current) scroll.current.scrollTop = viewRef.current.scrollTop; }, [active, filters, page, entries, freshPages]);
  const cancelSelection = useCallback(() => { setSelecting(false); setSelected(new Set()); }, []);
  useBackAction(cancelSelection, active && selecting, 60);
  const flip = useCallback(word => {
    const next = new Set(flipped);
    const wasFlipped = next.delete(word);
    if (!wasFlipped) { next.add(word); recordReading(word); }
    play(wasFlipped ? 'flipBack' : 'flip');
    setFlipped(next);
  }, [flipped, recordReading]);
  const select = useCallback(word => {
    play(selected.has(word) ? 'deselect' : 'select');
    setSelected(previous => {
      const next = new Set(previous);
      if (!next.delete(word)) next.add(word);
      return next;
    });
  }, [selected]);
  function changeFilter(next, nextSeed = seed) {
    const apply = () => {
      setView(previous => ({ ...previous, filters: next, seed: nextSeed, page: 0, scrollTop: 0, freshPages: null }));
      announceWall('');
      setSelected(new Set()); setSheet(null);
    };
    setSheet(null);
    if (selected.size) setConfirm({ title: '更换筛选条件', text: `将清空当前选中的 ${selected.size} 个词。已经保存的记忆标记不会改变。`, action: '清空选择并应用', run: apply });
    else apply();
  }
  function changePage(value) {
    const next = Math.max(0, Math.min(pages - 1, value));
    if (next === currentPage) return;
    play(next > currentPage ? 'pageNext' : 'pagePrev', next);
    wallHaptic(haptics);
    announceWall('');
    setView(previous => ({ ...previous, page: next, scrollTop: 0 }));
  }
  function changeQuery(query) {
    announceWall('');
    setView(previous => searchWall(previous, query, scroll.current?.scrollTop || 0));
  }
  const freshPage = useCallback(() => {
    if (!canFresh) { if (gesturesEnabled) { play('edge'); announceWall('已是最后一页'); } return; }
    const postponed = postponeWallPage(cardPages, currentPage);
    if (!postponed) return;
    setLastFresh({ before: freshPages, after: postponed.freshPages, page: currentPage, scrollTop: scroll.current?.scrollTop || 0 });
    latestUndo.current = 'fresh';
    play('fresh');
    wallHaptic(haptics);
    setFreshMotion({ pages: postponed.freshPages, page: currentPage, reverse: false });
    setView(previous => ({ ...previous, freshPages: postponed.freshPages, page: currentPage, scrollTop: 0 }));
    announceWall(`本页已后移 ${postponed.distance} 页`);
    if (sheet === 'more') { setSheet(null); cancelSelection(); }
  }, [canFresh, gesturesEnabled, cardPages, currentPage, freshPages, sheet, cancelSelection, haptics]);
  function undoFreshPage() {
    const action = lastFresh;
    if (!canUndoFresh || busy) return;
    setFreshMotion({ pages: action.before, page: action.page, reverse: true });
    setView(previous => ({ ...previous, freshPages: action.before, page: action.page, scrollTop: action.scrollTop }));
    setLastFresh(null);
    latestUndo.current = null;
    play('undo');
    announceWall('已撤销后移');
    if (sheet === 'more') setSheet(null);
  }
  useLayoutEffect(() => {
    if (!freshMotion || freshMotion.pages !== freshPages || freshMotion.page !== currentPage) return;
    setFreshMotion(null);
    if (!active || grouped || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const tiles = scroll.current?.querySelectorAll('.wall-track-pane[data-current] .word-tile') ?? [];
    for (const [index, tile] of [...tiles].entries()) {
      tile.animate?.([{ opacity: .55, transform: `translateY(${freshMotion.reverse ? -14 : 14}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 240, delay: Math.floor(index / 4) * 20, fill: 'backwards', easing: 'ease-out' });
    }
  }, [freshMotion, freshPages, currentPage, active, grouped]);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element || !grouped || !gesturesEnabled) return;
    let first = null;
    let candidate = null;
    const point = touch => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY });
    const onWall = touch => touch.target instanceof Element && element.contains(touch.target) &&
      touch.target.closest('.wall-page') && !touch.target.closest('button:not(.tile-face),input,select,textarea,a');
    function start(event) {
      const touches = Array.from(event.touches);
      const now = performance.now();
      if (touches.length === 1) {
        first = onWall(touches[0]) ? { ...point(touches[0]), time: now } : null;
        return;
      }
      candidate = null;
      const startingTouch = touches.find(touch => touch.identifier === first?.id);
      const startedTogether = !first && event.changedTouches.length === 2;
      const joinedFirst = first && startingTouch && now - first.time <= 180 &&
        Math.hypot(startingTouch.clientX - first.x, startingTouch.clientY - first.y) <= 12;
      if (touches.length === 2 && (startedTogether || joinedFirst) && touches.every(onWall) && event.cancelable) {
        // Consume the second touch before the WebView starts native vertical scrolling.
        event.preventDefault();
        gesture.current = null;
        suppressClick.current = true;
        multiTouchGeneration.current++;
        candidate = { points: touches.map(point), time: now };
      }
      first = null;
    }
    function move(event) {
      if (!candidate) return;
      if (event.touches.length !== 2 || !event.cancelable) { candidate = null; return; }
      event.preventDefault();
    }
    function end(event) {
      if (!candidate) { first = null; return; }
      const start = candidate;
      candidate = null;
      if (event.cancelable) event.preventDefault();
      const endPoints = Array.from(event.touches).concat(Array.from(event.changedTouches)).map(point);
      const duration = performance.now() - start.time;
      if (window.getSelection()?.toString()) return;
      if (wallFreshSwipe(start.points, endPoints, duration)) freshPage();
      else if (wallFreshSwipe(endPoints, start.points, duration)) undoLatest();
    }
    function cancel() { first = null; candidate = null; }
    const options = { capture: true, passive: false };
    element.addEventListener('touchstart', start, options);
    element.addEventListener('touchmove', move, options);
    element.addEventListener('touchend', end, options);
    element.addEventListener('touchcancel', cancel, options);
    return () => {
      element.removeEventListener('touchstart', start, options);
      element.removeEventListener('touchmove', move, options);
      element.removeEventListener('touchend', end, options);
      element.removeEventListener('touchcancel', cancel, options);
    };
  });
  function swipeDown(event) {
    if (event.isPrimary === false) {
      if (event.pointerType === 'touch') {
        gesture.current = null;
        suppressClick.current = true;
        multiTouchGeneration.current++;
      }
      return;
    }
    suppressClick.current = false;
    if (selecting || busy || sheet || event.target.closest('button:not(.tile-face),input,select,textarea,a')) { gesture.current = null; return; }
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
  async function createGroup() {
    const words = groupWord ? [groupWord] : selectedWords;
    if (!draftName.trim() || !words.length) return;
    if (await mutate(() => repo.createWordGroup({ words, kind: groupKind, name: draftName.trim() }), `已创建${groupKind === 'topic' ? '语义主题' : '关系'}“${draftName.trim()}”`)) {
      play('markPartial');
      setSheet(null);
    } else play('error');
  }
  async function rate(rating, words) {
    if (busy || !words.length) return;
    if (words.some(word => !live.get(word)?.meaning?.trim())) {
      play('error');
      notify('请先补齐释义，再标记', true);
      return;
    }
    if (!await mutate(() => repo.rate(words, rating))) { play('error'); return; }
    latestUndo.current = 'mark';
    play(markSounds[rating]);
    wallHaptic(haptics);
    setFlipped(previous => {
      const next = new Set(previous);
      for (const word of words) next.delete(word);
      return next;
    });
    const completed = pageWords.length === 28 && pageWords.every(word => words.includes(word) || wordRating(live.get(word)) !== 'unrated');
    if (completed && pageWords.some(word => wordRating(live.get(word)) === 'unrated')) play('pageDone', undefined, { at: 0.36 });
    announceWall(completed ? '这一页都标过了' : `已标记 ${words.length} 词`);
    cancelSelection(); setDetail(null);
  }
  async function undoRating() {
    if (busy || !state.undoId) return;
    if (await mutate(() => repo.undoQuickReview())) {
      latestUndo.current = canUndoFresh ? 'fresh' : null;
      play('undo');
      announceWall('已撤销上次标记');
      if (sheet === 'more') setSheet(null);
    } else play('error');
  }
  function undoLatest() {
    if (latestUndo.current === 'mark' && state.undoId) return undoRating();
    if (canUndoFresh) return undoFreshPage();
    if (state.undoId) return undoRating();
    announceWall('没有可撤销的操作');
  }
  function openGroup(word = null) {
    setGroupWord(word); setDraftName(''); setGroupKind('topic'); setSheet('create-group');
  }
  function cancelHold() {
    holdRef.current = null; setHold(null); setHoverAction(null);
  }
  function startHold(word, tile) {
    if (!pointerEnabled || !live.has(word) || (selecting && !selected.has(word))) return;
    wallHaptic(haptics);
    play('holdOpen');
    const bounds = wall.current.getBoundingClientRect();
    const width = Math.min(selecting ? 192 : 310, bounds.width - 16);
    const left = Math.max(bounds.left + 8, Math.min(bounds.right - 8 - width, tile.left + (tile.width - width) / 2));
    const top = tile.top >= 62 ? tile.top - 56 : tile.bottom + 4;
    const next = { word, width, left, top, words: selecting ? selectedWords : [word], hovered: null };
    holdRef.current = next;
    setHold(next);
  }
  function actionAt(x, y) { return document.elementFromPoint(x, y)?.closest('[data-wall-quick-action]')?.dataset.wallQuickAction; }
  function hoverHold(x, y) {
    const current = holdRef.current;
    if (!current) return;
    const action = actionAt(x, y) || null;
    if (current.hovered === action) return;
    current.hovered = action;
    setHoverAction(action);
    if (action) play('holdHover');
  }
  function chooseHoldAction(action, current) {
    cancelHold();
    if (action === 'group') openGroup(current.word);
    else if (action === 'detail') setDetail(current.word);
    else return rate(action, current.words);
  }
  function endHold(x, y) {
    const current = holdRef.current;
    if (!current) return;
    const action = actionAt(x, y);
    if (action) return chooseHoldAction(action, current);
    cancelHold();
  }
  useBackAction(cancelHold, active && !!hold, 90);
  useEffect(() => { if (!pointerEnabled && holdRef.current) cancelHold(); }, [pointerEnabled]);
  function selectPage() {
    if (pageWords.some(word => !selected.has(word))) play('select');
    setSelected(previous => new Set([...previous, ...pageWords]));
  }
  function selectAll() {
    setConfirm({ title: '选中全部筛选结果', text: `将选中所有页面的 ${unique.length} 个不同单词，不只是本页。跨组重复词只选中一次。`, action: `确认选择 ${unique.length} 词`, run: () => { play('select'); setSelected(new Set(unique)); } });
  }
  async function requestCuration() {
    if (!selectedWords.length) return;
    let added = 0;
    if (await mutate(async () => { added = (await repo.requestCuration(selectedWords)).added; })) {
      notify(added ? `已标为待整理 · ${added} 词` : '所选单词已在待整理中');
      setSheet(null); cancelSelection();
    }
  }
  const scopeLabel = { all: '全部单词', due: '今日待复习', new: '待首轮回忆', missing: '待补释义', curation: '待补充整理' }[filters.scope];
  const context = filters.groups.length ? indexes.groups.filter(g => filters.groups.includes(g.id)).map(g => g.name).join(' / ') : filters.relations.length ? `同组排列 · ${filters.relations.map(r => relationshipLabels[r]).join(' / ')}` : `${scopeLabel} · ${filters.sort === 'az' ? 'A–Z' : filters.sort === 'za' ? 'Z–A' : '随机'}`;
  const detailWord = live.get(detail);
  const renderTile = (entry, preview = false) => <WordTile key={entry.key} entry={entry} word={live.get(entry.word)}
    selected={selected.has(entry.word)} flipped={flipped.has(entry.word)} selecting={selecting} busy={busy}
    multiTouchGeneration={multiTouchGeneration} onFlip={flip} onSelect={select} onDetail={setDetail}
    maxFont={font} look={look} managedGestures={!grouped} preview={preview} held={hold?.word === entry.word}/>;
  function stepPage(direction) {
    if (grouped) changePage(currentPage + direction);
    else track.current?.turn(direction);
  }
  const clearFilters = () => changeFilter({ ...emptyFilters });
  return <section ref={wall} className="screen wall-screen candidate-wall" data-look={look} hidden={!active} aria-label="手机单词墙"
    style={{ '--columns': display.columns, '--card-height': `${display.height}px`, '--card-font': `${font}px` }}>
    <header className="c-wall-toolbar" role="group" aria-label={selecting ? '多选' : '词库搜索与多选'}>
      {selecting ? <>
        <button className="text-button" onClick={cancelSelection}>取消</button>
        <strong className="c-wall-selection">已选 {selectedWords.length} 词</strong>
        <button className="text-button" disabled={busy || !pageWords.length} onClick={selectPage}>全选本页</button>
      </> : <>
        <div className="wall-inline-search"><Icon name="search" size={18}/><WallSearchInput value={filters.query} onChange={changeQuery}/>
          {filters.query && <button className="icon-button" aria-label="清空搜索" onClick={() => changeQuery('')}><Icon name="close" size={16}/></button>}
        </div>
        <button className="text-button" onClick={() => setSelecting(true)}>多选</button>
      </>}
      <button className="icon-button" aria-label={selecting ? '多选更多操作' : '词库更多操作'} onClick={() => setSheet('more')}><Icon name="more" size={18}/></button>
    </header>
    <div className="c-wall-summary">
      <div className="c-wall-counts" role="group" aria-label="按记忆状态筛选">
        {memoryStates.map(rating => <button key={rating} className="c-wall-count" data-rating={rating} type="button" disabled={busy || selecting}
          aria-pressed={filters.ratings.includes(rating)} aria-label={`${memoryLabel(rating)}，${counts[rating]} 词`}
          onClick={() => changeFilter({ ...filters, ratings: filters.ratings.length === 1 && filters.ratings[0] === rating ? [] : [rating] })}>
          <WallMark rating={rating} swatch={look === 'fill'}/><span>{counts[rating]}</span>
        </button>)}
      </div>
      <span className="c-wall-total" title={context}>{unique.length} 词</span>
      <button className="c-wall-filters text-button" aria-label="筛选" disabled={busy || selecting} onClick={() => setSheet('filter')}>筛选{filterCount(filters) ? <span>{filterCount(filters)}</span> : null}</button>
    </div>
    {!appearance?.hinted && <div className="c-wall-tip">
      <span>轻点翻面，滑动翻页，长按标记。更多手势见设置 → 帮助。</span>
      <button type="button" className="text-button" onClick={onHintSeen}>知道了</button>
    </div>}
    <main ref={scroll} className={`screen-scroll wall-scroll ${grouped ? 'c-wall-grouped' : 'c-wall-plain'}`} data-testid="word-wall-scroll"
      onScroll={e => { if (active) { viewRef.current = { ...viewRef.current, scrollTop: e.currentTarget.scrollTop }; queueViewSave(); } }}
      onPointerDownCapture={grouped ? swipeDown : undefined} onPointerMoveCapture={grouped ? swipeMove : undefined} onPointerUpCapture={grouped ? swipeEnd : undefined}
      onPointerCancel={grouped ? () => { gesture.current = null; suppressClick.current = true; } : undefined}
      onClickCapture={grouped ? e => { if (suppressClick.current && e.detail > 0) { e.preventDefault(); e.stopPropagation(); } } : undefined}>
      {grouped ? <div className="wall-page" key={`${currentPage}:group:${freshPages?.[currentPage]?.[0] || ''}`}>
        {sections.map(section => <section className="wall-section" key={section.id}>
          {section.group && <button className="group-heading" onClick={() => setGroup(section.group)}>词组 {String(section.number).padStart(2, '0')}<span>{relationshipLabels[section.group.type]}</span></button>}
          <div className="word-grid">{section.entries.map(entry => renderTile(entry))}</div>
        </section>)}
      </div> : visible.length > 0 && <WallTrack ref={track} pages={cardPages} page={currentPage} axis={axis} active={active} enabled={pointerEnabled} paging={!selecting}
        motionKey={cardPages} onPageChange={changePage} onFresh={freshPage} onUndo={undoLatest}
        onHoldStart={startHold} onHoldMove={hoverHold} onHoldEnd={endHold} onHoldCancel={cancelHold}
        onEdge={direction => { play('edge'); announceWall(direction < 0 ? '已是第一页' : '已是最后一页'); }}
        renderPage={(pageEntries, _index, isCurrent) => <div className="word-grid c-wall-grid">{pageEntries.map(entry => renderTile(entry, !isCurrent))}</div>}/>}
      {!visible.length && <Empty><p>减少筛选条件，或导入你的词库。</p><button onClick={clearFilters}>清除筛选</button></Empty>}
    </main>
    {grouped && !!present.length && <div className="wall-pager"><Pager page={currentPage} pages={pages} count={present.length} onChange={changePage}/></div>}
    {!grouped && <div className="c-wall-footer">
      <nav className="c-wall-page-counter" aria-label="单词分页">
        <button className="c-wall-key-page" disabled={!currentPage || selecting || busy} onClick={() => stepPage(-1)}>上一页</button>
        <span aria-live="polite">{visible.length ? currentPage + 1 : 0} / {visible.length ? pages : 0}</span>
        <button className="c-wall-key-page" disabled={currentPage >= pages - 1 || selecting || busy} onClick={() => stepPage(1)}>下一页</button>
      </nav>
    </div>}
    <div className="sr-only" role="status">{wallAnnouncement}</div>
    {active && hold && <div className="c-wall-quick wall-hold-strip" aria-label={selecting ? `标记所选 ${hold.words.length} 词` : `标记 ${hold.word}`} style={{ left: hold.left, top: hold.top, width: hold.width }}>
      {(selecting ? quickRatings : quickActions).map(action => <button key={action} type="button" data-wall-quick-action={action} data-hovered={hoverAction === action || undefined}
        aria-label={actionLabel(action)} onClick={() => chooseHoldAction(action, hold)}>
        {action === 'group' || action === 'detail' ? actionLabel(action) : <WallMark rating={action} swatch={look === 'fill'}/>}
      </button>)}
    </div>}
    {active && sheet === 'filter' && <FilterSheet filters={filters} indexes={indexes}
      onApply={(draft, options) => changeFilter(draft, draft.sort === 'random' && (filters.sort !== 'random' || options?.reshuffle) ? seed + 1 : seed)} onClose={() => setSheet(null)}/>}
    {active && sheet === 'more' && <Sheet title="词库操作" onClose={() => setSheet(null)}><div className="action-list">
      {!selecting && <button disabled={!canFresh} onClick={freshPage}>Fresh 本页</button>}
      <button disabled={busy || (selecting ? !selectedReady : !ready.length)}
        title={selecting && selectedWords.length > 0 && !selectedReady ? '所选词需先补齐释义' : undefined}
        onClick={() => startReview(reviewWords)}>{selecting ? '背所选词' : '背这些词'} · {selecting ? selectedWords.length : ready.length} 词</button>
      {selecting ? <>
        <button disabled={busy || !selectedWords.length} onClick={() => openGroup()}>分组</button>
        <button disabled={busy || !selectedWords.length} onClick={requestCuration}>标为待整理</button>
        <button disabled={busy || !unique.length} onClick={() => { setSheet(null); selectAll(); }}>选全部结果 · {unique.length} 词</button>
      </> : (canUndoFresh || state.undoId) && <button disabled={busy} onClick={undoLatest}>撤销</button>}
    </div></Sheet>}
    {active && sheet === 'create-group' && <Sheet title="分组" onClose={() => { if (!busy) setSheet(null); }} footer={<button className="primary" disabled={busy || !draftName.trim()} onClick={createGroup}>{busy ? '保存中…' : '创建'}</button>}>
      <p className="hint">{groupWord || `已选 ${selectedWords.length} 词`}</p>
      <label className="field">分组归属<select value={groupKind} onChange={e => setGroupKind(e.target.value)}><option value="topic">语义主题</option><option value="relation">关系</option></select></label>
      <label className="field">分组名称<input autoFocus maxLength={80} value={draftName} onChange={e => setDraftName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy && !e.nativeEvent.isComposing) createGroup(); }}/></label>
    </Sheet>}
    {active && detailWord && <WordDetail key={detailWord.word} word={detailWord} state={state} busy={busy} onSave={payload => mutate(() => repo.saveEvent('vocab_upsert', payload), '词条已保存')} onRate={rate} onClose={() => setDetail(null)}/>}
    {active && group && <Sheet title="组内辨析" onClose={() => setGroup(null)}><h3>{group.title}</h3><p>{group.note}</p>{group.members.map(m => <div className="detail-relation" key={m.word}><strong className="english">{m.word}</strong><p>{m.usage || live.get(m.word)?.meaning || '待补释义'}</p>{m.example && <p>{m.example}</p>}</div>)}<p className="hint">关系适用于所列义项，不等于 SE 句子中一定等价。</p></Sheet>}
    {active && confirm && <Confirm title={confirm.title} action={confirm.action} busy={busy} onClose={() => setConfirm(null)} onConfirm={async () => { const task = confirm; setConfirm(null); await task.run(); }}>{confirm.text}</Confirm>}
  </section>;
}
