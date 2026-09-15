import { useEffect, useMemo, useRef, useState } from "react";
import { Header, Icon, Field, Empty, Modal } from "./components";
import { request, save, keyOf, typeNames } from "./api";
import ImportDialog from "./ImportDialog";
import AiReview from "./AiReview";
import useWordCapture from "./useWordCapture";
import PdfExcerpt, { useSourcePdf } from "./PdfExcerpt";
import QuestionNavigator, { questionTitle as title } from "./QuestionNavigator";

const draftKey = "gre:practice:v3";
function readDrafts() {
  try {
    const current = JSON.parse(localStorage.getItem(draftKey));
    if (current?.drafts && current?.active) return current;
    const previous = JSON.parse(localStorage.getItem("gre:practice:v2")) || {};
    const book = { type: previous.type || "se", active: {}, drafts: {} };
    for (const type of Object.keys(typeNames)) if (previous[type]?.key) {
      book.active[type] = previous[type].key;
      book.drafts[previous[type].key] = previous[type];
    }
    return book;
  } catch { return { type: "se", active: {}, drafts: {} }; }
}
const emptyDraft = () => ({ answer: "", note: "", saved: false, attemptId: crypto.randomUUID() });
function prepare(q) {
  if (q.regions) return q;
  const letters = (q.options || []).map((_, i) => String.fromCharCode(65 + i));
  const mode = q.type === "se" ? "pair" : !letters.length ? "entry" : q.type === "tc" && /\(ii\)/i.test(q.prompt) ? "blanks" : /select all|indicate all|one or more/i.test(q.prompt) || q.type === "rc" && letters.length === 3 ? "multiple" : "single";
  return { ...q, letters, mode, groups: mode === "blanks" ? Array.from({ length: Math.ceil(letters.length / 3) }, (_, i) => letters.slice(i * 3, i * 3 + 3)) : undefined };
}

export default function Practice({ state, refresh, notify, reviewTarget, reviewSession, onReviewNext }) {
  const [draftBook] = useState(readDrafts);
  const [selectedType, setType] = useState(draftBook.type || "se");
  const type = reviewTarget?.type || selectedType;
  const [bank, setBank] = useState(null), [current, setCurrent] = useState(""), [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft);
  const { answer, note, saved } = draft;
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null), [generation, setGeneration] = useState(0);
  const banks = useRef(new Map());
  const context = useRef();
  context.current = { state, reviewSession, reviewTarget };
  const writeBusy = useRef(false);
  const bankSignature = state.questions.map(q => q.key + q.prompt + JSON.stringify(q.options)).join("|");
  function remember(key, next) {
    if (reviewTarget) reviewSession?.onDraftChange(key, next);
    else {
      draftBook.drafts[key] = next;
      try { localStorage.setItem(draftKey, JSON.stringify(draftBook)); } catch { /* The current session still keeps the draft. */ }
    }
  }
  function loadDraft(q) {
    const { state: latestState, reviewSession: session, reviewTarget: target } = context.current;
    const existing = target ? session?.drafts[q.key] : draftBook.drafts[q.key];
    if (existing) return { ...emptyDraft(), ...existing };
    const attempt = !target && latestState.attempts.find(a => keyOf(a) === q.key);
    return attempt ? { answer: attempt.answer || "", note: attempt.note || "", saved: true, attemptId: attempt.id } : emptyDraft();
  }
  function activate(q) {
    if (!q) { setCurrent(""); return; }
    setCurrent(q.key); setDraft(loadDraft(q)); setError(""); setDialog(null);
    if (!context.current.reviewTarget) {
      draftBook.type = type; draftBook.active[type] = q.key;
      try { localStorage.setItem(draftKey, JSON.stringify(draftBook)); } catch { /* Keep navigation usable when storage is unavailable. */ }
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setBank(null);
    const cacheKey = `${type}|${bankSignature}|${generation}`;
    const pending = banks.current.has(cacheKey) ? Promise.resolve(banks.current.get(cacheKey)) : request(`/api/practice?type=${type}`);
    pending.then(data => {
      if (!active) return;
      banks.current.set(cacheKey, data);
      const target = context.current.reviewTarget;
      const q = target ? data.questions.find(q => q.key === target.key) : data.questions.find(q => q.key === draftBook.active[type]) || data.questions.find(q => q.key === data.recommended) || data.questions[0];
      setBank({ ...data, type, questions: data.questions.map(prepare) });
      activate(q);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, bankSignature, generation, reviewTarget?.key]);
  const questions = bank?.questions || [], question = questions.find(q => q.key === current), index = questions.findIndex(q => q.key === current);
  const loadingQuestion = loading || !!bank && bank.type !== type || !!reviewTarget && current !== reviewTarget.key && !!question;
  const { pdf, error: pdfError } = useSourcePdf(question?.regions && (!question.native || dialog === "source") ? question.material : null);
  const captureRoot=useRef(null);
  const capture=useWordCapture({root:captureRoot,question,vocabulary:state.vocabulary,refresh,notify});
  const latest = state.attempts.find(a => a.id === draft.attemptId), answerKey = state.keys[current];
  const reviewStats = state.spacedReview?.items.find(i=>i.kind==='question'&&i.key===current);
  const completed = useMemo(() => new Set(state.attempts.map(keyOf)), [state.attempts]);
  const navigationQuestions = reviewSession?.items || questions;
  const navigationIndex = reviewSession ? reviewSession.index : index;
  const navigationDrafts = reviewSession?.drafts || draftBook.drafts;
  const selected = answer ? answer.split("/") : [];
  const valid = question && (question.mode === "pair" ? selected.length === 2 : question.mode === "blanks" ? question.groups.every(group => group.some(letter => selected.includes(letter))) : !!answer.trim());
  function choose(q) {
    if (!q || busy) return;
    if (reviewSession) reviewSession.onNavigate(reviewSession.items.findIndex(item => item.key === q.key));
    else activate(q);
  }
  function updateDraft(fields) {
    const changed = Object.hasOwn(fields, "answer") && fields.answer !== draft.answer || Object.hasOwn(fields, "note") && fields.note !== draft.note;
    const next = { ...draft, ...fields, ...(changed ? { attemptId: crypto.randomUUID() } : {}) };
    setDraft(next); remember(current, next);
  }
  function select(letter, group) {
    if (saved || busy || capture.enabled) return;
    if (group) updateDraft({ answer: [...selected.filter(v => !group.includes(v)), letter].sort().join("/") });
    else if (["pair", "multiple"].includes(question.mode)) {
      if (selected.includes(letter)) updateDraft({ answer: selected.filter(v => v !== letter).join("/") });
      else if (question.mode !== "pair" || selected.length < 2) updateDraft({ answer: [...selected, letter].sort().join("/") });
    } else updateDraft({ answer: letter });
  }
  async function submit() {
    if (!valid || writeBusy.current || saved) return;
    writeBusy.current = true;
    reviewSession?.onBusyChange(true);
    setBusy(true); setError("");
    try {
      await save("attempt", { material: question.material, unit: question.unit, question: question.question, type, answer, note, duration_seconds: null }, draft.attemptId);
      updateDraft({ saved: true });
      await refresh().catch(() => notify("答案已保存，学习记录将在恢复连接后更新"));
    } catch (e) { setError(e.message); } finally { writeBusy.current = false; setBusy(false); reviewSession?.onBusyChange(false); }
  }
  const captions = { pair: "选择两项", blanks: "每空选择一项", multiple: "选择所有符合的选项", single: "选择一项", comparison: "比较两项数量", entry: "输入答案", sentence: "点击文章中的一句" };
  const comparison = { A: "Quantity A 较大", B: "Quantity B 较大", C: "两项相等", D: "无法确定关系" };
  function options(letters, group) {
    return <div className={`answer-options ${question.mode === "comparison" || (question.native || !question.regions) && question.options?.length ? "with-text" : ""}`}>
      {letters.map(letter => <button key={letter} className={selected.includes(letter) ? "chosen" : ""} aria-pressed={selected.includes(letter)} disabled={busy || saved && !capture.enabled} onClick={() => select(letter, group)}>
        <b>{letter}</b><span data-word-source>{question.mode === "comparison" ? comparison[letter] : (question.native || !question.regions) ? question.options?.[question.letters.indexOf(letter)] || "" : ""}</span>
      </button>)}
    </div>;
  }
  return <div ref={captureRoot} className={capture.enabled?"word-capture-mode":""} onMouseDownCapture={capture.mouseDown} onContextMenuCapture={capture.contextMenu}>
    {!reviewTarget && <><Header title="刷题练习" description="接着上次练，只需作答。"><button className="text-button" onClick={() => setDialog("questions")}><Icon name="upload" />导入题目</button></Header>
    <div className="tabs" role="tablist" aria-label="题型">{Object.entries(typeNames).map(([id, name]) => <button key={id} role="tab" aria-selected={type === id} className={type === id ? "selected" : ""} disabled={busy} onClick={() => setType(id)}>{name}</button>)}</div></>}
    {loadingQuestion ? <div className="practice-loading" role="status">正在从已有教材准备题目…<small>首次整理后，本机会自动记住题目位置。</small></div> : !question ? <div className="question-review-empty">{reviewSession && <QuestionNavigator questions={reviewSession.items} current={reviewTarget.key} materials={state.materials} completed={completed} drafts={reviewSession.drafts} busy={busy} review onChoose={choose} onFinish={reviewSession.onFinish} />}<Empty title={error || (reviewTarget ? "暂时找不到本题原文，记录仍保留" : "暂无可练习题目")} >{reviewTarget && <button onClick={reviewSession ? () => reviewSession.index < reviewSession.items.length - 1 ? reviewSession.onNavigate(reviewSession.index + 1) : reviewSession.onFinish() : onReviewNext}>跳过这题</button>}<button onClick={() => setGeneration(g => g + 1)}>重新读取</button><button onClick={() => setDialog("questions")}>导入题目</button></Empty></div> : <div className="guided-practice">
      <QuestionNavigator questions={navigationQuestions} current={current} materials={state.materials} completed={completed} drafts={navigationDrafts} busy={busy} review={!!reviewSession} onChoose={choose} onFinish={reviewSession?.onFinish} />
      <div className="word-capture-toolbar"><button aria-pressed={capture.enabled} onClick={capture.toggle} disabled={capture.saving}>{capture.enabled?"退出选词":"选词"}</button>{capture.enabled && <span>{capture.saving?"正在收录…":"划选单词后右键收录 · Esc 退出"}</span>}</div>
      <div className="practice-heading"><div><small>{state.materials.find(m => m.id === question.material)?.filename.replace(/\.pdf$/i, "") || "导入题目"}</small><h2>{title(question)}</h2></div></div>
      <div className={`practice-content ${question.passageRegions?.length ? "has-passage" : ""}`}>
        {!!question.passageRegions?.length && <section className="reading-passage" aria-label="阅读文章"><h3>文章</h3>{question.mode === "sentence" && question.sentences?.length ? <div className="sentence-passage">{question.sentences.map((sentence, i) => <button key={i} disabled={busy || saved && !capture.enabled} className={answer === sentence ? "chosen" : ""} aria-pressed={answer === sentence} onClick={() => {if(!capture.enabled && !saved && !busy)updateDraft({ answer: sentence });}}><span data-word-source>{sentence}</span></button>)}</div> : question.native ? <div className="native-passage" data-word-source>{question.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div> : <PdfExcerpt selectable={capture.enabled} pdf={pdf} regions={question.passageRegions} label={`${question.unit} 文章原文`} />}</section>}
        <section className="question-workspace" aria-label="当前练习题">
          {pdfError && <p role="alert" className="error">{pdfError}</p>}
          <div className={`question-source ${type === "quant" ? "quant-source" : ""}`}>{question.regions && !question.native ? <PdfExcerpt selectable={capture.enabled} pdf={pdf} regions={question.regions} label={title(question)} /> : <p className="imported-prompt" data-word-source>{question.prompt}</p>}</div>
          <div className="guided-answer">
            <div className="section-heading"><h3>{captions[question.mode]}</h3>{question.mode === "pair" && <small>{selected.length} / 2</small>}</div>
            {question.mode === "blanks" ? question.groups.map((group, i) => <div className="blank-choice" key={i}><span>空 {i + 1}</span>{options(group, group)}</div>) : question.mode === "entry" ? <Field label="我的答案"><input autoComplete="off" disabled={busy || saved} placeholder={type === "quant" ? "输入数值、分数或原题选项" : "填写作答"} value={answer} onChange={e => updateDraft({ answer: e.target.value })} /></Field> : question.mode === "sentence" ? <p className="answer-hint">{answer ? "已选中一句，保存即可。" : "在文章中直接点选。"}</p> : options(question.letters)}
            <details className="optional-note"><summary>补充思路</summary><textarea aria-label="解题思路" rows={3} disabled={busy || saved} value={note} onChange={e => updateDraft({ note: e.target.value })} /></details>
            {saved && <div className="answer-feedback" role="status"><strong>{answerKey ? latest?.result === true ? "答案一致" : latest?.result === false ? "答案不一致" : "待核对" : "已记录 · 待核对"}</strong>{answerKey ? <><p>参考答案：{answerKey.answer} <small>用户提供</small></p><p>{answerKey.explanation || "尚未补充解析。"}</p></> : <p>这份教材尚未附答案，作答已保留。</p>}<button className="text-button" onClick={() => setDialog("answers")}>{answerKey ? "更新答案与解析" : "补充答案与解析"}</button></div>}
            {error && <p role="alert" className="error">{error}</p>}
            <div className="question-save-state"><span className={saved ? "saved-label" : ""}>{saved ? "本题答案已保存" : answer || note ? "草稿已保留 · 保存后计入学习记录" : reviewTarget ? `已复习 ${reviewStats?.review_count || 0} 次` : "选择答案后保存"}</span>{saved && <button className="text-button" disabled={busy} onClick={() => { const next = emptyDraft(); setDraft(next); remember(current, next); setError(""); }}>重做本题</button>}</div>
            {saved && reviewStats && <p className="review-next">{reviewStats.retry_at?`下次复习：${new Date(reviewStats.retry_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:state.spacedReview.time_zone})} 再练`:`下次复习：${reviewStats.due_date}`} · 已复习 {reviewStats.review_count} 次</p>}
            {latest && saved && <AiReview key={latest.id} state={state} refresh={refresh} attempt={latest} />}
          </div>
        </section>
      </div>
      <div className="question-action-dock" aria-label="答题操作"><button disabled={busy || navigationIndex <= 0} onClick={() => choose(navigationQuestions[navigationIndex - 1])}>← 上一题</button><button className="primary" disabled={!valid || busy || saved} onClick={submit}>{busy ? "正在保存…" : "保存答案"}</button><button disabled={busy || navigationIndex >= navigationQuestions.length - 1} onClick={() => choose(navigationQuestions[navigationIndex + 1])}>下一题 →</button></div>
      <div className="practice-footnote"><span>{reviewTarget ? "本轮独立作答 · 保存后计入复习次数" : `已有 ${questions.filter(q => completed.has(q.key)).length} 题作答记录`}</span>{question.regions && <button className="text-button" onClick={() => setDialog("source")}>查看原题 ↗</button>}</div>
    </div>}
    {dialog === "source" && question && <Modal title="教材原题" onClose={() => setDialog(null)}>{pdfError && <p role="alert">{pdfError}</p>}<div className="original-source">{!!question.passageRegions?.length && <PdfExcerpt selectable={capture.enabled} pdf={pdf} regions={question.passageRegions} label="文章原文" />}<PdfExcerpt selectable={capture.enabled} pdf={pdf} regions={question.regions} label={title(question)} /></div><a href={`/api/material/${encodeURIComponent(question.material)}#page=${question.regions[0].page}`} target="_blank" rel="noreferrer">打开完整 PDF ↗</a></Modal>}
    {dialog && dialog !== "source" && <ImportDialog mode={dialog} context={{ material: question?.material || "text_completion_2000", unit: question?.unit || "default", type }} onClose={() => setDialog(null)} onSaved={async () => { await refresh(); notify("导入已保存"); }} />}
  </div>;
}
