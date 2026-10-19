import { useEffect, useRef, useState } from 'react';
import { post, request } from './api';
import { Field, Modal } from './components';
import { WRITING_MODES, downloadWritingText, validWritingExcerpt, writingTextExport } from './writing-session.mjs';

const dimensions = { task_fulfillment: '任务回应', position: '立场与中心论点', development: '论证展开', organization: '组织与衔接', language_control: '语言控制' };
export const writingSourceLabel = kind => ({ official: 'ETS 官方题目', coach_original: '教练原创训练题 · 非 ETS 真题', user_provided: '用户提供题目' }[kind] || '来源未注明');
const dateLabel = date => date ? new Date(date).toLocaleString('zh-CN') : '';

function Feedback({ review, submission }) {
  const result = review.result || {};
  const mayScore = submission.mode === 'full_essay' && submission.completed;
  return <article className="writing-feedback">
    <div className="writing-feedback-heading"><h2>本次批改</h2><span className="writing-muted">AI 暂定分析{review.model ? ` · ${review.model}` : ''}</span></div>
    {mayScore && typeof result.score === 'number' ? <p className="writing-score">{result.score.toFixed(1)}<span> / 6 · 暂定估分，不等于真实考试成绩</span></p> : <p className="writing-notice">{mayScore ? '当前证据不足以可靠估分，暂不提供整体分数。' : submission.mode === 'full_essay' ? '未完成的全文不估整篇分数。' : '提纲与单段训练只反馈，不估整篇分数。'}</p>}
    {result.score_reason && <p>{result.score_reason}</p>}
    <p>{result.summary}</p>
    {!!result.priorities?.length && <section><h3>先改这 {result.priorities.length} 件事</h3><ol className="writing-priorities">{result.priorities.map((item, index) => <li key={index}><strong>{item.issue}</strong><blockquote>{item.evidence}</blockquote><p>{item.action}</p></li>)}</ol></section>}
    <section className="writing-dimensions"><h3>五个观察维度</h3>{(result.dimensions || []).map(item => <details key={item.id}><summary>{dimensions[item.id] || item.id}</summary><p>{item.feedback}</p><blockquote>{item.evidence}</blockquote></details>)}</section>
    {!!result.sentence_feedback?.length && <section><h3>局部表达建议</h3>{result.sentence_feedback.map((item, index) => <div className="writing-sentence-feedback" key={index}><span className="writing-muted">你的原句</span><blockquote>{item.original}</blockquote><span className="writing-muted">建议改法 · 不是对原稿的覆盖</span><p lang="en">{item.suggestion}</p><p>{item.reason}</p></div>)}</section>}
    {result.next_action && <section className="writing-next"><h3>下一次检验</h3><p>{result.next_action}</p>{!!result.technique_ids?.length && <small>关联技巧：{result.technique_ids.join(' · ')}</small>}</section>}
  </article>;
}

export default function WritingReview({ submission, parentSubmission, reviews = [], refresh, onBack, onRevise, busy }) {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [reviewId, setReviewId] = useState('');
  const [revision, setRevision] = useState(false);
  const [excerpt, setExcerpt] = useState('');
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const matchingReviews = reviews.filter(item => item.submission_id === submission.id).sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));
  const review = matchingReviews.find(item => item.id === reviewId) || matchingReviews[0];
  const job = connection?.job;
  const active = job && ['running', 'saving'].includes(job.status);
  const relevant = job?.scope === 'writing' && job.submission_id === submission.id;
  useEffect(() => {
    let alive = true, timer, refreshed = '';
    async function poll() {
      try {
        const next = await request('/api/ai/status');
        if (!alive) return;
        setConnection(next);
        const token = next.job?.event_id || next.job?.id;
        if (next.job?.status === 'completed' && next.job?.submission_id === submission.id && token && token !== refreshed) {
          refreshed = token;
          try { await refreshRef.current(); } catch (e) { if (alive) setError(`批改已保存，重新读取失败：${e.message}`); }
        }
      } catch (e) { if (alive) setError(`无法读取 AI 状态：${e.message}`); }
      if (alive) timer = setTimeout(poll, 2500);
    }
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [submission.id]);
  async function analyze() {
    setStarting(true); setError('');
    try { const nextJob = await post('/api/ai/review', { scope: 'writing', submission_id: submission.id }); setConnection(value => ({ ...value, job: nextJob })); }
    catch (e) { setError(e.message); }
    finally { setStarting(false); }
  }
  async function cancel() {
    try { const response = await post('/api/ai/cancel', {}); setConnection(value => ({ ...value, job: response.job })); }
    catch (e) { setError(e.message); }
  }
  const original = submission.text || submission.outline || '';
  const excerptValid = validWritingExcerpt(original, excerpt);
  return <div className="writing-page" data-testid="writing-review">
    <div className="writing-topline"><button onClick={onBack}>返回写作首页</button><span className="writing-muted">原稿已保存 · 修订会另存新版本</span></div>
    <header className="writing-page-heading"><div><p className="writing-eyebrow">{WRITING_MODES[submission.mode]} · {dateLabel(submission.recorded_at)}</p><h1>{submission.topic?.title || '我的作文'}</h1></div><div className="writing-actions"><button onClick={() => downloadWritingText(`GRE-writing-${submission.id}.txt`, writingTextExport(submission, submission))}>导出原稿</button><button disabled={busy} onClick={() => { setExcerpt(''); setRevision(true); }}>局部修订</button><button disabled={busy} onClick={() => onRevise(submission, 'full_essay', { text: submission.text || '', outline: submission.outline || '' })}>{submission.mode === 'full_essay' ? '修订整篇' : '继续写成整篇'}</button></div></header>
    <p className="writing-muted">{writingSourceLabel(submission.topic?.source_kind)} · {submission.mode === 'outline' ? '提纲记录 · ' : Number.isFinite(submission.word_count) ? `${submission.word_count} 词 · ` : ''}{submission.condition === 'timed' ? '30 分钟限时练习' : '未计时练习'}{submission.assistance_used ? ' · 使用过提示 / 批改后修订' : ' · 未记录提示使用'}</p>
    {submission.condition === 'timed' && <p className={`writing-notice ${submission.timing_status !== 'within_limit' ? 'writing-warning' : ''}`}>{submission.timing_status === 'within_limit' ? '截止前的快照已在允许时段内提交。此记录是本地限时练习，不是正式监考证明。' : '截止后恢复或提交：保留原稿，但不视为完整受控的 30 分钟实战。'}</p>}
    {submission.parent_id && <details className="writing-version-comparison"><summary>与上一版对照 · 两版原文均保留</summary>{parentSubmission ? <div className="writing-version-grid"><section><h3>上一版 · {WRITING_MODES[parentSubmission.mode]}</h3><small>{dateLabel(parentSubmission.recorded_at)}</small><pre className="writing-prose" lang="en">{parentSubmission.text || parentSubmission.outline}</pre></section><section><h3>当前修订 · {WRITING_MODES[submission.mode]}</h3><small>{dateLabel(submission.recorded_at)}</small><pre className="writing-prose" lang="en">{original}</pre></section></div> : <p className="writing-muted">上一版暂未读取到，原稿编号：{submission.parent_id}。当前修订未覆盖上一版。</p>}</details>}
    <div className="writing-review-grid">
      <section className="writing-original"><h2>你的原稿</h2><details className="writing-prompt-details"><summary>题目与写作要求</summary><p lang="en">{submission.topic?.prompt}</p><p lang="en">{submission.topic?.instructions}</p></details>{submission.outline && submission.text && <details><summary>当时的提纲</summary><pre className="writing-prose">{submission.outline}</pre></details>}<pre className="writing-prose" lang="en">{original}</pre></section>
      <section className="writing-review-panel" aria-label="AI 批改">
        <div className="writing-ai-controls"><div className="writing-actions"><button className="primary" disabled={starting || active || !connection?.available} onClick={analyze}>{active && relevant && job.status === 'saving' ? '批改正在保存…' : starting || active && relevant ? 'AI 正在批改…' : review ? '重新批改' : '请求 AI 批改'}</button>{relevant && job.status === 'running' && <button onClick={cancel}>停止批改</button>}</div><small>只有点击后才请求 AI，使用 Codex 订阅额度；不会改动你的原稿。</small></div>
        {active && !relevant && <p role="status" className="writing-notice">另一个 AI 任务正在进行，请等待完成。</p>}
        {connection && !connection.available && <p className="writing-warning">{connection.message || 'AI 暂不可用。'}<button onClick={() => request('/api/ai/status?refresh=1').then(setConnection).catch(e => setError(e.message))}>重新连接</button></p>}
        {(error || relevant && job.status === 'failed') && <p role="alert" className="writing-error">{error || job.error}</p>}
        {matchingReviews.length > 1 && <Field label="批改版本"><select value={review?.id || ''} onChange={e => setReviewId(e.target.value)}>{matchingReviews.map(item => <option key={item.id} value={item.id}>{dateLabel(item.recorded_at)}</option>)}</select></Field>}
        {review ? <Feedback review={review} submission={submission} /> : <div className="writing-empty"><h2>先保留自己的答案</h2><p>准备好复盘时，再请求批改。反馈将对照你的原文，优先指出最影响表现的 2–3 个问题。</p><p>提纲、单段和未完成的全文不估整篇分数。</p></div>}
      </section>
    </div>
    {revision && <Modal title="选择要修订的片段" onClose={() => setRevision(false)}><div className="writing-modal"><p>把原稿中的一个段落原样粘贴到下方；进入新练习后再修改。新练习将与这篇原稿关联，原稿不会被覆盖。</p><Field label="局部原文"><textarea lang="en" rows={7} value={excerpt} onChange={e => setExcerpt(e.target.value)} /></Field>{excerpt.trim() && !excerptValid && <p className="writing-error" role="alert">这段内容不是原稿中的连续片段。请先原样复制，进入修订练习后再改写。</p>}<div className="writing-actions"><button onClick={() => setRevision(false)}>取消</button><button className="primary" disabled={busy || !excerptValid} onClick={() => { setRevision(false); onRevise(submission, 'paragraph', { text: excerpt.trim(), outline: '' }); }}>开始局部修订</button></div></div></Modal>}
  </div>;
}
