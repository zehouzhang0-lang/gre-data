import { useEffect, useMemo, useRef, useState } from 'react';
import { request, save } from './api';
import { Field, Header, Modal } from './components';
import WritingReview, { writingSourceLabel } from './WritingReview';
import { WRITING_MODES, downloadWritingText, editWritingDraft, expiredWritingSession, freezeWritingDraft, hasWritingContent, newWritingDraft, readWritingValue, remainingSeconds, sessionFromEvent, submissionPayload, writeWritingValue, writingTextExport, writingWordCount } from './writing-session.mjs';
import './writing.css';

const storage = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) };
const formatDate = value => value ? new Date(value).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const mergeById = (...lists) => [...new Map(lists.flat().map(item => [item.id, item])).values()];
function TopicText({ topic }) {
  return <><p className="writing-source">{writingSourceLabel(topic.source_kind)}{topic.source_url && <a href={topic.source_url} target="_blank" rel="noreferrer">查看来源</a>}</p><h2>{topic.title || 'Analyze an Issue'}</h2><div className="writing-prompt" lang="en"><p>{topic.prompt}</p><h3>Writing instructions</h3><p>{topic.instructions}</p></div></>;
}

function WritingEditor({ session, parentSubmission, initial = {}, onBack, onSaved, refresh, notify }) {
  const [loaded] = useState(() => {
    const read = readWritingValue(storage, `draft:${session.id}`);
    if (read.value && (read.value.session_id !== session.id || typeof read.value.text !== 'string' || typeof read.value.outline !== 'string' || !read.value.save_id)) return { value: null, error: '本机草稿结构不完整。为避免覆盖，已停止编辑；请先导出原始记录。' };
    return read;
  });
  const [draft, setDraft] = useState(() => loaded.value || newWritingDraft(session, initial));
  const draftRef = useRef(draft);
  const [storageError, setStorageError] = useState(loaded.error);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [translation, setTranslation] = useState(false);
  const savingRef = useRef(false);
  const deadlineRef = useRef(null);
  const blocked = Boolean(loaded.error && !loaded.value);
  const frozen = Boolean(draft.frozen);
  const remaining = remainingSeconds(session, now);
  const timed = session.condition === 'timed';
  const commit = next => {
    draftRef.current = next; setDraft(next);
    const result = writeWritingValue(storage, `draft:${session.id}`, next);
    setStorageError(result.error);
    return result;
  };
  function exportDraft() { downloadWritingText(`GRE-writing-draft-${session.id}.txt`, writingTextExport(session, draftRef.current)); }
  async function sendFrozen(next) {
    if (savingRef.current || !hasWritingContent(session, next)) return;
    savingRef.current = true; setSaving(true); setError('');
    let event;
    try { event = await save('writing_submission', submissionPayload(session, next), next.save_id); }
    catch (e) { setError(`原稿尚未确认保存：${e.message}。已保留冻结快照，重试不会创建第二篇。`); savingRef.current = false; setSaving(false); return; }
    const submitted = { ...session, ...submissionPayload(session, next), ...event.payload, id: event.id, recorded_at: event.recorded_at };
    commit({ ...next, submitted_id: event.id });
    writeWritingValue(storage, 'active', null);
    notify?.('原稿已保存。准备好后可请求 AI 批改。');
    onSaved(submitted);
    try { await refresh(); } catch (e) { notify?.(`原稿已保存，列表重新读取失败：${e.message}`); }
    savingRef.current = false; setSaving(false);
  }
  function freezeAndSend(reason) {
    if (blocked || draftRef.current.frozen) return;
    const next = freezeWritingDraft(session, draftRef.current, Date.now(), reason);
    commit(next); setConfirm(false);
    if (hasWritingContent(session, next)) void sendFrozen(next);
    else setError('时间已到，但没有可提交的正文。已有提纲仍保留在本机，可导出；空白内容不会生成作文或分数。');
  }
  deadlineRef.current = () => { if (expiredWritingSession(session)) freezeAndSend('deadline'); };
  useEffect(() => {
    if (!blocked) commit(draftRef.current);
    if (!timed || blocked) return;
    const check = () => { setNow(Date.now()); deadlineRef.current?.(); };
    check();
    const interval = setInterval(check, 1000);
    const deadline = setTimeout(check, Math.max(0, Date.parse(session.deadline_at) - Date.now()));
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); clearTimeout(deadline); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', onVisible); };
  }, [session.id, timed, blocked]);
  useEffect(() => {
    const warn = event => { if (storageError || draftRef.current.frozen && !draftRef.current.submitted_id) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storageError]);
  function edit(patch) {
    if (expiredWritingSession(session)) { deadlineRef.current?.(); return; }
    const next = editWritingDraft(session, draftRef.current, patch);
    if (next !== draftRef.current) commit(next);
  }
  function back() {
    if ((storageError || draftRef.current.frozen && !draftRef.current.submitted_id) && !window.confirm('当前内容尚未安全保存到平台。返回后本机草稿仍保留，但请先导出重要内容。确定返回首页？')) return;
    onBack();
  }
  const draftText = session.mode === 'outline' ? draft.outline : draft.text;
  return <div className="writing-page" data-testid="writing-editor">
    <div className="writing-topline"><button disabled={saving} onClick={back}>返回写作首页</button><span className="writing-muted">{session.parent_id ? '修订练习 · 原版本保留' : '先独立尝试，再看反馈'}</span></div>
    <header className="writing-page-heading"><div><p className="writing-eyebrow">ANALYZE AN ISSUE</p><h1>{WRITING_MODES[session.mode]}</h1></div><div className={`writing-timer ${timed && remaining < 300 ? 'writing-timer-urgent' : ''}`} role="timer" aria-label={timed ? `剩余 ${remaining} 秒` : '未计时练习'}>{timed ? `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}` : '未计时练习'}<small>{timed ? '绝对截止时间 · 离开页面仍计时' : '先把一个训练环节做完整'}</small></div></header>
    {timed && <p className="writing-notice">限时实战期间不提供中文提示、AI 或拼写检查。到时冻结原稿，并按下方完成声明保存；离开后超时恢复不算完整受控实战。</p>}
    {storageError && <div className="writing-error" role="alert"><p>{storageError}</p><button onClick={exportDraft}>导出当前文本</button>{blocked && <button onClick={() => { try { downloadWritingText(`GRE-writing-recovery-${session.id}.txt`, storage.getItem(`gre-writing:v1:draft:${session.id}`) || '没有可读取的原始记录'); } catch (e) { setError(e.message); } }}>导出原始草稿记录</button>}</div>}
    <div className="writing-editor-grid">
      <aside className="writing-topic-pane"><TopicText topic={session.topic} />{!timed && session.topic.translation && <div className="writing-help"><button disabled={frozen || blocked} aria-expanded={translation} onClick={() => { if (!translation) edit({ assistance_used: true }); setTranslation(value => !value); }}>{translation ? '收起中文审题提示' : '需要时再展开中文审题提示'}</button>{translation && <p>{session.topic.translation}</p>}<small>展开会记录“使用过提示”，不会据此推断你的能力。</small></div>}{session.parent_id && <p className="writing-muted">此稿关联原作文，提交后形成独立修订记录。</p>}{parentSubmission && <details className="writing-parent-reference"><summary>查看上一版原稿（只读）</summary><pre className="writing-prose" lang="en">{parentSubmission.text || parentSubmission.outline}</pre></details>}</aside>
      <section className="writing-editor-pane" aria-label="写作编辑器">
        <div className="writing-editor-meta"><label htmlFor={`writing-text-${session.id}`}>{session.mode === 'outline' ? '你的提纲' : '你的正文'}</label><span>{writingWordCount(draftText)} 词{draft.assistance_used ? ' · 已使用提示' : ''}</span></div>
        <textarea id={`writing-text-${session.id}`} className="writing-textarea" lang="en" value={draftText} maxLength={session.mode === 'outline' ? 20000 : 60000} disabled={frozen || blocked} spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder={session.mode === 'outline' ? '用自己的话写下立场、理由、例证与可能的限定。' : '在这里独立写作。原稿保存后，再请求批改。'} onChange={e => edit(session.mode === 'outline' ? { outline: e.target.value } : { text: e.target.value })} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!blocked) commit(draftRef.current); } }} />
        {session.mode !== 'outline' && <details className="writing-outline"><summary>提纲 / 草稿笔记（不会自动计入正文）</summary><label className="writing-sr-only" htmlFor={`writing-outline-${session.id}`}>提纲笔记</label><textarea id={`writing-outline-${session.id}`} rows={5} lang="en" value={draft.outline} maxLength={20000} disabled={frozen || blocked} spellCheck={false} autoCorrect="off" autoCapitalize="off" onChange={e => edit({ outline: e.target.value })} /></details>}
        {session.mode === 'full_essay' ? <Field label="全文完成声明"><select value={draft.completed ? 'complete' : 'incomplete'} disabled={frozen || blocked} onChange={e => edit({ completed: e.target.value === 'complete' })}><option value="incomplete">尚未完成全文（不估整篇分数）</option><option value="complete">我已完成全文</option></select></Field> : <p className="writing-muted">本次是{WRITING_MODES[session.mode]}，只看针对性反馈，不估整篇分数。</p>}
        <div className="writing-editor-footer"><small role="status">{frozen ? '原稿已冻结，不能继续修改' : storageError ? '仅内存保留，请导出' : `本机草稿已保存 · ${formatDate(draft.updated_at)}`}</small><div className="writing-actions"><button onClick={exportDraft}>导出文本</button>{frozen ? <button className="primary" disabled={saving || !hasWritingContent(session, draft)} onClick={() => sendFrozen(draftRef.current)}>{saving ? '正在保存…' : '重试保存冻结原稿'}</button> : <button className="primary" disabled={blocked || !hasWritingContent(session, draft)} onClick={() => { if (expiredWritingSession(session)) deadlineRef.current?.(); else setConfirm(true); }}>提交本次练习</button>}</div></div>
        {error && <p className="writing-error" role="alert">{error}</p>}
      </section>
    </div>
    {confirm && <Modal title="确认保存原稿" onClose={() => setConfirm(false)}><div className="writing-modal"><p>保存后原稿不再修改；继续写作会另存修订版本。</p>{session.mode === 'full_essay' ? <Field label="这是一篇完成的全文吗？"><select value={draft.completed ? 'complete' : 'incomplete'} onChange={e => edit({ completed: e.target.value === 'complete' })}><option value="incomplete">尚未完成，只保存并获取反馈</option><option value="complete">已完成，可以请求暂定估分</option></select></Field> : <p>{WRITING_MODES[session.mode]}不会被当作完整作文评分。</p>}<p className="writing-muted">{draft.assistance_used ? '已记录使用中文提示 / 辅助。' : '未记录提示使用。'}提交不会自动请求 AI。</p><div className="writing-actions"><button onClick={() => setConfirm(false)}>继续编辑</button><button className="primary" onClick={() => freezeAndSend(expiredWritingSession(session) ? 'deadline' : 'manual')}>确认保存原稿</button></div></div></Modal>}
  </div>;
}

export default function Writing({ state, refresh, notify, initialSubmissionId }) {
  const writing = state.writing || {};
  const [activeRecord] = useState(() => readWritingValue(storage, 'active'));
  const [pendingRecord] = useState(() => readWritingValue(storage, 'pending-start'));
  const [activeSession, setActiveSession] = useState(() => initialSubmissionId ? null : activeRecord.value?.session || null);
  const [initialDraft, setInitialDraft] = useState({});
  const [submissionId, setSubmissionId] = useState(initialSubmissionId || '');
  const [localSessions, setLocalSessions] = useState([]);
  const [localSubmissions, setLocalSubmissions] = useState([]);
  const [pendingStart, setPendingStart] = useState(pendingRecord.value?.operation || null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(activeRecord.error || pendingRecord.error);
  const [topics, setTopics] = useState([]);
  const [resources, setResources] = useState({});
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsError, setTopicsError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [mode, setMode] = useState('outline');
  const [condition, setCondition] = useState('practice');
  const [theme, setTheme] = useState('all');
  const [practiceStatus, setPracticeStatus] = useState('all');
  const [manual, setManual] = useState(false);
  const [manualTopic, setManualTopic] = useState({ title: '', prompt: '', instructions: '' });
  const [page, setPage] = useState(0);
  const startRef = useRef(false);
  const sessions = mergeById(localSessions, writing.sessions || []).sort((a, b) => String(b.started_at || b.recorded_at).localeCompare(String(a.started_at || a.recorded_at)));
  const submissions = mergeById(localSubmissions, writing.submissions || []).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));
  const submittedSessions = new Set(submissions.map(item => item.session_id));
  const drafts = sessions.filter(item => !item.submission_id && !submittedSessions.has(item.id));
  const active = activeSession && (sessions.find(item => item.id === activeSession.id) || activeSession);
  const existingSubmission = active && submissions.find(item => item.session_id === active.id);
  const submission = submissions.find(item => item.id === submissionId) || existingSubmission;
  useEffect(() => {
    let alive = true;
    setTopicsLoading(true); setTopicsError('');
    request('/api/writing/topics').then(data => { if (alive) { setTopics(data.topics || []); setResources(data.resources || {}); } }).catch(e => { if (alive) setTopicsError(e.message); }).finally(() => { if (alive) setTopicsLoading(false); });
    return () => { alive = false; };
  }, [loadVersion]);
  const knownTopics = useMemo(() => mergeById(topics, sessions.map(item => item.topic).filter(Boolean)), [topics, writing.sessions, localSessions]);
  const themes = [...new Set(knownTopics.map(item => item.theme).filter(Boolean))];
  const filteredTopics = knownTopics.filter(item => {
    if (theme !== 'all' && item.theme !== theme) return false;
    if (practiceStatus === 'new') return !sessions.some(session => session.topic?.id === item.id);
    if (practiceStatus === 'draft') return drafts.some(session => session.topic?.id === item.id);
    if (practiceStatus === 'submitted') return submissions.some(submission => submission.topic?.id === item.id);
    return true;
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filteredTopics.length / 8) - 1));
  function home() { setActiveSession(null); setSubmissionId(''); writeWritingValue(storage, 'active', null); }
  function resume(session) { setInitialDraft({}); setActiveSession(sessionFromEvent(session)); setSubmissionId(''); const result = writeWritingValue(storage, 'active', { session: sessionFromEvent(session) }); if (!result.ok) setError(result.error); }
  async function performStart(operation) {
    if (startRef.current) return;
    startRef.current = true; setStarting(true); setError('');
    const stored = writeWritingValue(storage, 'pending-start', { operation });
    if (!stored.ok) { setError(stored.error); startRef.current = false; setStarting(false); return; }
    setPendingStart(operation);
    let event;
    try { event = await save('writing_session', operation.payload, operation.id); }
    catch (e) { setError(`开始练习尚未确认：${e.message}。请重试同一次开始请求，计时不会重新起算。`); startRef.current = false; setStarting(false); return; }
    const session = sessionFromEvent(event);
    const draft = newWritingDraft(session, operation.initial || {});
    // A replayed start must resume its prior draft, not replace it with a blank copy.
    const previous = readWritingValue(storage, `draft:${session.id}`);
    let result = previous.value || previous.error ? { ok: !previous.error, error: previous.error } : writeWritingValue(storage, `draft:${session.id}`, draft);
    const activeResult = writeWritingValue(storage, 'active', { session });
    writeWritingValue(storage, 'pending-start', null); setPendingStart(null);
    setLocalSessions(value => mergeById(value, [session])); setInitialDraft(operation.initial || {}); setActiveSession(session); setSubmissionId(''); setSelectedTopic(null); setManual(false);
    if (!result.ok || !activeResult.ok) setError(result.error || activeResult.error);
    startRef.current = false; setStarting(false);
    try { await refresh(); } catch (e) { notify?.(`练习已开始，列表更新失败：${e.message}`); }
  }
  function begin(topic, nextMode = mode, nextCondition = condition, parentId = null, initial = {}) {
    if (pendingStart) { setError('有一次开始请求尚未确认，请先点击“重试开始”。'); return; }
    const operation = { id: crypto.randomUUID(), payload: { topic, mode: nextCondition === 'timed' ? 'full_essay' : nextMode, condition: nextCondition, parent_id: parentId }, initial };
    setSelectedTopic(null); setManual(false);
    void performStart(operation);
  }
  function revise(original, nextMode, initial) {
    begin(original.topic, nextMode, 'practice', original.id, { ...initial, assistance_used: Boolean(original.assistance_used || (writing.reviews || []).some(item => item.submission_id === original.id)) });
  }
  function abandonPendingStart() {
    if (!window.confirm('只取消本机待确认请求，不删除服务器记录。如果服务器已开始计时，该草稿会保留在列表中且不会重置。确定返回选题？')) return;
    const result = writeWritingValue(storage, 'pending-start', null);
    setPendingStart(null); setError(result.error); home();
    Promise.resolve(refresh()).catch(e => setError(`重新读取练习列表失败：${e.message}`));
  }
  const sharedError = <>{error && <p role="alert" className="writing-error">{error}</p>}{pendingStart && <div className="writing-notice"><p>上一次开始请求尚未确认。重试会沿用同一记录，不重新计时。</p><div className="writing-actions"><button disabled={starting} onClick={() => performStart(pendingStart)}>{starting ? '正在确认…' : '重试开始'}</button><button disabled={starting} onClick={abandonPendingStart}>返回选题</button></div></div>}</>;
  if (submission) return <>{sharedError}<WritingReview key={submission.id} submission={submission} parentSubmission={submissions.find(item => item.id === submission.parent_id)} reviews={writing.reviews || []} refresh={refresh} onBack={home} onRevise={revise} busy={starting} /></>;
  if (submissionId) return <section className="writing-page"><button onClick={home}>返回写作首页</button><div className="writing-empty"><h1>暂未找到这篇原稿</h1><p>记录可能仍在读取；没有为你新建练习。</p><button onClick={() => refresh().catch(e => setError(e.message))}>重新读取</button>{sharedError}</div></section>;
  if (active) return <>{sharedError}<WritingEditor key={active.id} session={sessionFromEvent(active)} parentSubmission={submissions.find(item => item.id === active.parent_id)} initial={initialDraft} onBack={home} onSaved={item => { setLocalSubmissions(value => mergeById(value, [item])); setSubmissionId(item.id); setActiveSession(null); }} refresh={refresh} notify={notify} /></>;
  return <div className="writing-page" data-testid="writing-home">
    <Header title="写作训练" description={`Analyze an Issue · 目标 ${writing.target?.score ?? writing.target ?? 3.5} 分 · 从独立表达开始`}><button onClick={() => setManual(true)}>使用自己的题目</button></Header>
    {sharedError}
    <section className="writing-start" aria-label="开始写作练习"><div><h2>今天练哪一步？</h2><p>先选训练方式，再选一道题。提纲、单段和整篇各自保存，不混算为完整作文。</p></div><div className="writing-start-controls"><div className="writing-mode-group" role="group" aria-label="训练方式">{Object.entries(WRITING_MODES).map(([key, label]) => <button key={key} aria-pressed={condition === 'practice' && mode === key} disabled={starting || !!pendingStart} onClick={() => { setMode(key); setCondition('practice'); }}>{label}</button>)}<button aria-pressed={condition === 'timed'} disabled={starting || !!pendingStart} onClick={() => { setMode('full_essay'); setCondition('timed'); }}>30 分钟限时实战</button></div><small>{condition === 'timed' ? '点击题目中的开始按钮后计时；到时自动冻结原稿。' : '未计时练习。中文审题提示默认收起，展开会留下辅助记录。'}</small></div></section>
    {drafts.length > 0 && <section className="writing-drafts"><div className="writing-section-title"><h2>继续草稿</h2><span>{drafts.length} 个未提交练习</span></div>{drafts.map(item => <div className="writing-list-row" key={item.id}><div><strong>{item.topic?.title || '自选题目'}</strong><p>{WRITING_MODES[item.mode]} · {formatDate(item.started_at || item.recorded_at)}{item.condition === 'timed' ? expiredWritingSession(sessionFromEvent(item)) ? ' · 已过截止时间，恢复时冻结' : ' · 计时仍在继续' : ' · 未计时'}</p></div><button onClick={() => resume(item)}>继续草稿</button></div>)}</section>}
    <section className="writing-topics"><div className="writing-section-title"><h2>选择题目</h2><div className="writing-filters"><Field label="主题"><select value={theme} onChange={e => { setTheme(e.target.value); setPage(0); }}><option value="all">全部主题</option>{themes.map(item => <option key={item}>{item}</option>)}</select></Field><Field label="练习状态"><select value={practiceStatus} onChange={e => { setPracticeStatus(e.target.value); setPage(0); }}><option value="all">全部题目</option><option value="new">尚未练习</option><option value="draft">有草稿</option><option value="submitted">有已提交记录</option></select></Field></div></div>
      {topicsLoading && <p role="status">正在读取题目…</p>}{topicsError && <div role="alert" className="writing-error">题目读取失败：{topicsError}<button onClick={() => setLoadVersion(value => value + 1)}>重试读取</button></div>}
      {!topicsLoading && !topicsError && filteredTopics.length === 0 && <div className="writing-empty"><h3>当前筛选下没有题目</h3><p>调整主题或练习状态，也可以使用自己的完整题目。</p></div>}
      <div className="writing-topic-list">{filteredTopics.slice(currentPage * 8, currentPage * 8 + 8).map(topic => <article key={topic.id} className="writing-topic-card"><div><p className="writing-eyebrow">{topic.theme || '自选主题'} · {writingSourceLabel(topic.source_kind)}</p><h3>{topic.title || 'Analyze an Issue'}</h3><p lang="en" className="writing-topic-preview">{topic.prompt}</p></div><div className="writing-actions"><button onClick={() => setSelectedTopic(topic)}>阅读完整题目</button><button disabled={starting || !!pendingStart} onClick={() => begin(topic)}>{condition === 'timed' ? '开始 30 分钟实战' : `开始${WRITING_MODES[mode]}`}</button></div></article>)}</div>
      {filteredTopics.length > 8 && <div className="writing-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {Math.ceil(filteredTopics.length / 8)}</span><button disabled={(currentPage + 1) * 8 >= filteredTopics.length} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
    </section>
    <section className="writing-submissions"><div className="writing-section-title"><h2>我的作文与练习</h2><span>{submissions.length} 份已保存原稿</span></div>{submissions.length ? submissions.map(item => <div className="writing-list-row" key={item.id}><div><strong>{item.topic?.title || '自选题目'}</strong><p>{WRITING_MODES[item.mode]} · {formatDate(item.recorded_at)}{item.parent_id ? ' · 修订版' : ''} · {item.mode === 'full_essay' ? item.completed ? '全文已完成' : '全文未完成' : '非全文训练'}</p></div><button onClick={() => setSubmissionId(item.id)}>原稿与批改</button></div>) : <p className="writing-muted">还没有已提交的写作记录。这里会保留每一版原稿与对应批改。</p>}</section>
    {resources.overview && <footer className="writing-official"><span>ETS 官方参考{resources.checked_at ? ` · 核对于 ${resources.checked_at}` : ''}</span><a href={resources.overview} target="_blank" rel="noreferrer">写作说明</a>{resources.issue && <a href={resources.issue} target="_blank" rel="noreferrer">Issue 任务</a>}{resources.pool && <a href={resources.pool} target="_blank" rel="noreferrer">官方题库入口</a>}{resources.scoring && <a href={resources.scoring} target="_blank" rel="noreferrer">评分标准</a>}<small>AI 估分始终是暂定参考，不承诺真实考试分数。</small></footer>}
    {selectedTopic && <Modal title="完整题目" onClose={() => setSelectedTopic(null)}><div className="writing-modal"><TopicText topic={selectedTopic} /><div className="writing-actions"><button onClick={() => setSelectedTopic(null)}>返回选题</button><button className="primary" disabled={starting || !!pendingStart} onClick={() => begin(selectedTopic)}>{condition === 'timed' ? '开始 30 分钟实战' : `开始${WRITING_MODES[mode]}`}</button></div></div></Modal>}
    {manual && <Modal title="使用自己的 Issue 题目" onClose={() => setManual(false)}><form className="writing-modal" onSubmit={e => { e.preventDefault(); const topic = { ...manualTopic, id: `user-${crypto.randomUUID()}`, title: manualTopic.title.trim() || '自选 Issue 题目', source_kind: 'user_provided', source_url: '', translation: '', theme: '自选题目' }; begin(topic); }}><p>请同时提供完整题干与写作要求。不知道要求时不要凭空补写。</p><Field label="题目名称（可选）"><input maxLength={300} value={manualTopic.title} onChange={e => setManualTopic(value => ({ ...value, title: e.target.value }))} /></Field><Field label="完整题干（英文）"><textarea required maxLength={12000} rows={4} value={manualTopic.prompt} onChange={e => setManualTopic(value => ({ ...value, prompt: e.target.value }))} /></Field><Field label="完整写作要求（英文）"><textarea required maxLength={8000} rows={4} value={manualTopic.instructions} onChange={e => setManualTopic(value => ({ ...value, instructions: e.target.value }))} /></Field><div className="writing-actions"><button type="button" onClick={() => setManual(false)}>取消</button><button className="primary" disabled={starting || !!pendingStart || !manualTopic.prompt.trim() || !manualTopic.instructions.trim()}>开始当前训练方式</button></div></form></Modal>}
  </div>;
}
