import { useEffect, useMemo, useRef, useState } from 'react';
import { clozeFor, drillResult, roundProgress, shuffled, stageLabels } from '../../../shared/word-session.mjs';
import { play, unlockSound } from '../sound.mjs';
import { useBackAction } from '../useBack';
import { Confirm, Empty, Icon } from './Primitives';

const union = (a, b) => [...new Map([...a, ...b].map(e => [e.id, e])).values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id));
export default function WordSession({ state, repo, initialWords = [], initialCount = 10, initialSession, refresh, onExit, notify, queue, onNext }) {
  const available = useMemo(() => [...new Map(initialWords.filter(w => !w.deleted && w.meaning?.trim()).map(w => [w.word, w])).values()], [initialWords]);
  const [session, setSession] = useState(initialSession), [count, setCount] = useState(() => String(Math.min(initialCount, available.length))), [passes, setPasses] = useState(2);
  const [localDrills, setLocalDrills] = useState([]), [localRecalls, setLocalRecalls] = useState([]);
  const [feedback, setFeedback] = useState(null), [answer, setAnswer] = useState(''), [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(null), [error, setError] = useState('');
  const [exitConfirm, setExitConfirm] = useState(false);
  const guard = useRef(false), startOperation = useRef(null), completionOperations = useRef(new Map());
  const streak = useRef(0), pendingCompletionSound = useRef(null);
  const current = state.reviewRounds?.find(s => s.session_id === session?.session_id) || state.vocabSessions?.find(s => s.session_id === session?.session_id) || session;
  const drills = useMemo(() => union(state.vocabDrills || [], localDrills), [state.vocabDrills, localDrills]);
  const recalls = useMemo(() => union((state.events || []).filter(e => e.kind === 'vocab_recall' && e.mode === 'multistage'), localRecalls), [state.events, localRecalls]);
  const progress = current ? roundProgress(current, drills, recalls) : null;
  const completedRoundId = progress?.complete ? current.session_id : null;
  useEffect(() => {
    if (!completedRoundId || pendingCompletionSound.current !== completedRoundId) return;
    pendingCompletionSound.current = null;
    play('complete');
  }, [completedRoundId]);
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
    unlockSound();
    guard.current = true; setBusy(true); setError('');
    try {
      const event = await repo.saveEvent(operation.kind, operation.payload, operation.id);
      setFailure(null);
      const flattened = { ...event.payload, id: event.id, recorded_at: event.recorded_at };
      if (event.kind === 'vocab_session') setSession(flattened);
      if (event.kind === 'vocab_drill') {
        setLocalDrills(p => union(p, [flattened])); setFeedback(flattened);
        if (flattened.result === 'correct') play('saved', streak.current++);
        else { streak.current = 0; play('again'); }
      }
      if (event.kind === 'vocab_recall') {
        pendingCompletionSound.current = flattened.session_id;
        setLocalRecalls(p => union(p, [flattened]));
      }
      try { await refresh(); }
      catch (e) { setError(`回答已保存，但页面刷新失败：${e.message}。可重新读取；不用重复作答。`); }
      return true;
    } catch (e) { setFailure(operation); setError(`保存失败：${e.message}。请留在此页重试，本次回答尚未保存。`); play('error'); return false; }
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
  // Between groups the header shows the whole picked set, not just the ten words that were on screen.
  const paused = !!(progress?.complete && queue);
  const wordsDone = paused ? queue.started : progress?.completed_words.length || 0, wordsTotal = paused ? queue.total : current?.words.length || 0;
  const trackNow = paused ? queue.started : progress?.passed || 0, trackMax = paused ? queue.total : progress?.total || 0;
  return <section className="screen session-screen" aria-label="背词"><header className="screen-header"><button aria-label="返回（已提交的步骤已保存）" disabled={busy} className="icon-button" onClick={requestExit}><Icon name="back"/></button><h1>{paused ? queue.base : current ? current.name || '背词' : '开始一轮'}</h1>{current && <span className="session-count" aria-label={`已背完 ${wordsDone} 词，共 ${wordsTotal} 词`}>{wordsDone}<i>/</i>{wordsTotal}</span>}</header>
    {current && <div className="session-track" role="progressbar" aria-label="这一轮的进度" aria-valuemin={0} aria-valuemax={trackMax} aria-valuenow={trackNow}><i style={{ width: `${trackMax ? trackNow / trackMax * 100 : 0}%` }}/></div>}
    <main className="screen-scroll session-content">
    {!current ? <section className="session-setup"><h2>开始一轮</h2>{available.length ? <form onSubmit={e => { e.preventDefault(); start(); }}><label className="field">本轮词数（最多 {available.length}）<input type="number" inputMode="numeric" aria-label="本轮词数" required min="1" max={available.length} step="1" value={count} disabled={busy || !!failure} onChange={e => { setCount(e.target.value); startOperation.current = null; }}/></label><label className="field">英文认义<select value={passes} disabled={busy || !!failure} onChange={e => { setPasses(Number(e.target.value)); startOperation.current = null; }}><option value="2">2 遍</option><option value="1">1 遍</option></select></label><button type="submit" className="primary wide-button" disabled={busy || !!failure}>开始复习</button></form> : <Empty title="没有可练的单词"><p>请先补充释义。</p></Empty>}</section> : progress.complete ? <section className="session-complete"><h2>{queue ? '这一组背完了' : '背完了'}</h2>{current.words.map(word => { const recall = recalls.find(r => r.session_id === current.session_id && r.word === word); return <div className="review-word-row" key={word}><strong className="english">{word}</strong><span>{recall?.self_rating === 'remembered' ? '本轮顺利' : recall?.self_rating === 'forgotten' ? '10 分钟后再练' : '明天再练'}</span></div>; })}</section> : <>
      {item ? <><div className="session-prompt"><span className="session-stage">{meaningStage && current.meaning_passes === 1 ? '认词' : stageLabels[step.stage]}</span>{meaningStage ? <h2 className="english">{item.word}</h2> : step.stage === 'cloze' ? <><p>{item.pos} {item.meaning}</p><h2 className="english">{clozeFor(item.word).display}</h2></> : <h2 className="meaning-prompt">{item.pos} {item.meaning}</h2>}</div>
        {!feedback && !failure && meaningStage && !selfCheck && <div className="meaning-choices">{choices.map((choice, i) => <button key={choice.word} disabled={busy} onClick={() => submit(null, choice.word)}><span>{String.fromCharCode(65 + i)}</span>{choice.meaning}</button>)}</div>}
        {!feedback && !failure && selfCheck && <div className="self-check">{revealed ? <><p>{item.pos} {item.meaning}</p><div className="form-actions"><button disabled={busy} onClick={() => submit('incorrect', '')}>没记住</button><button className="primary" disabled={busy} onClick={() => submit('correct', '')}>记得</button></div></> : <button disabled={busy} className="wide-button" onClick={() => setRevealed(true)}>想好了，看释义</button>}</div>}
        {!feedback && !failure && !meaningStage && <form className="spelling-form" onSubmit={e => { e.preventDefault(); if (answer.trim()) submit(); }}><input value={answer} disabled={busy} onChange={e => setAnswer(e.target.value)} aria-label="英文拼写" placeholder={step.stage === 'cloze' ? '缺失字母，或完整英文' : '输入英文'} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck="false"/><button className="primary wide-button" disabled={busy || !answer.trim()}>核对答案</button></form>}
        {feedback && <div className={`session-feedback ${feedback.result === 'correct' ? 'correct' : 'retry'}`} role="status"><h3>{feedback.result === 'correct' ? '对了' : '稍后再来一次'}</h3><p><strong className="english">{item.word}</strong> · {item.pos} {item.meaning}</p>{feedback.answer && feedback.result === 'incorrect' && <p className="hint">你的回答：{feedback.response_mode === 'choice' ? item.choices.find(c => c.word === feedback.answer)?.meaning : feedback.answer}</p>}<button disabled={busy || !!failure} className="primary wide-button" onClick={next}>{progress.pending_completions.length ? '保存本词，继续' : '继续'}</button></div>}
        {!feedback && !failure && <button className="text-button dont-know" disabled={busy} onClick={() => submit('revealed')}>暂时想不起</button>}
      </> : <section className="session-complete"><h2>都答完了</h2><button disabled={busy || !!failure} className="primary wide-button" onClick={next}>保存结果</button></section>}
    </>}
    {error && <div className="inline-error" role="alert"><p>{error}</p>{failure ? <button disabled={busy} onClick={() => execute(failure)}>重试保存</button> : <button disabled={busy} onClick={async () => { try { await refresh(); setError(''); } catch (e) { setError(`回答已保存，重新读取仍失败：${e.message}`); } }}>重新读取</button>}</div>}
  </main>
    {progress?.complete && <footer className="session-footer"><button className="primary" disabled={busy} onClick={queue ? onNext : onExit}>{queue ? '继续背词' : '完成'}</button></footer>}
    {exitConfirm && <Confirm title="还有未保存的回答" action="放弃并返回" onClose={() => setExitConfirm(false)} onConfirm={onExit}>{failure ? '本次回答保存失败。' : '当前输入尚未提交。'}已保存的步骤会保留；退出会放弃当前未保存的回答。你也可以取消，留在此页继续。</Confirm>}</section>;
}
