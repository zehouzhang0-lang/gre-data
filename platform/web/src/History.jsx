import { useDeferredValue, useMemo, useState } from "react";
import { Header, Modal, Empty } from "./components";
import AiReview, { ReviewText } from "./AiReview";
import { request, download, typeNames, keyOf } from "./api";
import { CatalogSearch, CatalogPager, studyDay, materialLabel } from "./CatalogParts";
import { stageLabels, eventLabels, learningEventKinds, attemptLabel, recallLabel, legacySubject, legacyDate, groupBy } from "./history-index.mjs";

const PAGE_SIZE = 12;
const subjects = { vocab: "词汇", verbal: "Verbal", quant: "Quant", writing: "Writing" };

function AttemptEntry({ attempt, onAi, timeZone }) {
  return <article className="catalog-record-detail">
    <div className="catalog-attempt-heading"><span>{new Date(attempt.recorded_at).toLocaleString("zh-CN", { timeZone })}</span><strong>{attemptLabel(attempt.result)}</strong></div>
    <p>我的答案：{attempt.answer}{attempt.expected ? `　参考答案：${attempt.expected}` : ""}</p>
    {attempt.duration_seconds ? <small>用时 {Math.round(attempt.duration_seconds)} 秒</small> : null}
    {attempt.note && <p>作答笔记：{attempt.note}</p>}
    <details><summary>查看解析</summary><p>{attempt.explanation || "尚未提供解析。"}</p><small>答案来源：{attempt.answer_source === "user_provided" ? "用户提供" : "尚无依据"}</small></details>
    <button className="text-button" onClick={() => onAi(attempt.id)}>AI 讲解</button>
  </article>;
}

export default function History({ state, refresh }) {
  const [tab, setTab] = useState("overview");
  const [wordView, setWordView] = useState("words");
  const [record, setRecord] = useState(null);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState("");
  const [result, setResult] = useState("");
  const [material, setMaterial] = useState("");
  const [topic, setTopic] = useState("");
  const [eventScope, setEventScope] = useState("maintenance");
  const [eventKind, setEventKind] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState(null);
  const [detailPage, setDetailPage] = useState(0);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const query = useDeferredValue(search.trim().toLowerCase());
  const timeZone = state.spacedReview?.time_zone || "Asia/Shanghai";
  const day = value => studyDay(value, timeZone);
  const dated = record => !date || day(record.recorded_at) === date;
  const matches = value => !query || String(value).toLowerCase().includes(query);
  const vocabulary = useMemo(() => new Map(state.vocabulary.map(w => [w.word, w])), [state.vocabulary]);
  const schedules = useMemo(() => new Map((state.spacedReview?.items || []).map(item => [item.kind === "word" ? item.word : item.key, item])), [state.spacedReview]);
  const assignments = useMemo(() => new Map((state.relations?.assignments || []).map(a => [a.word, a.topics])), [state.relations]);
  const sessions = state.vocabSessions || [];
  const drills = state.vocabDrills || [];
  const recalls = useMemo(() => state.vocabulary.flatMap(word => (word.recalls || []).map((recall, index) => ({ ...recall, word: word.word, id: recall.id || `${word.word}:${recall.recorded_at}:${index}` }))), [state.vocabulary]);
  const attemptGroups = useMemo(() => groupBy(state.attempts, keyOf).sort((a, b) => b.records[0].recorded_at.localeCompare(a.records[0].recorded_at)), [state.attempts]);
  const wordGroups = useMemo(() => {
    const groups = new Map(groupBy(recalls, r => r.word).map(group => [group.id, { ...group, drills: [] }]));
    for (const drill of drills) { if (!groups.has(drill.word)) groups.set(drill.word, { id: drill.word, records: [], drills: [] }); groups.get(drill.word).drills.push(drill); }
    return [...groups.values()].map(group => ({ ...group, last_at: [...group.records, ...group.drills].reduce((latest, r) => r.recorded_at > latest ? r.recorded_at : latest, "") })).sort((a, b) => b.last_at.localeCompare(a.last_at));
  }, [recalls, drills]);
  const days = useMemo(() => {
    const map = new Map();
    const ensure = at => { const date = studyDay(at, timeZone); if (!map.has(date)) map.set(date, { date, attempts: [], recalls: [], drills: [] }); return map.get(date); };
    for (const a of state.attempts) ensure(a.recorded_at).attempts.push(a);
    for (const r of recalls) ensure(r.recorded_at).recalls.push(r);
    for (const r of drills) ensure(r.recorded_at).drills.push(r);
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [state.attempts, recalls, drills, timeZone]);

  function changeTab(next) { setTab(next); setSearch(""); setType(""); setResult(""); setMaterial(""); setTopic(""); setEventKind(""); setPage(0); }
  function openDetail(value) { setDetail(value); setDetailPage(0); }
  function openDay(value, next, mode = "words") { changeTab(next); setDate(value); setWordView(mode); }
  async function openLegacy(r) {
    try { const data = await request(`/api/record?path=${encodeURIComponent(r.path)}`); setRecord({ title: r.name, text: data.text }); }
    catch (e) { setRecord({ title: "读取失败", text: e.message }); }
  }
  const filteredAttempts = attemptGroups.map(group => ({ ...group, matching: group.records.filter(a => dated(a) && (!result || (result === "right" ? a.result === true : result === "wrong" ? a.result === false : a.result == null))) }))
    .filter(group => group.matching.length && (!type || group.records[0].type === type) && (!material || group.records[0].material === material) && matches(`${group.records[0].unit} ${group.records[0].question} ${materialLabel(group.records[0].material, state.materials)} ${group.records.map(a => `${a.answer} ${a.note || ""}`).join(" ")}`));
  const filteredWords = wordGroups.map(group => ({ ...group, matching: group.records.filter(r => dated(r) && (!result || r.self_rating === result)), matchingDrills: group.drills.filter(dated) }))
    .filter(group => (group.matching.length || !result && group.matchingDrills.length) && (!topic || assignments.get(group.id)?.includes(topic)) && matches(`${group.id} ${vocabulary.get(group.id)?.meaning || ""}`));
  const filteredSessions = sessions.filter(session => (!date || day(session.recorded_at) === date || session.completed_at && day(session.completed_at) === date || drills.some(d => d.session_id === session.session_id && dated(d))) && matches((session.words || []).join(" "))).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const filteredDays = days.filter(d => (!date || d.date === date) && matches(`${d.date} ${[...d.recalls, ...d.drills].map(r => r.word).join(" ")} ${d.attempts.map(a => `${a.unit} ${materialLabel(a.material, state.materials)}`).join(" ")}`));
  const filteredLegacy = state.history.filter(r => (!date || legacyDate(r) === date) && (!type || legacySubject(r) === type) && matches(r.name));
  const scopeEvents = state.events.filter(e => eventScope === "all" || (eventScope === "learning" ? learningEventKinds.has(e.kind) : !learningEventKinds.has(e.kind)));
  const filteredEvents = scopeEvents.filter(e => dated(e) && (!eventKind || eventKind === e.kind) && matches(`${eventLabels[e.kind] || e.kind} ${e.word || ""} ${e.stage ? stageLabels[e.stage] || e.stage : ""}`));
  const filteredReviews = (state.reviews || []).filter(review => dated(review) && matches(`${review.result?.summary || ""} ${review.result?.evidence || ""}`));
  const rows = { overview: filteredDays, attempts: filteredAttempts, words: wordView === "sessions" ? filteredSessions : filteredWords, legacy: filteredLegacy, events: filteredEvents, ai: filteredReviews }[tab];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const visible = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const questionDetail = detail?.kind === "question" ? attemptGroups.find(g => g.id === detail.id) : null;
  const wordDetail = detail?.kind === "word" ? wordGroups.find(g => g.id === detail.id) : null;
  const sessionDetail = detail?.kind === "session" ? sessions.find(s => s.session_id === detail.id) : null;
  const detailRecords = questionDetail?.records || wordDetail?.records || [];
  const detailDrills = (sessionDetail ? drills.filter(d => d.session_id === sessionDetail.session_id) : wordDetail?.drills || []).slice().sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const detailRows = detail?.showDrills || sessionDetail ? detailDrills : detailRecords;
  const detailCurrentPage = Math.min(detailPage, Math.max(0, Math.ceil(detailRows.length / 10) - 1));
  const detailVisible = detailRows.slice(detailCurrentPage * 10, (detailCurrentPage + 1) * 10);
  return <>
    <Header title="学习记录" description="按日期、题目和单词回看，每次练习都有出处。">
      <button onClick={() => download("gre-workbench-export.json", { schema_version: 1, exported_at: new Date().toISOString(), attempts: state.attempts, vocabulary_recalls: recalls, vocabulary_sessions: sessions, vocabulary_drills: drills, events: state.events, ai_reviews: state.reviews || [] })}>导出记录</button>
    </Header>
    <nav className="catalog-view-tabs" aria-label="学习记录分类">{[["overview", "学习概览"], ["attempts", "做题记录"], ["words", "单词复习"], ["legacy", "历史训练"], ["ai", "AI 复盘"], ["events", "操作记录"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => changeTab(id)}>{label}</button>)}</nav>
    {tab === "overview" && <div className="catalog-counts"><div><strong>{days.length}</strong><span>平台学习日</span></div><div><strong>{attemptGroups.length}</strong><span>题目 · {state.attempts.length} 次作答</span></div><div><strong>{wordGroups.filter(w => w.records.length).length}</strong><span>单词 · {recalls.length} 次回忆</span></div>{sessions.length > 0 && <div><strong>{sessions.filter(s => s.complete).length}</strong><span>已完成复习轮次</span></div>}</div>}
    <div className="catalog-toolbar">
      <CatalogSearch value={search} onChange={value => { setSearch(value); setPage(0); }} label="搜索学习记录" placeholder={tab === "words" ? "搜索单词或释义…" : tab === "attempts" ? "搜索教材、单元、题号或笔记…" : "搜索日期、名称或内容…"} />
      <input type="date" aria-label="学习日期" value={date} onChange={e => { setDate(e.target.value); setPage(0); }} />
      {date && <button className="text-button" onClick={() => { setDate(""); setPage(0); }}>全部日期</button>}
      {tab === "attempts" && <><select aria-label="题型筛选" value={type} onChange={e => { setType(e.target.value); setPage(0); }}><option value="">全部题型</option>{Object.entries(typeNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="作答结果筛选" value={result} onChange={e => { setResult(e.target.value); setPage(0); }}><option value="">全部结果</option><option value="wrong">答案不一致</option><option value="right">答案一致</option><option value="pending">待核对</option></select><select aria-label="教材筛选" value={material} onChange={e => { setMaterial(e.target.value); setPage(0); }}><option value="">全部教材</option>{[...new Set(state.attempts.map(a => a.material))].map(id => <option key={id} value={id}>{materialLabel(id, state.materials)}</option>)}</select></>}
      {tab === "words" && wordView === "words" && <><select aria-label="词汇主题筛选" value={topic} onChange={e => { setTopic(e.target.value); setPage(0); }}><option value="">全部主题</option>{(state.relations?.topics || []).filter(t => !t.deleted).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><select aria-label="回忆结果筛选" value={result} onChange={e => { setResult(e.target.value); setPage(0); }}><option value="">全部结果</option><option value="forgotten">忘记 / 需再练</option><option value="partial">模糊 / 有错答</option><option value="remembered">记得 / 本轮通过</option></select></>}
      {tab === "legacy" && <select aria-label="历史训练科目" value={type} onChange={e => { setType(e.target.value); setPage(0); }}><option value="">全部科目</option>{Object.entries(subjects).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}
      {tab === "events" && <><select aria-label="操作记录范围" value={eventScope} onChange={e => { setEventScope(e.target.value); setEventKind(""); setPage(0); }}><option value="maintenance">整理与维护</option><option value="learning">学习事件</option><option value="all">全部原始事件</option></select><select aria-label="操作类型" value={eventKind} onChange={e => { setEventKind(e.target.value); setPage(0); }}><option value="">全部类型</option>{[...new Set(scopeEvents.map(e => e.kind))].map(kind => <option key={kind} value={kind}>{eventLabels[kind] || kind}</option>)}</select></>}
    </div>
    {tab === "words" && <nav className="catalog-filters" aria-label="单词复习索引">{[["words", "按单词"], ["sessions", "按轮次"]].map(([id, label]) => <button key={id} aria-pressed={wordView === id} onClick={() => { setWordView(id); setResult(""); setTopic(""); setPage(0); }}>{label}</button>)}</nav>}
    {tab === "overview" && <div className="catalog-day-grid">{visible.map(d => <article className="catalog-day-card" key={d.date}><h2>{d.date}{d.date === state.spacedReview?.today && <small>今天</small>}</h2><div className="catalog-day-links">{d.attempts.length > 0 && <button onClick={() => openDay(d.date, "attempts")}>做题 {d.attempts.length} 次 <small>· {new Set(d.attempts.map(keyOf)).size} 题 ↗</small></button>}{d.recalls.length > 0 && <button onClick={() => openDay(d.date, "words")}>回忆 {d.recalls.length} 次 <small>· {new Set(d.recalls.map(r => r.word)).size} 词 ↗</small></button>}{d.drills.length > 0 && <button onClick={() => openDay(d.date, "words", "sessions")}>轮内练习 {d.drills.length} 步 <small>↗</small></button>}</div></article>)}</div>}
    {tab === "attempts" && <div className="catalog-records">{visible.map(group => { const a = group.matching[0]; return <button className="catalog-record-button" key={group.id} onClick={() => openDetail({ kind: "question", id: group.id })}><div><strong>{typeNames[a.type]} · {a.unit} · 第 {a.question} 题</strong><p>{materialLabel(a.material, state.materials)} · {day(a.recorded_at)}</p></div><span className={a.result === false ? "catalog-result-wrong" : a.result === true ? "catalog-result-right" : ""}>{attemptLabel(a.result)}<small>累计作答 {group.records.length} 次 ↗</small></span></button>; })}</div>}
    {tab === "words" && wordView === "words" && <div className="catalog-records">{visible.map(group => { const last = group.matching[0]; return <button className="catalog-record-button" key={group.id} onClick={() => openDetail({ kind: "word", id: group.id, showDrills: !group.records.length })}><div><strong className="catalog-history-word">{group.id}</strong><p>{vocabulary.get(group.id)?.meaning || "待补释义"}</p></div><span>{last ? recallLabel(last) : "本轮练习中"}<small>{group.records.length} 次回忆 · {group.drills.length > 0 ? `${group.drills.length} 步练习 · ` : ""}{day(last?.recorded_at || group.last_at)} ↗</small></span></button>; })}</div>}
    {tab === "words" && wordView === "sessions" && <div className="catalog-records">{visible.map(session => <button className="catalog-record-button" key={session.session_id} onClick={() => openDetail({ kind: "session", id: session.session_id })}><div><strong>{day(session.recorded_at)} · {session.words.length} 词一轮</strong><p>{session.words.slice(0, 5).join(" · ")}{session.words.length > 5 ? " …" : ""}</p></div><span>{session.complete ? "已完成" : "进行中"}<small>{session.completed_words?.length || 0} / {session.words.length} 词 · {session.drill_count || 0} 步 ↗</small></span></button>)}</div>}
    {tab === "legacy" && <div className="catalog-records">{visible.map(r => <button className="catalog-record-button" key={r.path} onClick={() => openLegacy(r)}><div><strong>{r.name.replace(/^\d{8}_\d{4}_/, "").replaceAll("_", " ")}</strong><p>{subjects[legacySubject(r)]} · {legacyDate(r) || "日期未记录"}</p></div><span>查看原记录 ↗</span></button>)}</div>}
    {tab === "ai" && <><AiReview state={state} refresh={refresh} scope="recent" /><div className="catalog-records">{visible.map(review => <details className="catalog-record-detail" key={review.id}><summary>{day(review.recorded_at)} · {review.scope === "attempt" ? "题目讲解" : "学习复盘"} · {String(review.result?.summary || "查看分析").slice(0, 60)}</summary><ReviewText review={review} attempt={state.attempts.find(a => a.id === review.attempt_id)} /></details>)}</div></>}
    {tab === "events" && <><p className="catalog-compact-note">整理与维护单独留档，不计为完成学习。此处可切换查看全部原始事件。</p><div className="catalog-records">{visible.map(event => <div className="catalog-record-button" key={event.id}><div><strong>{eventLabels[event.kind] || event.kind}{event.word ? ` · ${event.word}` : ""}{event.count ? ` · ${event.count} 项` : ""}</strong>{event.stage && <p>{stageLabels[event.stage] || event.stage} · {event.result === "correct" ? "通过" : event.result === "incorrect" ? "需再练" : "查看答案"}</p>}</div><span>{new Date(event.recorded_at).toLocaleString("zh-CN", { timeZone })}</span></div>)}</div></>}
    {!rows.length && <Empty title={search || date || type || result || material || topic ? "没有匹配的记录" : tab === "words" && wordView === "sessions" ? "还没有多阶段复习轮次" : "还没有这类学习记录"}><p>{tab === "words" && wordView === "sessions" ? "完成辨义、填字母和拼写后，这里会按轮次保存过程。" : "完成练习后会自动归档，也可以调整筛选范围。"}</p>{(search || date || type || result || material || topic) && <button onClick={() => { changeTab(tab); setDate(""); }}>清除筛选</button>}</Empty>}
    <CatalogPager page={currentPage} count={rows.length} size={PAGE_SIZE} onChange={setPage} />
    {(questionDetail || wordDetail || sessionDetail) && <Modal title={questionDetail ? `${questionDetail.records[0].unit} · 第 ${questionDetail.records[0].question} 题` : wordDetail ? wordDetail.id : `${day(sessionDetail.recorded_at)} · 复习轮次`} onClose={() => setDetail(null)}>
      {questionDetail && <p className="catalog-compact-note">{materialLabel(questionDetail.records[0].material, state.materials)} · 累计作答 {questionDetail.records.length} 次 · 复习 {schedules.get(questionDetail.id)?.review_count || 0} 次</p>}
      {wordDetail && <><p>{vocabulary.get(wordDetail.id)?.meaning}</p><p className="catalog-compact-note">平台回忆 {wordDetail.records.length} 次 · 累计复习 {schedules.get(wordDetail.id)?.review_count || 0} 次 · 下次 {schedules.get(wordDetail.id)?.due_date || "待完成本轮"}</p><nav className="catalog-filters" aria-label="单词记录详情"><button aria-pressed={!detail.showDrills} onClick={() => { setDetail({ ...detail, showDrills: false }); setDetailPage(0); }}>每次回忆</button><button aria-pressed={!!detail.showDrills} onClick={() => { setDetail({ ...detail, showDrills: true }); setDetailPage(0); }}>轮内练习 · {wordDetail.drills.length}</button></nav></>}
      {sessionDetail && <><p className="catalog-compact-note">{sessionDetail.complete ? "本轮已完成" : "本轮进行中"} · 已完成 {sessionDetail.completed_words?.length || 0} / {sessionDetail.words.length} 词 · 英选中 {sessionDetail.meaning_passes} 遍 → 字母填空 → 中文拼英文</p><p>{sessionDetail.words.join(" · ")}</p></>}
      {detailVisible.map(item => questionDetail ? <AttemptEntry key={item.id} attempt={item} onAi={id => { setDetail(null); setSelectedAttempt(id); }} timeZone={timeZone} /> : <article className="catalog-record-detail" key={item.id}><div className="catalog-attempt-heading"><strong>{item.stage ? `${item.word} · ${stageLabels[item.stage] || item.stage}` : recallLabel(item)}</strong><span>{new Date(item.recorded_at).toLocaleString("zh-CN", { timeZone })}</span></div>{item.stage ? <><p>{item.result === "correct" ? "通过" : item.result === "incorrect" ? "需再练" : "查看了答案"}{item.answer ? ` · 我的答案：${item.answer}` : ""}</p>{item.response_mode === "self_check" && <small>本步为自评，未作客观核验。</small>}</> : <>{item.answer && <p>当时的回答：{item.answer}</p>}<small>{item.mode === "multistage" ? item.assessment === "locally_checked" ? "本轮根据辨义、填空和拼写结果记录。" : "本轮包含自评或提示，保留原始练习结果。" : "原始自评，不等同于核验掌握。"}</small></>}</article>)}
      {!detailRows.length && <p className="catalog-compact-note">暂未产生这类记录。</p>}
      <CatalogPager page={detailCurrentPage} count={detailRows.length} size={10} onChange={setDetailPage} />
    </Modal>}
    {selectedAttempt && <Modal title="AI 讲解" onClose={() => setSelectedAttempt(null)}><AiReview state={state} refresh={refresh} attempt={state.attempts.find(a => a.id === selectedAttempt)} /></Modal>}
    {record && <Modal title={record.title} onClose={() => setRecord(null)}><pre className="record-text">{record.text}</pre></Modal>}
  </>;
}
