import { useMemo, useState } from "react";
import "./question-navigation.css";

export function questionTitle(q) {
  return `${unitTitle(q.unit)} · 第 ${q.question} 题`;
}

function unitTitle(unit) {
  return unit.replace(/^test(\d+)_section(\d+)_(\w+)$/, "Test $1 · Section $2 · $3")
    .replace(/^passage(\d+)$/, "Passage $1")
    .replace(/^section(\d+)_(\w+)$/, "Section $1 · $2");
}

export default function QuestionNavigator({ questions, current, materials, completed, drafts, busy, onChoose, review = false, onFinish }) {
  const [expanded, setExpanded] = useState(() => typeof matchMedia !== "function" || !matchMedia("(max-width: 640px)").matches);
  const active = questions.find(q => q.key === current);
  const books = useMemo(() => [...new Set(questions.map(q => q.material))], [questions]);
  const units = useMemo(() => [...new Set(questions.filter(q => q.material === active?.material).map(q => q.unit))], [questions, active?.material]);
  const visible = review ? questions : questions.filter(q => q.material === active?.material && q.unit === active?.unit);
  const status = q => drafts[q.key]?.saved ? "saved" : drafts[q.key]?.answer || drafts[q.key]?.note ? "draft" : !review && completed.has(q.key) ? "saved" : "unanswered";
  const statusText = { saved: "已保存", draft: "有草稿", unanswered: "未作答" };
  function firstIn(material, unit) {
    const candidates = questions.filter(q => q.material === material && (!unit || q.unit === unit));
    onChoose(candidates.find(q => status(q) !== "saved") || candidates[0]);
  }
  return <nav className="question-index" aria-label={review ? "本轮题目导航" : "题目导航"}>
    <div className="question-index-bar">
      <button className="question-index-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "收起题目导航" : "展开题目导航"}<span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span></button>
      <span className="question-index-position">{review ? "本轮复习" : active && unitTitle(active.unit)} · {active ? `${questions.findIndex(q => q.key === current) + 1} / ${questions.length}` : `${questions.length} 题`}</span>
      {review && onFinish && <button className="text-button" disabled={busy} onClick={onFinish}>结束本组</button>}
    </div>
    {expanded && <div className="question-index-body">
      {!review && <div className="question-index-filters">
        <label><span>教材</span><select aria-label="练习教材" value={active?.material || ""} disabled={busy} onChange={event => firstIn(event.target.value)}>{books.map(id => <option key={id} value={id}>{materials.find(material => material.id === id)?.filename.replace(/\.pdf$/i, "") || id}</option>)}</select></label>
        <label><span>单元</span><select aria-label="练习单元" value={active?.unit || ""} disabled={busy} onChange={event => firstIn(active.material, event.target.value)}>{units.map(unit => <option key={unit} value={unit}>{unitTitle(unit)}</option>)}</select></label>
      </div>}
      <div className="question-number-grid" aria-label={review ? "本轮题号" : "当前单元题号"}>{visible.map((q, index) => <button key={q.key} disabled={busy} className={`question-number ${status(q)} ${q.key === current ? "current" : ""}`} aria-current={q.key === current ? "step" : undefined} aria-label={`${review ? `本轮第 ${index + 1} 题 · ` : ""}${questionTitle(q)} · ${statusText[status(q)]}`} title={`${questionTitle(q)} · ${statusText[status(q)]}`} onClick={() => onChoose(q)}>{review ? index + 1 : q.question}<span className="question-status-dot" aria-hidden="true" /></button>)}</div>
      <div className="question-index-legend"><span><i className="unanswered" />未作答</span><span><i className="draft" />草稿</span><span><i className="saved" />已保存</span></div>
    </div>}
  </nav>;
}
