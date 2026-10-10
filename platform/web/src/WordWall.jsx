import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { save } from './api';
import { Modal, Empty } from './components';
import { CatalogPager } from './CatalogParts';
import { ratingLabels, relationshipLabels, wallDefaults, wallSettings, readPreference, writePreference, wordRating, wallEntries } from './word-wall-model.mjs';
import './word-wall.css';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const presets = { '舒适': { columns: 8, rows: 8, height: 96, font: 18 }, '紧凑': wallDefaults, '极密': { columns: 16, rows: 12, height: 52, font: 14 } };
function roundFor(day) {
  const cached = readPreference('word-wall-round', null);
  if (cached?.day === day && /^[0-9a-f-]{36}$/i.test(cached.id)) return cached;
  const next = { day, id: crypto.randomUUID() }; writePreference('word-wall-round', next); return next;
}
const WordTile = memo(function WordTile({ entry, word, flipped, selected, busy, layout, onFlip, onSelect, onRate, onDetail, onGroup, onEdit, onRemove }) {
  const rating = wordRating(word), ready = !word.deleted && !!word.meaning?.trim();
  return <article className={`wall-card ${layout === 'ordinary' ? 'wall-ordinary' : ''} ${flipped ? 'is-flipped' : ''} ${selected ? 'is-selected' : ''} rated-${rating} ${entry.groupStart ? 'group-start' : ''}`} data-word={word.word} data-group={entry.group?.id || ''}>
    <button className="wall-face" title={word.word} aria-label={`${word.word} · ${flipped ? '隐藏释义' : '翻看释义'}`} aria-pressed={flipped} onClick={() => onFlip(word.word)}>
      {layout === 'ordinary' || !flipped ? <strong lang="en">{word.word}</strong> : <span className="wall-meaning">{word.pos} {word.meaning || '待补释义'}</span>}
      {layout === 'ordinary' && <span className="wall-meaning">{word.pos} {word.meaning || '待补释义'}</span>}
    </button>
    <input className="wall-check" type="checkbox" aria-label={`选中 ${word.word}`} checked={selected} disabled={busy || !ready} onChange={() => onSelect(word.word)} />
    {rating !== 'unrated' && <span className="wall-rating-dot" role="img" aria-label={ratingLabels[rating]} title={ratingLabels[rating]} />}
    {entry.group && <button className="wall-group-handle" onClick={() => onGroup(entry.group)} aria-label={`查看第 ${entry.groupNumber} 组辨析`}>{entry.groupNumber}</button>}
    <div className="wall-card-actions">
      <button aria-label={`查看 ${word.word} 完整释义`} onClick={() => onDetail(word)}>详情</button>
      <button disabled={busy || !ready} aria-label={`标记 ${word.word}`} onClick={() => onRate(word.word)}>标记</button>
      {layout === 'ordinary' && <><button onClick={() => onEdit(word)}>编辑</button><button disabled={busy} onClick={() => onRemove(word)}>{word.deleted ? '恢复' : '移除'}</button></>}
    </div>
  </article>;
});

export default function WordWall({ words, state, indexes, scopeKey, layout, sort, request, refresh, notify, onDetail, onEdit, onRemove, startRecall }) {
  const [settings, setSettings] = useState(() => wallSettings(readPreference('word-wall-size', wallDefaults)));
  const [sizeOpen, setSizeOpen] = useState(false), [focus, setFocus] = useState(false);
  const [topic, setTopic] = useState(''), [source, setSource] = useState(''), [relation, setRelation] = useState(request?.relation || '');
  const [groupId, setGroupId] = useState(request?.groupId || ''), [ratings, setRatings] = useState([]), [letters, setLetters] = useState([]);
  const [selected, setSelected] = useState(new Set()), [flipped, setFlipped] = useState(new Set());
  const [page, setPage] = useState(0), [seed, setSeed] = useState(0), [revision, setRevision] = useState(0);
  const [single, setSingle] = useState(null), [group, setGroup] = useState(null), [confirmAll, setConfirmAll] = useState(false), [newRound, setNewRound] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pending, setPending] = useState(null);
  const [round, setRound] = useState(() => roundFor(state.spacedReview.today));
  const [undoIds, setUndoIds] = useState(() => {
    const stored = readPreference('word-wall-undo', []);
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string').slice(-100) : [];
  });
  const lock = useRef(false), grid = useRef(null);
  const [width, setWidth] = useState(1200);
  const live = useMemo(() => new Map(state.vocabulary.map(w => [w.word, w])), [state.vocabulary]);
  // Freeze the filtered result while marking; explicit filter changes or refresh
  // re-evaluate. Card definitions/deleted state/ratings still come from live state.
  const filterKey = JSON.stringify([scopeKey, topic, source, relation, groupId, ratings, letters, seed, revision]);
  const deferredKey = useDeferredValue(filterKey);
  const [snapshot, setSnapshot] = useState({ key: deferredKey, words });
  if (snapshot.key !== deferredKey) { setSnapshot({ key: deferredKey, words }); setSelected(new Set()); setPage(0); }
  const result = useMemo(() => {
    const list = snapshot.words.filter(w => (!topic || (topic === 'unclassified' ? !indexes.assignment.get(w.word)?.topics.length : indexes.assignment.get(w.word)?.topics.includes(topic)))
      && (!source || indexes.sourceKeys.get(w.word)?.has(source)) && (!ratings.length || ratings.includes(wordRating(w)))
      && (!letters.length || letters.includes(w.word[0].toUpperCase())));
    return wallEntries(list, state.relations?.groups || [], relation, groupId, sort === 'random', seed);
  }, [snapshot, topic, source, ratings, letters, relation, groupId, sort, seed, indexes.assignment, indexes.sourceKeys, state.relations]);
  const entries = result.filter(e => live.has(e.word) && !live.get(e.word).deleted);
  const unique = [...new Set(entries.map(e => e.word))];
  const ready = unique.filter(w => live.get(w)?.meaning?.trim());
  const activeSelected = ready.filter(w => selected.has(w));
  const columns = layout === 'ordinary' ? Math.max(1, Math.min(3, Math.floor(width / 300))) : Math.max(1, Math.min(settings.columns, Math.floor((width + 6) / (Math.max(96, settings.font * 6.5) + 6))));
  const size = layout === 'ordinary' ? 18 : columns * settings.rows;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(entries.length / size) - 1));
  const visible = entries.slice(currentPage * size, (currentPage + 1) * size);
  const undone = new Set(state.events.filter(e => e.kind === 'vocab_quick_undo').map(e => e.target_id));
  const undo = [...undoIds].reverse().find(id => state.events.some(e => e.id === id) && !undone.has(id));
  useEffect(() => { writePreference('word-wall-size', settings); }, [settings]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    if (grid.current) observer.observe(grid.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.toggle('word-wall-focus', focus);
    const escape = e => { if (e.key === 'Escape') setFocus(false); };
    document.addEventListener('keydown', escape);
    return () => { document.body.classList.remove('word-wall-focus'); document.removeEventListener('keydown', escape); };
  }, [focus]);
  function filterChange(fn) { fn(); setPage(0); setSelected(new Set()); }
  const toggleFlip = useCallback(word => setFlipped(prev => { const next = new Set(prev); next.has(word) ? next.delete(word) : next.add(word); return next; }), []);
  const toggleSelect = useCallback(word => setSelected(prev => { const next = new Set(prev); next.has(word) ? next.delete(word) : next.add(word); return next; }), []);
  function selectWords(list) { setSelected(new Set(list.filter(w => live.get(w)?.meaning?.trim() && !live.get(w)?.deleted))); }
  async function send(operation) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setPending(operation);
    try {
      await save(operation.kind, operation.payload, operation.id);
      if (operation.kind === 'vocab_quick_review') {
        setUndoIds(prev => { const next = [...new Set([...prev, operation.id])].slice(-100); writePreference('word-wall-undo', next); return next; });
      }
      setPending(null); setSingle(null); setSelected(new Set());
      try { await refresh(); } catch { setError('标记已保存，但页面刷新失败；请刷新页面，不必重复标记。'); }
      notify(operation.kind === 'vocab_quick_undo' ? '已撤销；复习次数和排期按有效记录恢复' : `已保存 ${operation.payload.items.length} 个词的自评`);
    } catch (e) { setError(`${e.message}。可重试同一操作，避免重复计次。`); }
    finally { lock.current = false; setBusy(false); }
  }
  function rate(value, names = activeSelected) {
    if (!names.length || busy || pending) return;
    const current = round.day === state.spacedReview.today ? round : roundFor(state.spacedReview.today);
    if (current !== round) setRound(current);
    return send({ id: crypto.randomUUID(), kind: 'vocab_quick_review', payload: { session_id: current.id, items: names.map(word => ({ word, self_rating: value })) } });
  }
  function startRound() {
    const next = { day: state.spacedReview.today, id: crypto.randomUUID() }; writePreference('word-wall-round', next); setRound(next);
    setRevision(n => n + 1); setSelected(new Set()); setFlipped(new Set()); setPage(0); setNewRound(false);
  }
  async function cancelRetry() {
    if (lock.current) return;
    setBusy(true);
    try { await refresh(); setPending(null); setError('已重新读取保存状态；停止重试不会删除服务器已保存的记录。'); }
    catch (e) { setError(`尚无法核对保存状态：${e.message}，请保留本页。`); }
    finally { setBusy(false); }
  }
  return <section className={`word-wall layout-${layout}`} aria-label="单词墙">
    <div className="wall-filters">
      <select aria-label="叠加主题筛选" value={topic} onChange={e => filterChange(() => setTopic(e.target.value))}><option value="">全部主题</option>{indexes.topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="unclassified">待分类</option></select>
      <select aria-label="叠加来源筛选" value={source} onChange={e => filterChange(() => setSource(e.target.value))}><option value="">全部来源</option>{indexes.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select aria-label="词墙关系类型" value={relation} onChange={e => filterChange(() => { setRelation(e.target.value); setGroupId(''); })}><option value="">全部词汇</option>{Object.entries(relationshipLabels).map(([key, name]) => <option key={key} value={key}>{name} · 同组相邻</option>)}</select>
      {groupId && <button onClick={() => filterChange(() => setGroupId(''))}>退出指定词组</button>}
      <div className="wall-rating-filters" aria-label="记忆状态筛选">{Object.entries({ unrated: '未标记', ...ratingLabels }).map(([id, label]) => <button key={id} aria-pressed={ratings.includes(id)} onClick={() => filterChange(() => setRatings(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))}>{label}</button>)}</div>
      <button onClick={() => filterChange(() => { setTopic(''); setSource(''); setRelation(''); setGroupId(''); setRatings([]); setLetters([]); })}>清除组合筛选</button>
    </div>
    <div className="wall-tools"><span>{unique.length} 词{entries.length !== unique.length ? ` · ${entries.length} 张（跨组重复）` : ''}</span>
      <button disabled={busy || !!pending || !ready.length} onClick={() => startRecall(ready.map(word => live.get(word)))}>背诵筛选词 · {ready.length}</button>
      <button onClick={() => setSizeOpen(v => !v)} aria-expanded={sizeOpen}>尺寸与排布</button>
      <button onClick={() => setFocus(v => !v)} aria-pressed={focus}>{focus ? '退出专注' : '专注模式'}</button>
      <button onClick={() => setFlipped(new Set())}>全部翻回英文</button>
      <button onClick={() => filterChange(() => { setSeed(n => n + 1); setRevision(n => n + 1); })}>刷新词表</button>
      <button disabled={busy || !!pending} onClick={() => setNewRound(true)}>开始新一轮</button>
    </div>
    {sizeOpen && <div className="wall-settings">{Object.entries(presets).map(([label, value]) => <button key={label} onClick={() => { setSettings(value); setPage(0); }}>{label}</button>)}
      {[["columns", "每行列数", 3, 18], ["rows", "每页行数", 3, 20], ["height", "卡片高度", 48, 140], ["font", "英文字号", 14, 24]].map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} value={settings[key]} onChange={e => { setSettings(prev => wallSettings({ ...prev, [key]: e.target.value })); setPage(0); }} /></label>)}
      <small>当前 {columns} 列 × {settings.rows} 行，每页最多 {columns * settings.rows} 张。窄窗口自动减少列数，保留可读字号。</small>
    </div>}
    <nav className="wall-letters" aria-label="字母筛选（可多选）"><button aria-pressed={!letters.length} onClick={() => filterChange(() => setLetters([]))}>全部</button>{alphabet.map(letter => <button key={letter} aria-pressed={letters.includes(letter)} onClick={() => filterChange(() => setLetters(prev => prev.includes(letter) ? prev.filter(x => x !== letter) : [...prev, letter]))}>{letter}</button>)}</nav>
    <div className="wall-selection"><button disabled={busy || !!pending} onClick={() => selectWords(visible.map(e => e.word))}>选中本页</button><button disabled={busy || !!pending || !ready.length} onClick={() => setConfirmAll(true)}>选中全部筛选结果 · {ready.length}</button><button onClick={() => setSelected(new Set())}>取消选择</button><small>点击正文翻面；勾选框独立选择。标记后保留位置，刷新词表应用新状态。</small></div>
    {error && <div className="error" role="alert">{error}{pending && <><button disabled={busy} onClick={() => send(pending)}>重试保存</button><button disabled={busy} onClick={cancelRetry}>核对状态并停止重试</button></>}</div>}
    <div ref={grid} className="wall-grid" style={{ '--wall-columns': columns, '--wall-height': `${settings.height}px`, '--wall-font': `${settings.font}px` }}>
      {visible.map(entry => <WordTile key={entry.key} entry={entry} word={live.get(entry.word)} layout={layout} flipped={flipped.has(entry.word)} selected={selected.has(entry.word)} busy={busy || !!pending} onFlip={toggleFlip} onSelect={toggleSelect} onRate={setSingle} onDetail={onDetail} onGroup={setGroup} onEdit={onEdit} onRemove={onRemove} />)}
    </div>
    {!entries.length && <Empty title="没有匹配的单词"><p>可以减少筛选条件；已有标记和记录不会丢失。</p></Empty>}
    <CatalogPager page={currentPage} count={entries.length} size={size} onChange={setPage} />
    <div className="wall-batchbar" aria-label="批量记忆标记"><strong>已选 {activeSelected.length} 词</strong>{Object.entries(ratingLabels).map(([id, label]) => <button key={id} className={`rating-${id}`} disabled={!activeSelected.length || busy || !!pending} onClick={() => rate(id)}>{label}</button>)}<button disabled={!undo || busy || !!pending} onClick={() => send({ id: crypto.randomUUID(), kind: 'vocab_quick_undo', payload: { target_id: undo } })}>撤销上次标记</button><small>{busy ? '正在保存…' : '自评影响排期，不等同已核验掌握'}</small></div>
    {single && <Modal title={`${single} · 记忆状态`} onClose={() => setSingle(null)}><p>按翻看前的回忆情况选择。同一轮内改标只修正结果，不增加次数。</p><div className="wall-single-actions">{Object.entries(ratingLabels).map(([id, label]) => <button key={id} disabled={busy || !!pending} onClick={() => rate(id, [single])}>{label}</button>)}</div>{error && <p role="alert">{error}{pending && <button disabled={busy} onClick={() => send(pending)}>重试保存</button>}</p>}</Modal>}
    {group && <Modal title="组内辨析" onClose={() => setGroup(null)}><h3>{group.title}</h3><p>{group.note}</p>{group.members.map(m => <p key={m.word}><strong>{m.word}</strong>　{m.usage}{m.example && <small>　{m.example}</small>}</p>)}<small>只适用于所列义项，不能据此直接判断 SE 整句等价。</small></Modal>}
    {confirmAll && <Modal title="选择全部筛选结果" onClose={() => setConfirmAll(false)}><p>将选中跨所有页面的 {ready.length} 个不同词；不是只选当前页。缺释义的词不会选中。</p><button className="primary" onClick={() => { selectWords(ready); setConfirmAll(false); }}>确认选择 {ready.length} 词</button></Modal>}
    {newRound && <Modal title="开始新一轮回忆" onClose={() => setNewRound(false)}><p>当前标记已经保存。新一轮中再次标记同一个词会计为一次新的回忆；同日记得不会连续提升间隔。</p><button className="primary" onClick={startRound}>开始新一轮</button></Modal>}
  </section>;
}
