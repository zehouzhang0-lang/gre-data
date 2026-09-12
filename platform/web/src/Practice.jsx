import { useEffect, useState } from "react";
import { Header, Icon, Field, Empty } from "./components";
import { save, keyOf, typeNames } from "./api";
import ImportDialog from "./ImportDialog";
import PdfReader from "./PdfReader";
const draftKey = "gre:practice:v1";
function initial() {
  try {
    return JSON.parse(localStorage.getItem(draftKey)) || {};
  } catch {
    return {};
  }
}
export default function Practice({ state, refresh, notify }) {
  const [draft, setDraft] = useState(() => ({
    type: "se",
    material: "text_completion_2000",
    unit: "test2_section1_easy",
    question: "6",
    page: 17,
    answer: "",
    note: "",
    ...initial(),
  }));
  const [dialog, setDialog] = useState(null),
    [showPdf, setShowPdf] = useState(true),
    [revealed, setRevealed] = useState(false),
    [busy, setBusy] = useState(false),
    [started, setStarted] = useState(null);
  const [error, setError] = useState("");
  const change = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (
      "question" in patch ||
      "unit" in patch ||
      "material" in patch ||
      "type" in patch
    ) {
      setRevealed(false);
      setStarted(null);
    }
  };
  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft]);
  const material = state.materials.find((m) => m.id === draft.material);
  const currentKey = keyOf(draft),
    question = state.questions.find((q) => q.key === currentKey),
    answerKey = state.keys[currentKey];
  const last = state.attempts.find((a) => keyOf(a) === currentKey);
  const pdfUrl = `/api/material/${encodeURIComponent(draft.material)}#page=${draft.page}&view=FitH`;
  const questions = state.questions.filter((q) => q.type === draft.type);
  async function submit(next = false) {
    setBusy(true);
    setError("");
    try {
      await save("attempt", {
        ...draft,
        duration_seconds: started ? (Date.now() - started) / 1000 : null,
      });
      await refresh();
      notify("答案已保存");
      setRevealed(true);
      if (next)
        change({
          question: String(Number(draft.question) + 1),
          answer: "",
          note: "",
        });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function tab(type) {
    const defaults =
      type === "quant"
        ? { material: "quant_900", unit: "easy", page: 1, question: "1" }
        : type === "rc"
          ? {
              material: "reading_440",
              unit: "passage1",
              page: 1,
              question: "1",
            }
          : {
              material: "text_completion_2000",
              unit: type === "se" ? "test2_section1_easy" : "test1_section1_easy",
              page: type === "se" ? 17 : 14,
              question: type === "se" ? "6" : "1",
            };
    change({ ...defaults, type, answer: "", note: "" });
  }
  return (
    <>
      <Header title="刷题练习" description="专注一道题，留下可复盘的答案。">
        <button onClick={() => setDialog("questions")}>
          <Icon name="upload" />
          导入题目
        </button>
      </Header>
      <div className="tabs" role="tablist" aria-label="题型">
        {Object.entries(typeNames).map(([type, name]) => (
          <button
            role="tab"
            aria-selected={draft.type === type}
            className={draft.type === type ? "selected" : ""}
            key={type}
            onClick={() => tab(type)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="practice-grid">
        <section className="panel material-panel">
          <h2>教材与题目</h2>
          <div className="material-fields">
            <Field label="教材">
              <select
                value={draft.material}
                onChange={(e) =>
                  change({
                    material: e.target.value,
                    page: 1,
                    unit: "default",
                    question: "1",
                    answer: "",
                  })
                }
              >
                {state.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.filename.replace(/\.pdf$/i, "")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="页码">
              <input
                title="PDF文件页码（含封面），可能与书内印刷页码不同"
                type="number"
                min="1"
                max={material?.pages || 9999}
                value={draft.page}
                onChange={(e) =>
                  change({ page: Math.max(1, Number(e.target.value)) })
                }
              />
            </Field>
          </div>
          <div className="document-tools">
            <button
              className="text-button"
              onClick={() => setShowPdf((v) => !v)}
            >
              {showPdf ? "收起教材" : "显示教材"}
            </button>
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              单独打开 PDF ↗
            </a>
          </div>
          {showPdf && material?.available ? (
            <PdfReader
              material={draft.material}
              page={draft.page}
              onPage={(page) => change({ page })}
            />
          ) : showPdf ? (
            <Empty title="本机尚无此PDF">
              <p>同步仓库资料后即可直接阅读。</p>
            </Empty>
          ) : null}
          {questions.length > 0 && (
            <Field label="已导入题目">
              <select
                value={question?.key || ""}
                onChange={(e) => {
                  const q = state.questions.find(
                    (q) => q.key === e.target.value,
                  );
                  if (q)
                    change({
                      material: q.material,
                      unit: q.unit,
                      question: q.question,
                      type: q.type,
                      answer: "",
                    });
                }}
              >
                <option value="">选择题目</option>
                {questions.map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.unit} · {q.question}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {question && (
            <article className="question">
              <h3>第 {question.question} 题</h3>
              <p>{question.prompt}</p>
              {question.options.map((option, i) => (
                <button
                  className={`option ${draft.answer.split("/").includes(String.fromCharCode(65 + i)) ? "chosen" : ""}`}
                  key={i}
                  onClick={() => {
                    const letter = String.fromCharCode(65 + i);
                    let answer = letter;
                    if (
                      draft.type === "se" ||
                      draft.type === "rc" ||
                      draft.type === "quant"
                    ) {
                      const selected = draft.answer
                        ? draft.answer.split("/")
                        : [];
                      answer = (
                        selected.includes(letter)
                          ? selected.filter((a) => a !== letter)
                          : [...selected, letter]
                      ).join("/");
                    }
                    change({ answer });
                  }}
                >
                  <b>{String.fromCharCode(65 + i)}</b>
                  {option}
                </button>
              ))}
            </article>
          )}
        </section>
        <section className="panel answer-panel">
          <h2>我的答案</h2>
          <div className="answer-location">
            <Field label="单元">
              <input
                value={draft.unit}
                onChange={(e) => change({ unit: e.target.value })}
              />
            </Field>
            <Field label="题号">
              <input
                value={draft.question}
                onChange={(e) =>
                  change({ question: e.target.value, answer: "", note: "" })
                }
              />
            </Field>
          </div>
          <Field label="我的答案">
            <textarea
              rows={4}
              placeholder="例如 A，或 D/F；多空按顺序填写 A/D/G"
              value={draft.answer}
              onChange={(e) => change({ answer: e.target.value })}
            />
          </Field>
          <details>
            <summary>记录思路（可选）</summary>
            <textarea
              aria-label="解题思路"
              value={draft.note}
              onChange={(e) => change({ note: e.target.value })}
              rows={3}
            />
          </details>
          <div className="answer-actions">
            <button
              className="text-button"
              onClick={() => setStarted((v) => (v ? null : Date.now()))}
            >
              {started ? "计时中 · 取消" : "开始计时"}
            </button>
            <button
              className="primary"
              disabled={busy || !draft.answer.trim()}
              onClick={() => submit()}
            >
              保存答案
            </button>
            {/^\d+$/.test(draft.question) && (
              <button
                disabled={busy || !draft.answer.trim()}
                onClick={() => submit(true)}
              >
                保存并下一题 →
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="divider" />
          <div className="section-heading">
            <h2>答案与解析</h2>
            {answerKey && (
              <button
                className="text-button"
                onClick={() => setDialog("answers")}
              >
                更新答案
              </button>
            )}
          </div>
          {answerKey ? (
            revealed ? (
              <div className="explanation">
                <span className="result">
                  {last
                    ? last.result === true
                      ? "答案一致"
                      : last.result === false
                        ? "答案不一致"
                        : "待教练核对"
                    : "参考答案"}
                </span>
                <h3>{answerKey.answer}</h3>
                <p>
                  {answerKey.explanation ||
                    "尚未补充解析。可上传解析，或让教练结合题干核对。"}
                </p>
                <small>
                  来源：用户提供{last ? ` · 我的答案：${last.answer}` : ""}
                </small>
                <button
                  className="text-button"
                  onClick={() => setRevealed(false)}
                >
                  隐藏答案
                </button>
              </div>
            ) : (
              <Empty title="先完成独立作答">
                <button onClick={() => setRevealed(true)}>
                  查看答案与解析
                </button>
              </Empty>
            )
          ) : (
            <Empty title="尚未导入标准答案">
              <p>
                {last
                  ? "作答已保存，待核对。"
                  : "可上传答案和解析，随后核对作答。"}
              </p>
              <button onClick={() => setDialog("answers")}>
                <Icon name="upload" />
                上传答案
              </button>
            </Empty>
          )}
        </section>
      </div>
      <footer className="progress-strip">
        <strong>上次词汇复习</strong>
        <span>
          {state.counts.answered ?? 0} / {state.counts.total ?? 0}
        </span>
        <progress
          value={state.counts.answered || 0}
          max={state.counts.total || 1}
        />
        <small>原进度已保留</small>
      </footer>
      {dialog && (
        <ImportDialog
          mode={dialog}
          context={{
            material: draft.material,
            unit: draft.unit,
            type: draft.type,
          }}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
