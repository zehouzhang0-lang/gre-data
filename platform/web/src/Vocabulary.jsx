import { useDeferredValue, useMemo, useState } from "react";
import { Header, Icon, Field, Modal, Empty } from "./components";
import { save } from "./api";
import { CatalogSearch, CatalogPager, CollectionCard, materialLabel, sourceLabel } from "./CatalogParts";

const PAGE_SIZE = 18;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const topicKey = id => `topic:${id}`;

function buildIndexes(state) {
  const topics = (state.relations?.topics || []).filter(t => !t.deleted);
  const assignment = new Map((state.relations?.assignments || []).map(a => [a.word, a]));
  const schedules = new Map((state.spacedReview?.items || []).filter(i => i.kind === "word").map(i => [i.word, i]));
  const sources = new Map();
  const sourceKeys = new Map();
  const add = (keys, id, name) => { keys.add(id); if (!sources.has(id)) sources.set(id, { id, name }); };
  for (const word of state.vocabulary) {
    const keys = new Set();
    if (word.captures?.length) {
      add(keys, "captured", "全部题中摘词");
      for (const capture of word.captures) add(keys, `capture:${capture.source.material}`, materialLabel(capture.source.material, state.materials));
    }
    for (const source of word.sources || []) {
      const label = sourceLabel(source, state.materials);
      add(keys, `source:${label}`, label);
    }
    if (!keys.size) add(keys, "legacy", "其他既有词库");
    sourceKeys.set(word.word, keys);
  }
  return { topics, assignment, schedules, sources: [...sources.values()], sourceKeys };
}

export default function Vocabulary({ state, refresh, notify, startRecall, openRelations }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState("topics");
  const [collection, setCollection] = useState(null);
  const [filter, setFilter] = useState("all");
  const [letter, setLetter] = useState("");
  const [sort, setSort] = useState("alphabet");
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState(null);
  const [detailWord, setDetailWord] = useState(null);
  const [topicDraft, setTopicDraft] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useDeferredValue(search.trim().toLowerCase());
  const indexes = useMemo(() => buildIndexes(state), [state.vocabulary, state.relations, state.spacedReview, state.materials]);
  const detail = state.vocabulary.find(w => w.word === detailWord);
  const detailSchedule = indexes.schedules.get(detailWord);
  const topicNames = ids => ids.map(id => indexes.topics.find(t => t.id === id)?.name).filter(Boolean);
  function matchesBucket(word, bucket) {
    if (bucket === "deleted") return !!word.deleted;
    if (word.deleted) return false;
    const schedule = indexes.schedules.get(word.word);
    if (bucket === "due") return !!schedule?.due_today;
    if (bucket === "difficult") return word.status === "待复习" || ["forgotten", "partial"].includes(schedule?.last_result || word.recalls.at(-1)?.self_rating);
    if (bucket === "pending") return !word.meaning?.trim();
    return true;
  }
  const buckets = [["all", "全部"], ["due", "到期复习"], ["difficult", "容易忘"], ["pending", "待补释义"], ["deleted", "已移除"]];
  const base = state.vocabulary.filter(w => matchesBucket(w, filter));
  const collections = (view === "sources" ? indexes.sources : [...indexes.topics, { id: "unclassified", name: "待分类" }]).map(group => {
    const id = view === "sources" ? group.id : topicKey(group.id);
    const words = base.filter(w => view === "sources" ? indexes.sourceKeys.get(w.word)?.has(id) : group.id === "unclassified" ? !indexes.assignment.get(w.word)?.topics.length : indexes.assignment.get(w.word)?.topics.includes(group.id));
    return { ...group, id, count: words.length, preview: words.slice(0, 3).map(w => w.word).join(" · ") };
  }).filter(group => group.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const words = base.filter(word => {
    const ids = indexes.assignment.get(word.word)?.topics || [];
    if (collection?.id.startsWith("topic:")) {
      const id = collection.id.slice(6);
      if (id === "unclassified" ? ids.length : !ids.includes(id)) return false;
    } else if (collection && !indexes.sourceKeys.get(word.word)?.has(collection.id)) return false;
    if (letter && word.word[0]?.toUpperCase() !== letter) return false;
    return `${word.word} ${word.meaning} ${word.note || ""} ${topicNames(ids).join(" ")}`.toLowerCase().includes(query);
  }).sort((a, b) => {
    if (sort === "due") return (indexes.schedules.get(a.word)?.due_date || "9999").localeCompare(indexes.schedules.get(b.word)?.due_date || "9999") || a.word.localeCompare(b.word);
    if (sort === "recent") {
      const latest = w => [w.captures?.at(-1)?.recorded_at || "", indexes.schedules.get(w.word)?.last_at || ""].sort().at(-1);
      return latest(b).localeCompare(latest(a)) || a.word.localeCompare(b.word);
    }
    return a.word.localeCompare(b.word);
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(words.length / PAGE_SIZE) - 1));
  const visible = words.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const listing = view === "all" || !!collection || !!query || filter === "deleted";
  const readyWords = words.filter(w => !w.deleted && !!w.meaning?.trim());
  function resetView(next) { setView(next); setCollection(null); setSearch(""); setLetter(""); setPage(0); }
  function resetFilters() { setFilter("all"); setCollection(null); setSearch(""); setLetter(""); setPage(0); }
  async function mutate(kind, payload) {
    setBusy(true); setError("");
    try { await save(kind, payload); await refresh(); notify("生词本已保存"); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  function openDetail(word) { setDetailWord(word.word); setTopicDraft(null); setError(""); }
  return <>
    <Header title="生词本" description={`${state.vocabulary.filter(w => !w.deleted).length} 个词与短语，按主题、来源找到想复习的内容。`}>
      <button onClick={() => openRelations()}>管理分类与关联</button>
      {listing && <button disabled={busy || !readyWords.length} onClick={() => startRecall(readyWords)}>复习这组词 · {readyWords.length}</button>}
      <button className="primary" onClick={() => { setError(""); setEdit({ word: "", meaning: "", pos: "", note: "" }); }}><Icon name="plus" />新增单词</button>
    </Header>
    <nav className="catalog-view-tabs" aria-label="词库索引方式">
      {[["topics", "主题索引"], ["sources", "来源索引"], ["all", "全部词汇"]].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => resetView(id)}>{label}</button>)}
    </nav>
    <div className="catalog-toolbar">
      <CatalogSearch value={search} onChange={value => { setSearch(value); setPage(0); }} label="搜索单词、释义或主题" placeholder={collection ? `在「${collection.name}」中搜索…` : "搜索单词、释义或主题…"} />
      {listing && <select aria-label="词汇排序" value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="alphabet">按字母</option><option value="due">按复习日期</option><option value="recent">最近接触</option></select>}
    </div>
    <nav className="catalog-filters" aria-label="词汇筛选">
      {buckets.map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(0); if (id === "deleted") setCollection(null); }}>{label}<small>{state.vocabulary.filter(w => matchesBucket(w, id)).length}</small></button>)}
    </nav>
    {error && <p role="alert" className="error">{error}</p>}
    {!listing ? <>
      <div className="catalog-breadcrumb"><strong>{view === "sources" ? "从哪里学到的" : "想记哪一类"}</strong><small>{collections.length} 组 · 可同时属于多组</small></div>
      <div className="catalog-collections">{collections.map(group => <CollectionCard key={group.id} title={group.name} count={group.count} preview={group.preview} onClick={() => { setCollection(group); setLetter(""); setPage(0); }} />)}</div>
      {!collections.length && <Empty title="这个范围还没有词汇"><button onClick={resetFilters}>查看全部词汇</button></Empty>}
    </> : <>
      <div className="catalog-breadcrumb">
        {collection && <><button onClick={() => { setCollection(null); setLetter(""); setPage(0); }}>← 返回{view === "sources" ? "来源" : "主题"}目录</button><span aria-hidden="true">/</span></>}
        <strong>{collection?.name || (query ? "搜索结果" : buckets.find(([id]) => id === filter)?.[1] + "词汇")}</strong><small>{words.length} 项</small>
      </div>
      <nav className="catalog-letter-index" aria-label="单词首字母"><button aria-pressed={!letter} onClick={() => { setLetter(""); setPage(0); }}>全部</button>{alphabet.map(char => <button key={char} aria-pressed={letter === char} onClick={() => { setLetter(char); setPage(0); }}>{char}</button>)}</nav>
      <div className="catalog-word-grid">{visible.map(word => {
        const schedule = indexes.schedules.get(word.word);
        const names = topicNames(indexes.assignment.get(word.word)?.topics || []);
        return <article className="catalog-word" key={word.word}>
          <div><button className="word-link" onClick={() => openDetail(word)}>{word.word}</button><span className={`catalog-word-status ${schedule?.due_today ? "due" : ""}`}>{word.deleted ? "已移除" : schedule?.due_today ? "到期复习" : `${schedule?.review_count || 0} 次复习`}</span></div>
          <p>{word.pos ? `${word.pos} ` : ""}{word.meaning || "待补释义 · 点击单词查看原题"}</p>
          <div className="catalog-word-meta"><span>{names.join(" · ") || "待分类"}</span><div className="catalog-inline-actions">{word.deleted ? <button className="text-button" disabled={busy} onClick={() => mutate("vocab_restore", { word: word.word })}>恢复</button> : <><button className="text-button" onClick={() => { setError(""); setEdit({ ...word, existing: true }); }}>编辑</button><button className="text-button muted" disabled={busy} onClick={() => mutate("vocab_delete", { word: word.word })}>移除</button></>}</div></div>
        </article>;
      })}</div>
      {!words.length && <Empty title="没有匹配的词汇"><p>可以清除筛选，重新选择主题或来源。</p><button onClick={resetFilters}>清除筛选</button></Empty>}
      <CatalogPager page={currentPage} count={words.length} size={PAGE_SIZE} onChange={setPage} />
    </>}
    {edit && <Modal title={edit.existing ? "编辑单词" : "新增单词"} onClose={() => setEdit(null)}>
      <form onSubmit={async e => { e.preventDefault(); if (await mutate("vocab_upsert", { word: edit.word, meaning: edit.meaning, pos: edit.pos || "", note: edit.note || "" })) setEdit(null); }}>
        <Field label="单词 / 短语"><input required readOnly={edit.existing} value={edit.word} onChange={e => setEdit({ ...edit, word: e.target.value })} /></Field>
        <Field label="核心义"><textarea required value={edit.meaning} onChange={e => setEdit({ ...edit, meaning: e.target.value })} /></Field>
        <Field label="词性（可选）"><input value={edit.pos || ""} onChange={e => setEdit({ ...edit, pos: e.target.value })} /></Field>
        <Field label="备注（可选）"><textarea value={edit.note || ""} onChange={e => setEdit({ ...edit, note: e.target.value })} /></Field>
        <small>修改保留历史；新释义标记为用户编辑，待词典核验。</small>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="modal-actions"><button type="button" onClick={() => setEdit(null)}>取消</button><button className="primary" disabled={busy}>保存单词</button></div>
      </form>
    </Modal>}
    {detail && <Modal title={detail.word} onClose={() => { setDetailWord(null); setTopicDraft(null); }}>
      <p className="definition">{detail.pos} {detail.meaning || "尚未整理释义"}</p>
      {detail.collocation && <p>{detail.collocation}</p>}{detail.note && <p>{detail.note}</p>}
      <div className="catalog-detail-summary"><span>{detailSchedule ? `累计复习 ${detailSchedule.review_count} 次` : `平台回忆 ${detail.recalls?.length || 0} 次`}</span><span>下次：{detail.deleted ? "已移出复习计划" : detailSchedule?.due_date || "待首轮回忆"}</span><span>{detail.status}</span></div>
      {!detail.deleted && <details className="catalog-detail-topics"><summary>分类 · {topicNames(indexes.assignment.get(detail.word)?.topics || []).join("、") || "待分类"}</summary><div className="topic-checkboxes">{indexes.topics.map(topic => {
        const selected = topicDraft || indexes.assignment.get(detail.word)?.topics || [];
        return <label key={topic.id}><input type="checkbox" checked={selected.includes(topic.id)} onChange={e => setTopicDraft(e.target.checked ? [...selected, topic.id] : selected.filter(id => id !== topic.id))} />{topic.name}</label>;
      })}</div><button disabled={busy || !topicDraft} onClick={async () => { if (await mutate("word_topics", { word: detail.word, topics: topicDraft, automatic: false })) setTopicDraft(null); }}>保存分类</button></details>}
      <button onClick={() => { setDetailWord(null); openRelations(detail.word); }}>查看近义、反义与形近词</button>
      {!!detail.captures?.length && <details className="capture-sources"><summary>摘词来源 · {detail.captures.length} 处</summary>{detail.captures.map((capture, i) => <div key={i}><small>{materialLabel(capture.source.material, state.materials)} · {capture.source.unit} · 第 {capture.source.question} 题</small><p>{capture.context}</p></div>)}</details>}
      {!!detail.sources?.length && <details className="capture-sources"><summary>收录来源</summary>{[...new Set(detail.sources.map(source => sourceLabel(source, state.materials)))].map(source => <p key={source}>{source}</p>)}</details>}
      <small>{detail.definition_source}</small>{detail.feedback && <p>历史批改：{detail.feedback}</p>}
      {detail.dictionary_url && /^https:\/\//.test(detail.dictionary_url) && <p><a href={detail.dictionary_url} target="_blank" rel="noreferrer">查看词典 ↗</a></p>}
      <p className="catalog-compact-note">复习记录保留原始结果；自评记得不等同于已核验掌握。</p>
      {error && <p role="alert" className="error">{error}</p>}
    </Modal>}
  </>;
}
