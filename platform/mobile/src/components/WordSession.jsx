import { useMemo, useRef, useState } from 'react';
import { clozeFor, drillResult, roundProgress, shuffled, stageLabels, stagesFor } from '../../../shared/word-session.mjs';
import { useBackAction } from '../useBack';
import { Confirm, Empty, Icon } from './Primitives';

const union = (a, b) => [...new Map([...a, ...b].map(e => [e.id, e])).values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id));
export default function WordSession({ state, repo, initialWords = [], initialCount = 10, initialSession, refresh, onExit, notify }) {
  const available = useMemo(() => [...new Map(initialWords.filter(w => !w.deleted && w.meaning?.trim()).map(w => [w.word, w])).values()], [initialWords]);
  const [session, setSession] = useState(initialSession), [count, setCount] = useState(() => String(Math.min(initialCount, available.length))), [passes, setPasses] = useState(2);
  const [localDrills, setLocalDrills] = useState([]), [localRecalls, setLocalRecalls] = useState([]);
  const [feedback, setFeedback] = useState(null), [answer, setAnswer] = useState(''), [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(null), [error, setError] = useState('');
  const [exitConfirm, setExitConfirm] = useState(false);
  const guard = useRef(false), startOperation = useRef(null), completionOperations = useRef(new Map());
  const current = state.reviewRounds?.find(s => s.session_id === session?.session_id) || state.vocabSessions?.find(s => s.session_id === session?.session_id) || session;
  const drills = useMemo(() => union(state.vocabDrills || [], localDrills), [state.vocabDrills, localDrills]);
  const recalls = useMemo(() => union((state.events || []).filter(e => e.kind === 'vocab_recall' && e.mode === 'multistage'), localRecalls), [state.events, localRecalls]);
  const progress = current ? roundProgress(current, drills, recalls) : null;
  const showStepProgress = current?.words.length === 1;
  const step = feedback || (failure?.kind === 'vocab_drill' ? failure.payload : progress?.next);
  const item = current?.items.find(w => w.word === step?.word);
  const meaningStage = step?.stage?.startsWith('meaning_'), selfCheck = meaningStage && !item?.choices?.length;
  const choices = item?.choices?.length ? shuffled(item.choices, `${current.session_id}:${step.stage}:${item.word}`) : [];
  function requestExit() {
    if (guard.current) { notify('正在保存，请稍候。'); return; }
    if (failure || answer.trim() && !feedback) setExitConfirm(true);
    else onExit();
  }
  useBackAction(requestExit, true, 80);
  async function execute(operation) {
    if (guard.current) return false;
    guard.current = true; setBusy(true); setError('');
    try {
      const event = await repo.saveEvent(operation.kind, operation.payload, operation.id);
      setFailure(null);
      const flattened = { ...event.payload, id: event.id, recorded_at: event.recorded_at };
      if (event.kind === 'vocab_session') setSession(flattened);
      if (event.kind === 'vocab_drill') { setLocalDrills(p => union(p, [flattened])); setFeedback(flattened); }
      if (event.kind === 'vocab_recall') setLocalRecalls(p => union(p, [flattened]));
      try { await refresh(); }
      catch (e) { setError(`回答已保存，但页面刷新失败：${e.message}。可重新读取；不用重复作答。`); }
      return true;
    } catch (e) { setFailure(operation); setError(`保存失败：${e.message}。请留在此页重试，本次回答尚未保存。`); return false; }
    finally { guard.current = false; setBusy(false); }
  }
  function start() {
    const wordCount = Number(count);
    if (!Number.isInteger(wordCount) || wordCount < 1 || wordCount > available.length) return;
    startOperation.current ||= { kind: 'vocab_session', id: crypto.randomUUID(), payload: { session_id: crypto.randomUUID(), words: available.slice(0, wordCount).map(w => w.word), meaning_passes: passes } };
    execute(startOperation.current);
  }
  function submit(result, value = answer) {
    if (!step || !item) return;
    const payload = { session_id: current.session_id, word: item.word, stage: step.stage, answer: result === 'revealed' ? '' : value.trim(), result: result || 'correct', response_mode: meaningStage ? selfCheck ? 'self_check' : 'choice' : 'typing' };
    if (result !== 'revealed' && !selfCheck) payload.result = drillResult(item, payload);
    execute({ kind: 'vocab_drill', id: crypto.randomUUID(), payload });
  }
  async function next() {
    if (guard.current) return;
    for (const word of progress.pending_completions) {
      let operation = completionOperations.current.get(word);
      if (!operation) { operation = { kind: 'vocab_recall', id: crypto.randomUUID(), payload: { word, mode: 'multistage', session_id: current.session_id } }; completionOperations.current.set(word, operation); }
      if (!await execute(operation)) return;
    }
    setFeedback(null); setAnswer(''); setRevealed(false);
  }
  return <section className="screen session-screen" aria-label="认义与拼写复习"><header className="screen-header"><button aria-label="返回复习（已提交步骤自动保存）" disabled={busy} className="icon-button" onClick={requestExit}><Icon name="back"/></button><h1>{current ? current.name || '记忆与背诵' : '开始一轮'}</h1><span className="header-spacer"/></header><main className="screen-scroll session-content">
    {!current ? <section className="session-setup"><h2>先认得，再想得出</h2><p className="muted">英文认义 → 补全拼写 → 中文默写</p>{available.length ? <form onSubmit={e => { e.preventDefault(); start(); }}><label className="field">本轮词数（最多 {available.length}）<input type="number" inputMode="numeric" aria-label="本轮词数" required min="1" max={available.length} step="1" value={count} disabled={busy || !!failure} onChange={e => { setCount(e.target.value); startOperation.current = null; }}/></label><label className="field">英文认义<select value={passes} disabled={busy || !!failure} onChange={e => { setPasses(Number(e.target.value)); startOperation.current = null; }}><option value="2">2 遍</option><option value="1">1 遍</option></select></label><button type="submit" className="primary wide-button" disabled={busy || !!failure}>开始复习</button></form> : <Empty title="没有可练的单词"><p>请先补充释义。</p></Empty>}</section> : progress.complete ? <section className="session-complete"><h2>本轮已完成</h2><p>{current.words.length} 词 · {progress.drill_count} 次作答与补练</p>{current.words.map(word => { const recall = recalls.find(r => r.session_id === current.session_id && r.word === word); return <div className="review-word-row" key={word}><strong className="english">{word}</strong><span>{recall?.self_rating === 'remembered' ? '本轮顺利' : recall?.self_rating === 'forgotten' ? '10 分钟后再练' : '明天再练'}</span></div>; })}<button className="primary wide-button" onClick={onExit}>返回复习</button></section> : <>
      <div className="session-stage">{stageLabels[step?.stage] || '保存本轮'}{showStepProgress && <span>{progress.passed} / {progress.total} 步</span>}</div>{showStepProgress && <progress className="session-progress" aria-label="本词复习进度" value={progress.passed} max={progress.total}/>}
      {item ? <><div className="session-prompt"><small>{meaningStage ? '选择这个英文的中文义' : step.stage === 'cloze' ? '补全缺失字母' : '根据中文，写出英文'}</small>{meaningStage ? <h2 className="english">{item.word}</h2> : step.stage === 'cloze' ? <><p>{item.pos} {item.meaning}</p><h2 className="english">{clozeFor(item.word).display}</h2></> : <h2 className="meaning-prompt">{item.pos} {item.meaning}</h2>}</div>
        {!feedback && !failure && meaningStage && !selfCheck && <div className="meaning-choices">{choices.map((choice, i) => <button key={choice.word} disabled={busy} onClick={() => submit(null, choice.word)}><span>{String.fromCharCode(65 + i)}</span>{choice.meaning}</button>)}</div>}
        {!feedback && !failure && selfCheck && <div className="self-check">{revealed ? <><p>{item.pos} {item.meaning}</p><div className="form-actions"><button disabled={busy} onClick={() => submit('incorrect', '')}>没记住</button><button className="primary" disabled={busy} onClick={() => submit('correct', '')}>记得</button></div></> : <button disabled={busy} className="wide-button" onClick={() => setRevealed(true)}>我已回想，核对释义</button>}<p className="hint">没有足够互异选项，本词采用自检。</p></div>}
        {!feedback && !failure && !meaningStage && <form className="spelling-form" onSubmit={e => { e.preventDefault(); if (answer.trim()) submit(); }}><input value={answer} disabled={busy} onChange={e => setAnswer(e.target.value)} aria-label="英文拼写" placeholder={step.stage === 'cloze' ? '缺失字母，或完整英文' : '输入英文'} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck="false"/><button className="primary wide-button" disabled={busy || !answer.trim()}>核对答案</button></form>}
        {feedback && <div className={`session-feedback ${feedback.result === 'correct' ? 'correct' : 'retry'}`} role="status"><h3>{feedback.result === 'correct' ? '答对了' : '记住这个词，稍后再试'}</h3><p><strong className="english">{item.word}</strong> · {item.pos} {item.meaning}</p>{feedback.answer && feedback.result === 'incorrect' && <p className="hint">你的回答：{feedback.response_mode === 'choice' ? item.choices.find(c => c.word === feedback.answer)?.meaning : feedback.answer}</p>}<button disabled={busy || !!failure} className="primary wide-button" onClick={next}>{progress.pending_completions.length ? '保存本词，继续' : '继续'}</button></div>}
        {!feedback && !failure && <button className="text-button dont-know" disabled={busy} onClick={() => submit('revealed')}>暂时想不起</button>}
      </> : <><h2>本轮练习已完成</h2><p>保存结果，安排下次复习。</p><button disabled={busy || !!failure} className="primary" onClick={next}>保存本轮结果</button></>}
      <p className="session-foot">本轮 {current.words.length} 词 · 已完成 {progress.completed_words.length} 词 · 已保存 {progress.drill_count} 次作答</p>
    </>}
    {error && <div className="inline-error" role="alert"><p>{error}</p>{failure ? <button disabled={busy} onClick={() => execute(failure)}>重试保存</button> : <button disabled={busy} onClick={async () => { try { await refresh(); setError(''); } catch (e) { setError(`回答已保存，重新读取仍失败：${e.message}`); } }}>重新读取</button>}</div>}
  </main>{exitConfirm && <Confirm title="还有未保存的回答" action="放弃并返回" onClose={() => setExitConfirm(false)} onConfirm={onExit}>{failure ? '本次回答保存失败。' : '当前输入尚未提交。'}已保存的步骤会保留；退出会放弃当前未保存的回答。你也可以取消，留在此页继续。</Confirm>}</section>;
}
