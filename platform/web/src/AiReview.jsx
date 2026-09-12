import { useEffect, useState } from "react";
import { request, post } from "./api";

export function ReviewText({ review, attempt }) {
  const r = review.result;
  return <article className="ai-review">
    <div className="section-heading"><strong>AI {review.scope === "recent" ? "学习复盘" : "讲解"}</strong><small>暂定分析 · {review.model}</small></div>
    {attempt && <small>{attempt.unit} · 第 {attempt.question} 题{review.expected_answer !== attempt.expected ? " · 参考答案已更新，以下保留生成时分析" : ""}</small>}
    <p>{r.summary}</p>
    <details open><summary>依据与推理</summary><p>{r.evidence}</p><p>{r.reasoning_gap}</p></details>
    <div className="ai-next"><strong>下一步</strong><p>{r.next_action}</p></div>
    {r.assessment === "needs_review" && <small>依据尚不充分，待进一步核对。</small>}
  </article>;
}

export default function AiReview({ state, refresh, attempt, scope = "attempt" }) {
  const [connection, setConnection] = useState(null), [error, setError] = useState(""), [starting, setStarting] = useState(false);
  const reviews = (state.reviews || []).filter(r => r.scope === scope && (scope === "recent" || r.attempt_id === attempt?.id));
  const review = reviews[0], job = connection?.job;
  const active = job && ["running", "saving"].includes(job.status);
  const relevant = job?.scope === scope && (scope === "recent" || job.attempt_id === attempt?.id);
  useEffect(() => {
    let alive = true, timer, refreshed = "";
    const poll = async () => {
      try {
        const next = await request("/api/ai/status");
        if (!alive) return;
        setConnection(next);
        if (next.job?.status === "completed" && refreshed !== next.job.id) { refreshed = next.job.id; await refresh(); }
      } catch (e) { if (alive) setError(e.message); }
      if (alive) timer = setTimeout(poll, 2500);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [refresh]);
  async function analyze() {
    setStarting(true); setError("");
    try {
      const nextJob = await post("/api/ai/review", { scope, attempt_id: attempt?.id });
      setConnection(c => ({ ...c, job: nextJob }));
    } catch (e) { setError(e.message); } finally { setStarting(false); }
  }
  return <section className="ai-panel">
    {review && <ReviewText review={review} attempt={attempt} />}
    <div className="ai-actions"><button disabled={starting || active || !connection?.available || scope === "attempt" && !attempt} onClick={analyze}>
      {starting || active && relevant ? "AI正在分析…" : review ? "重新分析" : scope === "recent" ? "AI复盘最近练习" : "AI讲解这道题"}
    </button>{active && relevant ? <button className="text-button" onClick={() => post("/api/ai/cancel", {}).catch(e => setError(e.message))}>停止</button> : <small>使用Codex订阅额度 · 结果自动保存</small>}</div>
    {connection && !connection.available && <p className="muted">{connection.message}<button className="text-button" onClick={() => request("/api/ai/status?refresh=1").then(setConnection).catch(e => setError(e.message))}>重新连接</button></p>}
    {(error || relevant && job.status === "failed") && <p className="error" role="alert">{error || job.error}</p>}
  </section>;
}
