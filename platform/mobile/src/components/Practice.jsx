import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, List } from 'lucide-react';
import { Sheet } from './Primitives';
import { useBackAction } from '../useBack';
import { getPracticeRepository } from '../practice/repository.mjs';
import { unitKey, unitsFor, answerReady, selectAnswer } from '../practice/model.mjs';
import { adjacentQuestion, swipeDirection, captureSelection } from '../practice/interaction.mjs';
import { play, unlockSound } from '../sound.mjs';
import MobileAiReview from './MobileAiReview';
import '../practice/practice.css';

const types = [
  { id: 'se', name: '六选二', short: 'SE' },
  { id: 'tc', name: '填空', short: 'TC' },
  { id: 'rc', name: '阅读', short: 'RC' },
  { id: 'quant', name: '数学', short: 'Quant' },
];
const statusLabels = { submitted: '已做', draft: '草稿', duplicate: '已做', unseen: '未做' };
const filters = [['all', '全部'], ['unseen', '未做'], ['submitted', '已做'], ['draft', '草稿']];
const HINT_KEY = 'gre-practice-capture-hint-seen';
const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } };
const rememberHint = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* 存不下就下次再提示 */ } };
const statusOf = question => question.draft ? 'draft' : question.submitted ? 'submitted' : question.sameContentDone ? 'duplicate' : 'unseen';

function SourceImages({ images, onEnlarge, onLoad }) {
  return images.map(image => <figure key={image.url} className="source-image">
    <button className="math-image-button" aria-label={`放大 PDF 第 ${image.page} 页原题`} onClick={() => onEnlarge(image)}>
      <img className="math-source" src={image.url} width={image.width} height={image.height} onLoad={onLoad}
        alt={`原书 PDF 第 ${image.page} 页，保留题目原排版`}
        onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement.nextElementSibling.hidden = false; }}/>
      {Number.isFinite(image.focusTop) && <span className="source-focus" aria-label="当前题目在原页中的位置" style={{ top: `${image.focusTop}%`, height: `${image.focusHeight}%` }}/>}
    </button><p hidden role="alert">原题图片未能读取，请重新打开本题。</p><figcaption>PDF 第 {image.page} 页 · 点按放大</figcaption>
  </figure>);
}

function Directory({ catalog, currentKey, type, onGo, onClose }) {
  const [directoryType, setDirectoryType] = useState(type);
  const list = catalog[directoryType]?.questions || [];
  const current = list.find(question => question.key === currentKey);
  const [unit, setUnit] = useState(current ? unitKey(current) : unitsFor(list)[0]?.key || '');
  const [search, setSearch] = useState(''), [number, setNumber] = useState(''), [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0), [error, setError] = useState('');
  const units = unitsFor(list, search);
  const effectiveUnit = units.some(item => item.key === unit) ? unit : units[0]?.key;
  const inUnit = list.filter(question => unitKey(question) === effectiveUnit);
  const visible = inUnit.filter(question => filter === 'all' || (filter === 'submitted' ? question.submitted
    : filter === 'draft' ? question.draft : !question.submitted && !question.sameContentDone && !question.draft));
  const pages = Math.max(1, Math.ceil(visible.length / 60)), currentPage = Math.min(page, pages - 1);
  const changeType = value => {
    setDirectoryType(value); setSearch(''); setUnit(unitsFor(catalog[value]?.questions || [])[0]?.key || '');
    setNumber(''); setPage(0); setError('');
  };
  return <Sheet title="目录" onClose={onClose} className="question-directory-sheet">
    <div className="practice-segments" role="group" aria-label="题型">{types.map(item =>
      <button key={item.id} aria-pressed={directoryType === item.id} aria-label={item.name} onClick={() => changeType(item.id)}>{item.short}</button>)}</div>
    <input className="directory-input" aria-label="搜索单元" value={search} onChange={event => { setSearch(event.target.value); setPage(0); setError(''); }} placeholder={directoryType === 'rc' ? '搜索单元，如 Passage 120' : '搜索单元，如 Section 3'}/>
    <select className="directory-input" aria-label={directoryType === 'rc' ? '文章' : '单元'} value={effectiveUnit || ''} onChange={event => { setUnit(event.target.value); setPage(0); setNumber(''); setError(''); }}>
      {!units.length && <option value="">没有匹配的单元</option>}
      {units.map(item => <option key={item.key} value={item.key}>{item.materialLabel} · {item.label}（{item.count} 题）</option>)}
    </select>
    <form className="question-jump" onSubmit={event => {
      event.preventDefault();
      const target = inUnit.find(question => question.question === String(Number(number)));
      if (target) onGo(target); else setError('这个单元没有这个题号');
    }}>
      <input className="directory-input" aria-label="题号" inputMode="numeric" enterKeyHint="go" value={number} onChange={event => { setNumber(event.target.value.replace(/\D/g, '')); setError(''); }} placeholder="题号"/>
      <button disabled={!number || !inUnit.length} type="submit">跳转</button>
    </form>
    {error && <p role="alert" className="directory-error">{error}</p>}
    <div className="practice-segments directory-filter" role="group" aria-label="状态">{filters.map(([value, text]) =>
      <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}>{text}</button>)}</div>
    <div className="practice-directory">{visible.slice(currentPage * 60, (currentPage + 1) * 60).map(item => {
      const status = statusOf(item);
      return <button key={item.key} className={`question-number status-${status}`} aria-current={item.key === currentKey ? 'page' : undefined}
        aria-label={`第 ${item.question} 题，${status === 'duplicate' ? '同内容已做' : statusLabels[status]}${item.submitted && status === 'draft' ? '，另有已做记录' : ''}`} onClick={() => onGo(item)}>
        <span>{item.question}</span>{status !== 'unseen' && <small>{statusLabels[status]}</small>}
      </button>;
    })}</div>
    {!visible.length && <p className="directory-empty">没有符合条件的题</p>}
    {pages > 1 && <div className="directory-pages"><button className="text-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}</span><button className="text-button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
  </Sheet>;
}

export default function Practice({ active, notify, vocabularyRepo, refreshVocabulary, onConnection }) {
  const [repo, setRepo] = useState(null), [practiceState, setPracticeState] = useState(null), [error, setError] = useState('');
  const [type, setType] = useState('se'), [activeKey, setActiveKey] = useState(null), [detail, setDetail] = useState(null);
  const [questionError, setQuestionError] = useState(''), [retry, setRetry] = useState(0), [selected, setSelected] = useState([]);
  const [sheet, setSheet] = useState(null), [enlarged, setEnlarged] = useState(null), [activeBlank, setActiveBlank] = useState(0);
  const [busy, setBusy] = useState(false), [saveErrors, setSaveErrors] = useState({});
  const [capture, setCapture] = useState(null), [capturing, setCapturing] = useState(false), [selecting, setSelecting] = useState(false);
  const gesture = useRef(null), suppressClickUntil = useRef(0), captureGuard = useRef(false);
  const navigationCue = useRef(null);
  const [captureHint, setCaptureHint] = useState(() => !hintSeen()), hintShown = useRef(false), [sizeMenu, setSizeMenu] = useState(false);
  const [split, setSplit] = useState(42), [readingSize, setReadingSize] = useState(17), [readingHeight, setReadingHeight] = useState(600);
  const guard = useRef(false), answerEdits = useRef(new Map()), editSequence = useRef(0), hydrated = useRef(false);
  const scroll = useRef(null), passageScroll = useRef(null), workspace = useRef(null), drag = useRef(null), passagePositions = useRef(new Map());
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const refreshSequence = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let disposed = false, unsubscribe;
    setError('');
    getPracticeRepository().then(async repository => {
      const refresh = async () => {
        const sequence = ++refreshSequence.current;
        const state = await repository.getState();
        if (disposed || sequence !== refreshSequence.current) return;
        setPracticeState(state);
        if (!hydrated.current) {
          hydrated.current = true;
          const preferences = state.preferences || {};
          if (types.some(item => item.id === preferences.type)) setType(preferences.type);
          if (preferences.activeKey && Object.values(state.catalog).some(category => category.questions.some(question => question.key === preferences.activeKey))) setActiveKey(preferences.activeKey);
          if (Number.isFinite(preferences.split)) setSplit(Math.max(25, Math.min(75, preferences.split)));
          if (Number.isFinite(preferences.readingSize)) setReadingSize(Math.max(15, Math.min(22, preferences.readingSize)));
        }
      };
      await refresh();
      if (disposed) return;
      setRepo(repository);
      unsubscribe = repository.subscribe(() => refresh().catch(error => { if (!disposed) setError(error.message); }));
    }).catch(error => { if (!disposed) setError(error.message); });
    return () => { disposed = true; unsubscribe?.(); };
  }, [retry]);

  useEffect(() => {
    if (!active) { navigationCue.current = null; return; }
    if (!repo || !activeKey) return;
    let disposed = false; setQuestionError(''); setDetail(null);
    repo.loadQuestion(activeKey).then(question => {
      if (disposed) return;
      setDetail(question);
      setSelected(answerEdits.current.get(activeKey)?.answer || question.draft?.answer || []);
      if (navigationCue.current?.key === activeKey) {
        const { name } = navigationCue.current;
        navigationCue.current = null;
        play(name);
      }
    }).catch(error => {
      if (disposed) return;
      if (navigationCue.current?.key === activeKey) navigationCue.current = null;
      setQuestionError(error.message);
    });
    return () => { disposed = true; };
  }, [repo, activeKey, retry, active]);

  useEffect(() => {
    if (!repo || !hydrated.current) return;
    const timer = setTimeout(() => {
      repo.savePreferences({ type, activeKey, split, readingSize }).catch(error => {
        if (mounted.current) setError(`阅读位置设置未保存：${error.message}`);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [repo, type, activeKey, split, readingSize]);

  const catalog = practiceState?.catalog || {}, category = types.find(item => item.id === type);
  const questions = catalog[type]?.questions || [], index = questions.findIndex(question => question.key === activeKey), meta = questions[index];
  const previousQuestion = adjacentQuestion(questions, activeKey, -1), nextQuestion = adjacentQuestion(questions, activeKey, 1);
  const q = detail?.key === activeKey ? detail : null;
  const hasDraft = !!q?.draft || !!practiceState?.drafts?.[activeKey] || answerEdits.current.has(activeKey);
  const historyLocked = !!(q?.history || meta?.sameContentDone) && !hasDraft;
  const sentenceAvailable = !!(q?.native && q?.sentences?.length && !q?.passageImages?.length);
  const locked = historyLocked || busy || (q?.mode === 'sentence' && !sentenceAvailable);
  const textAnswer = q?.answerInput === 'text';
  const groups = textAnswer ? [] : q?.groups || [], ready = answerReady(q, selected) && (q?.mode !== 'sentence' || sentenceAvailable);
  const passageKey = meta ? unitKey(meta) : '';
  const rememberPassage = () => { if (active && passageScroll.current && passageKey) passagePositions.current.set(passageKey, passageScroll.current.scrollTop); };
  const restorePassage = () => { if (passageScroll.current) passageScroll.current.scrollTop = passagePositions.current.get(passageKey) || 0; };
  const go = (target, sound) => {
    if (guard.current) return;
    navigationCue.current = sound && target && target.key !== activeKey ? { key: target.key, name: sound } : null;
    if (navigationCue.current) unlockSound();
    rememberPassage(); if (target) setType(target.type);
    setActiveKey(target?.key || null); setSheet(null); setActiveBlank(0); setCapture(null); setSelecting(false); setSizeMenu(false);
    if (hintShown.current) setCaptureHint(false);
    window.getSelection()?.removeAllRanges();
  };
  const goAdjacent = direction => go(direction < 0 ? previousQuestion : nextQuestion, direction < 0 ? 'questionPrev' : 'questionNext');
  useBackAction(() => go(null), active && activeKey !== null, 30);
  useEffect(() => {
    if (!active) { setSheet(null); return; }
    scroll.current?.scrollTo(0, 0); restorePassage();
  }, [q?.key, passageKey, active]);
  useEffect(() => {
    if (type !== 'rc' || !q || !active || !workspace.current) return;
    const observer = new ResizeObserver(([entry]) => setReadingHeight(entry.contentRect.height));
    observer.observe(workspace.current); return () => observer.disconnect();
  }, [type, q?.key, active]);
  useEffect(() => {
    const update = () => {
      if (!active || sheet || !q) return;
      const selectedText = captureSelection(window.getSelection(), workspace.current, q);
      if (selectedText) {
        gesture.current = null; suppressClickUntil.current = Date.now() + 600;
        setCapture(selectedText);
      }
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [active, sheet, q]);
  const addCapturedWord = async () => {
    if (!capture || captureGuard.current) return;
    captureGuard.current = true; setCapturing(true);
    try {
      if (!vocabularyRepo) throw Error('词库尚未载入，请稍后再试');
      const state = await vocabularyRepo.getState();
      const existing = state.vocabulary.find(item => item.word === capture.word && !item.deleted);
      if (existing) notify(`“${capture.word}”已在单词墙，原内容已保留`);
      else {
        await vocabularyRepo.saveEvent('vocab_capture', capture);
        await refreshVocabulary?.();
        notify(`已加入单词墙：${capture.word}`);
      }
      setCapture(null); window.getSelection()?.removeAllRanges();
    } catch (error) { notify(error.message, true); }
    finally { captureGuard.current = false; setCapturing(false); }
  };
  const gestureHandlers = {
    onPointerDownCapture: event => {
      gesture.current = null;
      if (busy || selecting || sheet || !['se', 'tc', 'rc'].includes(type) || !['touch', 'pen'].includes(event.pointerType)
        || event.target.closest('input, textarea, select, a, .reading-divider, .math-image-button, .reading-size-controls, .blank-tabs, .question-history, .next-blank')) return;
      if (event.target.closest('button') && !event.target.closest('.practice-option, .passage-sentence')) return;
      if (!window.getSelection()?.isCollapsed) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now(), pointerType: event.pointerType };
    },
    onPointerMoveCapture: event => {
      const start = gesture.current;
      if (start?.id !== event.pointerId) return;
      const dx = Math.abs(event.clientX - start.x), dy = Math.abs(event.clientY - start.y);
      if (dy > 12 && dy > dx || Date.now() - start.time > 450) start.cancelled = true;
    },
    onPointerUpCapture: event => {
      const start = gesture.current; gesture.current = null;
      if (start?.id !== event.pointerId) return;
      const elapsed = Date.now() - start.time;
      const direction = swipeDirection(start, { x: event.clientX, y: event.clientY, time: Date.now() }, { selection: !window.getSelection()?.isCollapsed, enabled: !busy && !selecting });
      if (elapsed > 450 || direction) suppressClickUntil.current = Date.now() + 600;
      if (direction && (direction > 0 ? nextQuestion : previousQuestion)) goAdjacent(direction);
    },
    onPointerCancelCapture: () => { gesture.current = null; suppressClickUntil.current = Date.now() + 600; },
    onClickCapture: event => {
      if (selecting || capture || Date.now() < suppressClickUntil.current || !window.getSelection()?.isCollapsed) {
        if (event.target.closest('.practice-option, .passage-sentence')) { event.preventDefault(); event.stopPropagation(); }
      }
    },
  };
  const availableHeight = Math.max(1, readingHeight - 28), minimumShare = Math.min(45, Math.max(25, 140 / availableHeight * 100)), maximumShare = 100 - minimumShare;
  const actualSplit = Math.max(minimumShare, Math.min(maximumShare, split));
  const changeSplit = value => setSplit(Math.max(minimumShare, Math.min(maximumShare, value)));

  const persistAnswer = useCallback(async (key, answer) => {
    const sequence = ++editSequence.current;
    answerEdits.current.set(key, { answer, sequence });
    try {
      await repo.saveDraft(key, answer);
      if (answerEdits.current.get(key)?.sequence === sequence) {
        answerEdits.current.delete(key);
        if (mounted.current) setSaveErrors(previous => ({ ...previous, [key]: '' }));
      }
      return true;
    } catch (error) {
      if (answerEdits.current.get(key)?.sequence === sequence && mounted.current) {
        setSaveErrors(previous => ({ ...previous, [key]: error.message }));
        notify(`草稿未保存：${error.message}`, true);
      }
      return false;
    }
  }, [repo, notify]);
  const editAnswer = answer => {
    if (locked || !q) return;
    selectedRef.current = answer; setSelected(answer);
    persistAnswer(q.key, answer);
  };
  const choose = value => { if (!locked && q && !selecting && !capture && Date.now() >= suppressClickUntil.current && window.getSelection()?.isCollapsed !== false) editAnswer(selectAnswer(q, selectedRef.current, value)); };
  const redo = async () => {
    if (guard.current || !q) return;
    guard.current = true; setBusy(true);
    try {
      await repo.startRedo(q.key);
      answerEdits.current.delete(q.key); setSelected([]); selectedRef.current = [];
      setSaveErrors(previous => ({ ...previous, [q.key]: '' }));
      setDetail(await repo.loadQuestion(q.key));
    } catch (error) { notify(error.message, true); }
    finally { guard.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (guard.current || !q || !ready || historyLocked) return;
    guard.current = true; setBusy(true);
    let committed = false;
    try {
      if (!await persistAnswer(q.key, selectedRef.current)) return;
      const saved = await repo.submit(q.key); committed = true;
      // Unlock only through an explicit new draft after the durable commit.
      setDetail(previous => ({ ...previous, draft: null, history: {
        recorded_at: saved.recorded_at, answer: saved.payload.answer,
        count: (previous.history?.count || 0) + 1, origin: 'mobile',
        result: saved.practice.result, answerKey: saved.practice.answerKey,
      } }));
      setPracticeState(await repo.getState());
      setDetail(await repo.loadQuestion(q.key));
      notify('答案已保存');
    } catch (error) {
      notify(committed ? `答案已保存，但显示刷新失败：${error.message}` : error.message, true);
    } finally { guard.current = false; setBusy(false); }
  };
  const instructions = textAnswer ? '按原题填写答案' : q?.mode === 'pair' ? '选择两个答案' : q?.mode === 'multiple' ? '选择所有适用答案'
    : q?.mode === 'sentence' ? '在原文中选择一个句子' : q?.mode === 'entry' ? '填写答案' : groups.length ? '每空选择一个答案' : '选择一个答案';
  const options = (letters = q.letters) => <div className="practice-options" role="group" aria-label={instructions}>
    {letters.map(letter => <button key={letter} className={`practice-option ${selected.includes(letter) ? 'chosen' : ''}`} aria-pressed={selected.includes(letter)} aria-disabled={locked} onClick={() => choose(letter)}>
      <span className={`option-letter ${['pair', 'multiple'].includes(q.mode) ? 'square' : ''}`}>{letter}</span>
      <span data-capture-text>{q.options[q.letters.indexOf(letter)] || (q.mode === 'comparison'
        ? ({ A: 'Quantity A is greater.', B: 'Quantity B is greater.', C: 'The two quantities are equal.', D: 'The relationship cannot be determined from the information given.' })[letter]
        : `选项 ${letter}`)}</span>{selected.includes(letter) && <Check size={18} aria-hidden="true"/>}
    </button>)}
  </div>;
  const enlarge = image => { setEnlarged(image); setSheet('image'); };
  const start = () => {
    const bank = catalog[type], target = bank?.questions.find(question => question.key === bank.recommended);
    if (target) go(target); else setSheet('directory');
  };
  const toggleSelecting = () => { setSelecting(value => !value); setCapture(null); window.getSelection()?.removeAllRanges(); };
  const header = <header className="screen-header question-header">
    <button disabled={busy} className="icon-button" aria-label="返回刷题" onClick={() => go(null)}><ChevronLeft size={23}/></button>
    <div><h1>{category.name}</h1><span>{meta?.unitLabel} · 第 {meta?.question} 题</span></div>
    {q && <button className="text-button question-select-toggle" aria-pressed={selecting} onClick={toggleSelecting}>{selecting ? '完成' : '选词'}</button>}
    <button disabled={busy} className="icon-button" aria-label="目录" onClick={() => setSheet('directory')}><List size={22}/></button>
  </header>;
  const doneCount = questions.filter(question => question.submitted || question.sameContentDone).length;
  const typeHasDraft = questions.some(question => question.draft);
  const hintVisible = captureHint && !!q;
  useEffect(() => { if (active && hintVisible) { hintShown.current = true; rememberHint(); } }, [active, hintVisible]);
  const answerKey = q?.history?.answerKey || q?.answerKey;
  return <section className="screen practice-screen" hidden={!active} aria-label="刷题">
    {!activeKey ? <><main className="screen-scroll practice-home">
        <div className="practice-home-top"><h1>刷题</h1><button className="text-button" disabled={!questions.length} onClick={() => setSheet('directory')}>目录</button></div>
        <div className="practice-segments" role="group" aria-label="题型">{types.map(({ id, name, short }) =>
          <button key={id} aria-pressed={type === id} aria-label={name} onClick={() => setType(id)}>{short}</button>)}</div>
        <p className="practice-stock" aria-label={`${category.name}，已做 ${doneCount} 题，共 ${questions.length} 题`}>{doneCount}<i>/</i><span>{questions.length}</span></p>
        <div className="practice-track" aria-hidden="true"><i style={{ width: `${questions.length ? doneCount / questions.length * 100 : 0}%` }}/></div>
        <p className="practice-stock-label">{category.name} · 已做</p>
        {error && <div role="alert" className="directory-error">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>重试</button></div>}
      </main>
      <button className="primary practice-primary" disabled={!questions.length || !repo} onClick={start}>{!repo ? '读取题库…' : typeHasDraft ? '继续作答' : catalog[type]?.recommended ? '开始' : '已做完 · 看目录'}</button></> : <>{header}{!q ? <main className="screen-scroll empty" role={questionError ? 'alert' : 'status'}>
        {questionError || '正在读取原题…'}{questionError && <button onClick={() => setRetry(value => value + 1)}>重试</button>}
      </main> : <>
        {error && <div className="practice-save-error" role="alert">{error}<button className="text-button" onClick={() => setRetry(value => value + 1)}>重试</button></div>}
        {hintVisible && <div className="practice-hint" role="note"><span>{type === 'quant' ? '长按英文可加入词库' : '长按英文可加入词库，左右滑动换题'}</span><button className="text-button" onClick={() => setCaptureHint(false)}>知道了</button></div>}
        {capture && <div className="practice-capture" role="region" aria-label="确认加入单词墙"><span>{capture.word}</span><button className="primary" disabled={capturing} onPointerDown={event => event.preventDefault()} onClick={addCapturedWord}>{capturing ? '保存中…' : '加入词库'}</button><button className="text-button" aria-label="取消选词" disabled={capturing} onClick={() => { setCapture(null); window.getSelection()?.removeAllRanges(); }}>取消</button></div>}
        <div ref={workspace} {...gestureHandlers} data-swipe-enabled={type !== 'quant' && !selecting} className={type === 'rc' ? 'reading-workspace' : 'question-workspace'} style={{ '--passage-share': `${actualSplit}fr`, '--question-share': `${100 - actualSplit}fr`, '--reading-size': `${readingSize}px`, '--reading-image-width': `${readingSize / 17 * 100}%` }}>
          {type === 'rc' && <><section className="reading-upper" aria-label="原文区域"><div className="reading-size-controls" data-open={sizeMenu || undefined}>
            {sizeMenu && <><button aria-label="缩小阅读字号" disabled={readingSize <= 15} onClick={() => setReadingSize(value => value - 1)}>A−</button>
              <button aria-label="放大阅读字号" disabled={readingSize >= 22} onClick={() => setReadingSize(value => value + 1)}>A＋</button></>}
            <button aria-label="阅读字号" aria-expanded={sizeMenu} onClick={() => setSizeMenu(value => !value)}>Aa</button>
          </div>
            <article ref={passageScroll} id="reading-passage" className="practice-passage reading-passage-scroll" tabIndex={0} aria-label="阅读原文" onScroll={rememberPassage} onPointerDown={() => setSizeMenu(false)}>
              {!q.passageImages.length && <span className="reading-size-spacer" aria-hidden="true"/>}
              {q.passageImages.length ? <SourceImages images={q.passageImages} onEnlarge={enlarge} onLoad={restorePassage}/>
                : q.mode === 'sentence' && q.sentences.length ? <p>{q.sentences.map((sentence, i) => <button
                  className={`passage-sentence ${selected.includes(sentence) ? 'chosen' : ''}`} key={i} aria-pressed={selected.includes(sentence)} aria-disabled={locked} onClick={() => choose(sentence)} data-capture-text>{sentence}{' '}</button>)}</p>
                  : q.paragraphs.map((paragraph, i) => <p key={i} data-capture-text>{paragraph}</p>)}
            </article></section>
            <div className="reading-divider" role="separator" aria-label="拖动调整原文和题目高度" aria-orientation="horizontal"
              aria-controls="reading-passage reading-question" aria-valuemin={Math.round(minimumShare)} aria-valuemax={Math.round(maximumShare)} aria-valuenow={Math.round(actualSplit)}
              aria-valuetext={`原文占 ${Math.round(actualSplit)}%`} tabIndex={0} onDoubleClick={() => setSplit(42)}
              onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, y: event.clientY, share: actualSplit }; }}
              onPointerMove={event => { if (drag.current?.id === event.pointerId) changeSplit(drag.current.share + (event.clientY - drag.current.y) / availableHeight * 100); }}
              onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
              onKeyDown={event => { if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); changeSplit(event.key === 'Home' ? minimumShare : event.key === 'End' ? maximumShare : actualSplit + (event.key === 'ArrowUp' ? -5 : 5)); }}><span aria-hidden="true"/></div></>}
          <main ref={scroll} className="screen-scroll question-body" id="reading-question" tabIndex={type === 'rc' ? 0 : undefined} aria-label={type === 'rc' ? '题目区域' : undefined}>
            <div className="question-instruction"><span>{instructions}</span>{q.mode === 'pair' && !textAnswer && <span>{selected.length} / 2</span>}</div>
            {q.images.length ? <SourceImages images={q.images} onEnlarge={enlarge}/> : <p className="practice-prompt" data-capture-text>{q.prompt}</p>}
            {q.mode === 'sentence' ? <p className="sentence-selection">{!sentenceAvailable ? '本题只有原文图片，暂不能选句。' : selected[0] || '点按原文中的句子'}</p>
              : groups.length ? <><div className="blank-tabs" role="group" aria-label="选择填空位置">{groups.map((group, i) => <button key={i} aria-pressed={activeBlank === i} onClick={() => setActiveBlank(i)}>
                空 {['(i)', '(ii)', '(iii)'][i]}<span>{group.find(letter => selected.includes(letter)) || '待选'}</span></button>)}</div>{options(groups[activeBlank])}
                {activeBlank < groups.length - 1 && <button className="text-button next-blank" onClick={() => setActiveBlank(value => value + 1)}>下一空 <ArrowRight size={15}/></button>}</>
                : !textAnswer && q.mode !== 'entry' && q.letters.length ? options() : <input className="directory-input answer-input" aria-label={instructions} value={selected[0] || ''} disabled={locked} placeholder={textAnswer ? '例如 B 或 B/D' : q.mode === 'entry' ? '输入数字、分数等' : '例如 A、C'} onChange={event => editAnswer([event.target.value])}/>}
            {saveErrors[q.key] && <div className="practice-save-error" role="alert">草稿未保存：{saveErrors[q.key]}<button className="text-button" disabled={busy} onClick={() => persistAnswer(q.key, selectedRef.current)}>重试</button></div>}
            <p className="practice-source">《{q.source}》</p>
            {meta?.sameContentDone && !q.history && <section className="question-history"><span>同内容的题已做过</span>
              {historyLocked && <button className="text-button" disabled={busy} onClick={redo}>重新作答</button>}</section>}
            {q.history && <section className="question-history">
              <span>已做 · {new Date(q.history.recorded_at).toLocaleString('zh-CN', { hour12: false })} · {q.history.count ? `提交 ${q.history.count} 次` : '旧训练记录'}</span>
              {historyLocked && <><p>{q.history.answer ? `作答：${q.history.answer}` : '旧记录未保存逐题答案'}</p>
                {typeof q.history.result === 'boolean' && <p>{q.history.result ? '与参考答案一致' : '与参考答案不一致'}</p>}
                {answerKey?.answer ? <p>参考答案{answerKey.answer_source === 'user_provided' ? '（用户提供）' : ''}：{answerKey.answer}</p> : <p>暂无参考答案</p>}
                <button className="text-button" disabled={busy} onClick={redo}>重新作答</button></>}
            </section>}
            <MobileAiReview key={`${q.key}:${q.history?.event_id || ''}`} question={q} repository={repo} vocabularyRepo={vocabularyRepo} notify={notify} onConnection={onConnection}/>
          </main>
        </div>
        <footer className="practice-controls"><button className="text-button" disabled={busy || !previousQuestion} onClick={() => goAdjacent(-1)}>上一题</button>
          {historyLocked || (q.mode === 'sentence' && !sentenceAvailable) ? <button className="primary" disabled={busy} onClick={() => goAdjacent(1)}>{nextQuestion ? '下一题' : '返回'}</button>
            : <><button className="primary" disabled={!ready || busy} onClick={submit}>{busy ? '保存中…' : '保存答案'}</button><button className="text-button" disabled={busy} onClick={() => goAdjacent(1)}>{nextQuestion ? '下一题' : '返回'}</button></>}
        </footer>
      </>}</>}
    {active && sheet === 'directory' && <Directory catalog={catalog} currentKey={activeKey} type={type} onGo={go} onClose={() => setSheet(null)}/>}
    {active && sheet === 'image' && enlarged && <Sheet title={`原书 PDF 第 ${enlarged.page} 页`} onClose={() => setSheet(null)} className="practice-image-sheet"><div className="math-enlarged"><img src={enlarged.url} alt="原书放大图，可横向滚动查看"/></div></Sheet>}
  </section>;
}
