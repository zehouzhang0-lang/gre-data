import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildIndexes, defaultDisplay, displaySettings, emptyFilters, entrySections, filterCount, filterEntries, normalizeFilters, PAGE_SIZE, ratingLabels, relationshipLabels, wordRating } from '../model.mjs';
import { createCardReadingDraft } from '../card-reading-draft.mjs';
import { useBackAction } from '../useBack';
import { Confirm, Empty, Icon, Pager, Sheet } from './Primitives';
import { FilterSheet, SearchSheet, SizeSheet, SortSheet } from './WallSheets';
import WordTile from './WordTile';
import WordDetail from './WordDetail';

export default function WordWall({ state, repo, busy, active, mutate, notify, onSelectionMode, onStartReview }) {
  const [filters, setFilters] = useState(() => normalizeFilters(state.settings?.wallFilters));
  const [display, setDisplay] = useState(() => displaySettings(state.settings?.display || defaultDisplay));
  const [page, setPage] = useState(() => Math.max(0, Number(state.settings?.wallPage) || 0));
  const [seed, setSeed] = useState(0);
  const [entries, setEntries] = useState(() => filterEntries(state, filters));
  const [selected, setSelected] = useState(new Set()), [flipped, setFlipped] = useState(new Set());
  const [selecting, setSelecting] = useState(false), [sheet, setSheet] = useState(null), [confirm, setConfirm] = useState(null);
  const [detail, setDetail] = useState(null), [group, setGroup] = useState(null);
  const scroll = useRef(null), settingsReady = useRef(false), settingsTimer = useRef(null);
  const readingDraft = useRef(null);
  if (!readingDraft.current) readingDraft.current = createCardReadingDraft();
  const live = useMemo(() => new Map(state.vocabulary.filter(w => !w.deleted).map(w => [w.word, w])), [state.vocabulary]);
  const indexes = useMemo(() => buildIndexes(state), [state]);
  const present = entries.filter(e => live.has(e.word));
  const unique = [...new Set(present.map(e => e.word))], ready = unique.filter(word => live.get(word)?.meaning?.trim());
  const selectedWords = ready.filter(word => selected.has(word));
  const pages = Math.max(1, Math.ceil(present.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1);
  const visible = present.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const pageReady = [...new Set(visible.map(entry => entry.word))].filter(word => live.get(word)?.meaning?.trim());
  const sections = entrySections(visible);
  useEffect(() => { onSelectionMode(selecting && active); return () => onSelectionMode(false); }, [selecting, active, onSelectionMode]);
  useEffect(() => {
    if (!settingsReady.current) { settingsReady.current = true; return; }
    settingsTimer.current = setTimeout(() => repo.setSettings({ display, wallFilters: filters, wallPage: page }).catch(e => notify(`显示设置未能保存：${e.message}`, true)), 300);
    return () => clearTimeout(settingsTimer.current);
  }, [display, filters, page, repo, notify]);
  const cancelSelection = useCallback(() => { setSelecting(false); setSelected(new Set()); }, []);
  useBackAction(cancelSelection, active && selecting, 60);
  const flip = useCallback(word => {
    const next = new Set(flipped);
    if (next.has(word)) next.delete(word);
    else { next.add(word); readingDraft.current.record(word, new Date().toISOString()); }
    setFlipped(next);
  }, [flipped]);
  const select = useCallback(word => {
    if (!live.get(word)?.meaning?.trim()) { notify('这个词待补释义，请先在详情中补充。'); return; }
    setSelected(previous => { const next = new Set(previous); next.has(word) ? next.delete(word) : next.add(word); return next; });
  }, [live, notify]);
  const longPress = useCallback(word => {
    if (!live.get(word)?.meaning?.trim()) { setDetail(word); return; }
    setSelecting(true); setSelected(previous => new Set([...previous, word]));
  }, [live]);
  function changeFilter(next, nextSeed = seed) {
    const apply = async () => {
      clearTimeout(settingsTimer.current);
      if (!await mutate(() => repo.setSettings({ display, wallFilters: next, wallPage: 0 }))) return;
      setFilters(next); setSeed(nextSeed); setEntries(filterEntries(state, next, nextSeed));
      setPage(0); setSelected(new Set()); setFlipped(new Set()); setSheet(null);
      scroll.current?.scrollTo({ top: 0 });
    };
    setSheet(null);
    if (selected.size) setConfirm({ title: '更换筛选条件', text: `将清空当前选中的 ${selected.size} 个词。已经保存的记忆标记不会改变。`, action: '清空选择并应用', run: apply });
    else apply();
  }
  async function commitDisplay() {
    clearTimeout(settingsTimer.current);
    if (await mutate(() => repo.setSettings({ display, wallFilters: filters, wallPage: page }))) setSheet(null);
  }
  async function rate(rating, words = selectedWords) {
    if (!words.length) return;
    if (await mutate(() => repo.rate(words, rating), `已标记 ${words.length} 词 · ${ratingLabels[rating]}`)) {
      cancelSelection(); setDetail(null);
    }
  }
  async function saveCardReadings() {
    const prepare = () => readingDraft.current.prepare(word => {
      const rating = wordRating(live.get(word));
      return rating === 'unrated' ? null : rating;
    }, word => live.has(word));
    let batch = prepare();
    if (!batch) { notify('没有新的翻阅记录；已有印象标记已保存'); setSheet(null); return; }
    const savedWords = new Set();
    while (batch) {
      const currentBatch = batch;
      if (!await mutate(() => repo.saveEvent('vocab_card_reading', currentBatch.payload, currentBatch.id))) return;
      currentBatch.payload.items.forEach(item => savedWords.add(item.word));
      readingDraft.current.commit();
      batch = prepare();
    }
    notify(`已记录 ${savedWords.size} 个词的翻阅状态`);
    setSheet(null);
  }
  function selectPage() {
    setSelected(previous => new Set([...previous, ...visible.map(e => e.word).filter(word => live.get(word)?.meaning?.trim())]));
  }
  function selectAll() {
    setConfirm({ title: '选中全部筛选结果', text: `将选中所有页面的 ${ready.length} 个不同单词，不只是本页。跨组重复词只标记一次；待补释义的词不选中。`, action: `确认选择 ${ready.length} 词`, run: () => setSelected(new Set(ready)) });
  }
  function startRound() {
    setSheet(null);
    setConfirm({ title: '开始新一轮', text: '当前标记已经保存。新一轮再次标记同一词会记录新的回忆；同日记得不会连续提升间隔。', action: '开始新一轮', run: async () => {
      if (await mutate(() => repo.startQuickRound(), '新一轮已开始')) { setSelected(new Set()); setFlipped(new Set()); setEntries(filterEntries(state, filters, seed)); }
    } });
  }
  const scopeLabel = { all: '全部单词', due: '今日待复习', new: '待首轮回忆', missing: '待补释义' }[filters.scope];
  const context = filters.relations.length ? `同组排列 · ${filters.relations.map(r => relationshipLabels[r]).join(' / ')}` : `${scopeLabel} · ${filters.sort === 'az' ? 'A–Z' : filters.sort === 'za' ? 'Z–A' : '随机'}`;
  const detailWord = live.get(detail);
  return <section className="screen wall-screen" hidden={!active} aria-label="手机单词墙" style={{ '--columns': display.columns, '--card-height': `${display.height}px`, '--card-font': `${display.font}px` }}>
    <header className={`screen-header ${selecting ? 'selection-header' : ''}`}>
      {selecting ? <><button className="text-button" onClick={cancelSelection}>取消</button><h1>已选 {selectedWords.length} 词</h1><button className="icon-button" aria-label="多选更多操作" onClick={() => setSheet('more')}><Icon name="more"/></button></> : <><h1>词库</h1><div className="header-actions"><button onClick={() => setSheet('size')}>{display.columns} 列 <Icon name="down" size={14}/></button><button onClick={() => setSelecting(true)}>多选</button></div></>}
    </header>
    {!selecting && <div className="wall-toolbar" role="group" aria-label="词库搜索与筛选"><button className="wall-search" onClick={() => setSheet('search')}><Icon name="search"/><span>{filters.query || '搜索单词'}</span></button><button aria-label="筛选" onClick={() => setSheet('filter')}><Icon name="filter"/>筛选{filterCount(filters) ? <span className="filter-count">{filterCount(filters)}</span> : null}</button><button onClick={() => setSheet('sort')}><Icon name="sort"/>排序</button></div>}
    {selecting && <div className="selection-tools"><button disabled={busy || !pageReady.length} onClick={selectPage}>选中本页 <small>{pageReady.length} 词</small></button><button disabled={busy || !ready.length} onClick={selectAll}>选全部结果 <small>{ready.length} 词</small></button></div>}
    <div className="wall-context"><span>{context}{filters.query ? ` · “${filters.query}”` : ''}{filterCount(filters) ? ` · ${filterCount(filters)} 项筛选` : ''}</span>{!selecting && <button className="icon-button" aria-label="词库更多操作" onClick={() => setSheet('more')}><Icon name="more" size={18}/></button>}</div>
    <main ref={scroll} className="screen-scroll wall-scroll" data-testid="word-wall-scroll">
      {sections.map(section => <section className="wall-section" key={section.id}>
        {section.group && <button className="group-heading" onClick={() => setGroup(section.group)}>词组 {String(section.number).padStart(2, '0')}<span>{relationshipLabels[section.group.type]}</span></button>}
        <div className="word-grid">{section.entries.map(entry => <WordTile key={entry.key} entry={entry} word={live.get(entry.word)} selected={selected.has(entry.word)} flipped={flipped.has(entry.word)} selecting={selecting} busy={busy} onFlip={flip} onSelect={select} onLongPress={longPress} onDetail={setDetail}/>)}</div>
      </section>)}
      {!visible.length && <Empty><p>减少筛选条件，或导入你的词库。</p><button onClick={() => changeFilter({ ...emptyFilters })}>清除筛选</button></Empty>}
      {!!present.length && <Pager page={currentPage} pages={pages} count={present.length} onChange={async value => { clearTimeout(settingsTimer.current); if (await mutate(() => repo.setSettings({ display, wallFilters: filters, wallPage: value }))) { setPage(value); scroll.current?.scrollTo({ top: 0 }); } }}/>}
    </main>
    {selecting && <div className="rating-bar" aria-label="批量记忆标记">{Object.entries(ratingLabels).map(([id, label]) => <button key={id} disabled={busy || !selectedWords.length} className={`rating-${id}`} onClick={() => rate(id)}>{label}</button>)}</div>}
    {active && sheet === 'size' && <SizeSheet display={display} busy={busy} onChange={setDisplay} onClose={commitDisplay}/>}
    {active && sheet === 'filter' && <FilterSheet filters={filters} indexes={indexes} onApply={changeFilter} onClose={() => setSheet(null)}/>}
    {active && sheet === 'search' && <SearchSheet query={filters.query} onApply={query => changeFilter({ ...filters, query })} onClose={() => setSheet(null)}/>}
    {active && sheet === 'sort' && <SortSheet sort={filters.sort} onChange={sort => changeFilter({ ...filters, sort }, seed + 1)} onClose={() => setSheet(null)}/>}
    {active && sheet === 'more' && <Sheet title="词库操作" onClose={() => setSheet(null)}><div className="action-list">
      <button onClick={() => { setFlipped(new Set()); setSheet(null); }}>全部翻回英文</button>
      <button onClick={() => changeFilter(filters, seed + 1)}>刷新当前词表</button>
      <button disabled={busy} onClick={saveCardReadings}>记录本轮卡片状态</button>
      {selecting && <button onClick={() => { setSelected(new Set()); setSheet(null); }}>清空选择</button>}
      {selectedWords.length === 1 && <button onClick={() => { setDetail(selectedWords[0]); setSheet(null); }}>查看所选词详情</button>}
      {selecting ? <button disabled={busy || !selectedWords.length} onClick={() => { const words = selectedWords.map(word => live.get(word)); setSheet(null); cancelSelection(); onStartReview(words, { initialCount: words.length }); }}>背诵当前多选单词 · {selectedWords.length} 词</button> : <button disabled={busy || !ready.length} onClick={() => { setSheet(null); onStartReview(ready.map(word => live.get(word))); }}>背诵筛选词 · {ready.length} 词</button>}
      <button disabled={busy || !state.undoId} onClick={async () => { if (await mutate(() => repo.undoQuickReview(), '已撤销上次标记，次数和排期已恢复')) setSheet(null); }}>撤销上次标记</button>
      <button disabled={busy} onClick={startRound}>开始新一轮</button>
    </div><p className="hint">本轮改标只更正结果，不重复计次。标记后卡片保留原位置；主动刷新才重新筛选。</p></Sheet>}
    {active && detailWord && <WordDetail key={detailWord.word} word={detailWord} state={state} busy={busy} onSave={payload => mutate(() => repo.saveEvent('vocab_upsert', payload), '词条已保存')} onRate={rate} onClose={() => setDetail(null)}/>}
    {active && group && <Sheet title="组内辨析" onClose={() => setGroup(null)}><h3>{group.title}</h3><p>{group.note}</p>{group.members.map(m => <div className="detail-relation" key={m.word}><strong className="english">{m.word}</strong><p>{m.usage || live.get(m.word)?.meaning || '待补释义'}</p>{m.example && <p>{m.example}</p>}</div>)}<p className="hint">关系适用于所列义项，不等于 SE 句子中一定等价。</p></Sheet>}
    {active && confirm && <Confirm title={confirm.title} action={confirm.action} busy={busy} onClose={() => setConfirm(null)} onConfirm={async () => { const task = confirm; setConfirm(null); await task.run(); }}>{confirm.text}</Confirm>}
  </section>;
}
