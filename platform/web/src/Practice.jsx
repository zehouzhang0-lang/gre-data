import { useEffect, useRef, useState } from "react";
import { Header, Icon, Field, Empty, Modal } from "./components";
import { request, save, keyOf, typeNames } from "./api";
import ImportDialog from "./ImportDialog";
import PdfExcerpt, { useSourcePdf } from "./PdfExcerpt";

const draftKey = "gre:practice:v2";
function readDraft() { try { return JSON.parse(localStorage.getItem(draftKey)) || {}; } catch { return {}; } }
function title(q) {
  return `${q.unit.replace(/^test(\d+)_section(\d+)_(\w+)$/, "Test $1 · Section $2 · $3").replace(/^passage(\d+)$/, "Passage $1").replace(/^section(\d+)_(\w+)$/, "Section $1 · $2")} · 第 ${q.question} 题`;
}
function prepare(q) {
  if (q.regions) return q;
  const letters = (q.options || []).map((_, i) => String.fromCharCode(65 + i));
  const mode = q.type === "se" ? "pair" : !letters.length ? "entry" : q.type === "tc" && /\(ii\)/i.test(q.prompt) ? "blanks" : /select all|indicate all|one or more/i.test(q.prompt) || q.type === "rc" && letters.length === 3 ? "multiple" : "single";
  return { ...q, letters, mode, groups: mode === "blanks" ? Array.from({ length: Math.ceil(letters.length / 3) }, (_, i) => letters.slice(i * 3, i * 3 + 3)) : undefined };
}

export default function Practice({ state, refresh, notify }) {
  const [type, setType] = useState(() => readDraft().type || "se");
  const [bank, setBank] = useState(null), [current, setCurrent] = useState(""), [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState(""), [note, setNote] = useState(""), [saved, setSaved] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null), [generation, setGeneration] = useState(0);
  const attemptId = useRef(crypto.randomUUID());
  const bankSignature = state.questions.map(q => q.key + q.prompt + JSON.stringify(q.options)).join("|");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setBank(null);
    request(`/api/practice?type=${type}`).then(data => {
      if (!active) return;
      const draft = readDraft()[type];
      const q = data.questions.find(q => q.key === draft?.key) || data.questions.find(q => q.key === data.recommended);
      setBank({ ...data, type, questions: data.questions.map(prepare) });
      setCurrent(q?.key || "");
      setAnswer(q?.key === draft?.key ? draft.answer || "" : "");
      setNote(q?.key === draft?.key ? draft.note || "" : "");
      setSaved(q?.key === draft?.key && !!draft.saved);
      attemptId.current = q?.key === draft?.key && draft.attemptId ? draft.attemptId : crypto.randomUUID();
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, bankSignature, generation]);
  useEffect(() => {
    if (loading || !current || bank?.type !== type) return;
    localStorage.setItem(draftKey, JSON.stringify({ ...readDraft(), type, [type]: { key: current, answer, note, saved, attemptId: attemptId.current } }));
  }, [type, current, answer, note, saved, loading]);
  const questions = bank?.questions || [], question = questions.find(q => q.key === current), index = questions.findIndex(q => q.key === current);
  const { pdf, error: pdfError } = useSourcePdf(question?.regions && (!question.native || dialog === "source") ? question.material : null);
  const latest = state.attempts.find(a => keyOf(a) === current), answerKey = state.keys[current];
  const selected = answer ? answer.split("/") : [];
  const valid = question && (question.mode === "pair" ? selected.length === 2 : question.mode === "blanks" ? question.groups.every(group => group.some(letter => selected.includes(letter))) : !!answer.trim());
  function choose(q) {
    if (!q || busy) return;
    setCurrent(q.key); setAnswer(""); setNote(""); setSaved(false); setError(""); setDialog(null);
    attemptId.current = crypto.randomUUID();
  }
  function select(letter, group) {
    if (saved || busy) return;
    attemptId.current = crypto.randomUUID();
    if (group) setAnswer([...selected.filter(v => !group.includes(v)), letter].sort().join("/"));
    else if (["pair", "multiple"].includes(question.mode)) {
      if (selected.includes(letter)) setAnswer(selected.filter(v => v !== letter).join("/"));
      else if (question.mode !== "pair" || selected.length < 2) setAnswer([...selected, letter].sort().join("/"));
    } else setAnswer(letter);
  }
  async function submit() {
    if (!valid || busy || saved) return;
    setBusy(true); setError("");
    try {
      await save("attempt", { material: question.material, unit: question.unit, question: question.question, type, answer, note, duration_seconds: null }, attemptId.current);
      setSaved(true);
      setBank(b => ({ ...b, completed: [...new Set([...b.completed, current])] }));
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const captions = { pair: "选择两项", blanks: "每空选择一项", multiple: "选择所有符合的选项", single: "选择一项", comparison: "比较两项数量", entry: "输入答案", sentence: "点击文章中的一句" };
  const comparison = { A: "Quantity A 较大", B: "Quantity B 较大", C: "两项相等", D: "无法确定关系" };
  function options(letters, group) {
    return <div className={`answer-options ${question.mode === "comparison" || (question.native || !question.regions) && question.options?.length ? "with-text" : ""}`}>
      {letters.map(letter => <button key={letter} className={selected.includes(letter) ? "chosen" : ""} aria-pressed={selected.includes(letter)} disabled={busy || saved} onClick={() => select(letter, group)}>
        <b>{letter}</b>{question.mode === "comparison" ? comparison[letter] : (question.native || !question.regions) ? question.options?.[question.letters.indexOf(letter)] || "" : ""}
      </button>)}
    </div>;
  }
  return <>
    <Header title="刷题练习" description="接着上次练，只需作答。"><button className="text-button" onClick={() => setDialog("questions")}><Icon name="upload" />导入题目</button></Header>
    <div className="tabs" role="tablist" aria-label="题型">{Object.entries(typeNames).map(([id, name]) => <button key={id} role="tab" aria-selected={type === id} className={type === id ? "selected" : ""} disabled={busy} onClick={() => setType(id)}>{name}</button>)}</div>
    {loading ? <div className="practice-loading" role="status">正在从已有教材准备题目…<small>首次整理后，本机会自动记住题目位置。</small></div> : !question ? <Empty title={error || "暂无可练习题目"}><button onClick={() => setGeneration(g => g + 1)}>重新读取</button><button onClick={() => setDialog("questions")}>导入题目</button></Empty> : <div className="guided-practice">
      <div className="practice-heading"><div><small>{state.materials.find(m => m.id === question.material)?.filename.replace(/\.pdf$/i, "") || "导入题目"}</small><h2>{title(question)}</h2></div><div className="question-navigation"><button className="text-button" disabled={busy || index < 1} onClick={() => choose(questions[index - 1])}>← 上一题</button><button disabled={busy} onClick={() => setDialog("jump")}>换题</button></div></div>
      <div className={`practice-content ${question.passageRegions?.length ? "has-passage" : ""}`}>
        {!!question.passageRegions?.length && <section className="reading-passage" aria-label="阅读文章"><h3>文章</h3>{question.mode === "sentence" && question.sentences?.length ? <div className="sentence-passage">{question.sentences.map((sentence, i) => <button key={i} disabled={busy || saved} className={answer === sentence ? "chosen" : ""} aria-pressed={answer === sentence} onClick={() => setAnswer(sentence)}>{sentence}</button>)}</div> : question.native ? <div className="native-passage">{question.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div> : <PdfExcerpt pdf={pdf} regions={question.passageRegions} label={`${question.unit} 文章原文`} />}</section>}
        <section className="question-workspace" aria-label="当前练习题">
          {pdfError && <p role="alert" className="error">{pdfError}</p>}
          <div className={`question-source ${type === "quant" ? "quant-source" : ""}`}>{question.regions && !question.native ? <PdfExcerpt pdf={pdf} regions={question.regions} label={title(question)} /> : <p className="imported-prompt">{question.prompt}</p>}</div>
          <div className="guided-answer">
            <div className="section-heading"><h3>{captions[question.mode]}</h3>{question.mode === "pair" && <small>{selected.length} / 2</small>}</div>
            {question.mode === "blanks" ? question.groups.map((group, i) => <div className="blank-choice" key={i}><span>空 {i + 1}</span>{options(group, group)}</div>) : question.mode === "entry" ? <Field label="我的答案"><input autoComplete="off" disabled={busy || saved} placeholder={type === "quant" ? "输入数值、分数或原题选项" : "填写作答"} value={answer} onChange={e => setAnswer(e.target.value)} /></Field> : question.mode === "sentence" ? <p className="answer-hint">{answer ? "已选中一句，提交即可。" : "在文章中直接点选。"}</p> : options(question.letters)}
            <details className="optional-note"><summary>补充思路</summary><textarea aria-label="解题思路" rows={3} disabled={busy || saved} value={note} onChange={e => setNote(e.target.value)} /></details>
            {saved && <div className="answer-feedback" role="status"><strong>{answerKey ? latest?.result === true ? "答案一致" : latest?.result === false ? "答案不一致" : "待核对" : "已记录 · 待核对"}</strong>{answerKey ? <><p>参考答案：{answerKey.answer} <small>用户提供</small></p><p>{answerKey.explanation || "尚未补充解析。"}</p></> : <p>这份教材尚未附答案，作答已保留。</p>}<button className="text-button" onClick={() => setDialog("answers")}>{answerKey ? "更新答案与解析" : "补充答案与解析"}</button></div>}
            {error && <p role="alert" className="error">{error}</p>}
            <div className="guided-actions"><span>{index + 1} / {questions.length}</span>{!saved && <button className="text-button" disabled={busy || index === questions.length - 1} onClick={() => choose(questions[index + 1])}>暂时跳过</button>}{saved ? <button className="primary" disabled={index === questions.length - 1} onClick={() => choose(questions[index + 1])}>{index === questions.length - 1 ? "本题型已到最后一题" : "下一题 →"}</button> : <button className="primary" disabled={!valid || busy} onClick={submit}>{busy ? "正在保存…" : "提交答案"}</button>}</div>
            {latest && !saved && <small className="prior-attempt">上次作答：{latest.answer} · {latest.result === null ? "待核对" : latest.result ? "答案一致" : "答案不一致"}</small>}
          </div>
        </section>
      </div>
      <div className="practice-footnote"><span>作答后自动保存进度 · 已有 {bank.completed.length} 题作答记录</span>{question.regions && <button className="text-button" onClick={() => setDialog("source")}>查看原题 ↗</button>}</div>
    </div>}
    {dialog === "source" && question && <Modal title="教材原题" onClose={() => setDialog(null)}>{pdfError && <p role="alert">{pdfError}</p>}<div className="original-source">{!!question.passageRegions?.length && <PdfExcerpt pdf={pdf} regions={question.passageRegions} label="文章原文" />}<PdfExcerpt pdf={pdf} regions={question.regions} label={title(question)} /></div><a href={`/api/material/${encodeURIComponent(question.material)}#page=${question.regions[0].page}`} target="_blank" rel="noreferrer">打开完整 PDF ↗</a></Modal>}
    {dialog === "jump" && <Modal title="选择练习" onClose={() => setDialog(null)}><div className="question-picker">{questions.map((q, i) => <button key={q.key} className={q.key === current ? "chosen" : ""} onClick={() => choose(q)}><span>{title(q)}</span><small>{bank.completed.includes(q.key) ? "已作答" : `第 ${i + 1} 题`}</small></button>)}</div></Modal>}
    {dialog && !["jump", "source"].includes(dialog) && <ImportDialog mode={dialog} context={{ material: question?.material || "text_completion_2000", unit: question?.unit || "default", type }} onClose={() => setDialog(null)} onSaved={async () => { await refresh(); notify("导入已保存"); }} />}
  </>;
}
