import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Check, ChevronLeft, List, BookOpen, Equal, TextCursorInput, Sigma } from 'lucide-react';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import { BottomNav, Sheet } from '../src/components/Primitives';
import { useBackAction, useBackBridge } from '../src/useBack';
import { unitKey, unitsFor, navigationStatus, answerReady, selectAnswer } from './navigation.mjs';
import '../src/design-tokens.css';
import '../src/mobile.css';
import './preview.css';

const types = [
  { id: 'se', name: '六选二', en: 'Sentence Equivalence', hint: '选出两个使句意等价的答案', icon: Equal },
  { id: 'tc', name: '填空', en: 'Text Completion', hint: '单空、双空、三空', icon: TextCursorInput },
  { id: 'rc', name: '阅读', en: 'Reading Comprehension', hint: '原文在上，题目在下', icon: BookOpen },
  { id: 'quant', name: '数学', en: 'Quantitative Reasoning', hint: '按原书题号查看数学原题', icon: Sigma },
];
const statusLabels = { submitted: '已提交', draft: '当前草稿', preview: '预览确认', duplicate: '同内容已做', unseen: '未作答' };
async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error((await response.json()).error || '读取失败');
  return response.json();
}
function SourceImages({ images, onEnlarge, onLoad }) {
  return images.map(image => <figure key={image.url} className="source-image">
    <button className="math-image-button" aria-label={`放大 PDF 第 ${image.page} 页原题`} onClick={() => onEnlarge(image)}>
      <img className="math-source" src={image.url} width={image.width} height={image.height} onLoad={onLoad} alt={`原书 PDF 第 ${image.page} 页，保留题目原排版`} onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement.nextElementSibling.hidden = false; }}/>
      {Number.isFinite(image.focusTop) && <span className="source-focus" aria-label="当前题目在原页中的位置" style={{ top: `${image.focusTop}%`, height: `${image.focusHeight}%` }}/>}
    </button><p hidden role="alert">原题图片未能读取，请重新打开本题。</p><figcaption>PDF 第 {image.page} 页 · 点按放大</figcaption>
  </figure>);
}
function Directory({ catalog, currentKey, type, answers, confirmed, onGo, onClose, onRefresh, refreshing, refreshError }) {
  const [directoryType, setDirectoryType] = useState(type);
  const list = catalog[directoryType]?.questions || [];
  const current = list.find(q => q.key === currentKey);
  const [unit, setUnit] = useState(current ? unitKey(current) : unitsFor(list)[0]?.key || '');
  const [search, setSearch] = useState(''), [number, setNumber] = useState(''), [filter, setFilter] = useState('all'), [page, setPage] = useState(0), [error, setError] = useState('');
  const units = unitsFor(list, search);
  const effectiveUnit = units.some(item => item.key === unit) ? unit : units[0]?.key;
  const inUnit = list.filter(q => unitKey(q) === effectiveUnit);
  const visible = inUnit.filter(q => filter === 'all' || (filter === 'submitted' ? q.submitted : filter === 'draft' ? navigationStatus(q, answers, confirmed) === 'draft' : !q.submitted && !q.sameContentDone));
  const pages = Math.max(1, Math.ceil(visible.length / 60)), currentPage = Math.min(page, pages - 1);
  const changeType = value => { setDirectoryType(value); setSearch(''); setUnit(unitsFor(catalog[value]?.questions || [])[0]?.key || ''); setNumber(''); setPage(0); setError(''); };
  return <Sheet title="题目导航" onClose={onClose} className="question-directory-sheet">
    <div className="directory-types" role="group" aria-label="题型">{types.map(item => <button key={item.id} aria-pressed={directoryType === item.id} onClick={() => changeType(item.id)}>{item.name}</button>)}</div>
    <label className="directory-field">查找单元<input value={search} onChange={event => { setSearch(event.target.value); setPage(0); setError(''); }} placeholder={directoryType === 'rc' ? '例如 Passage 120' : '例如 Section 3'}/></label>
    <label className="directory-field">{directoryType === 'rc' ? '文章' : '单元'}<select value={effectiveUnit || ''} onChange={event => { setUnit(event.target.value); setPage(0); setNumber(''); setError(''); }}>
      {!units.length && <option value="">没有匹配的单元</option>}
      {units.map(item => <option key={item.key} value={item.key}>{item.materialLabel} · {item.label}（{item.count} 题）</option>)}
    </select></label>
    <form className="question-jump" onSubmit={event => { event.preventDefault(); const target = inUnit.find(q => q.question === String(Number(number))); if (target) onGo(target); else setError('这个单元中没有该题号。'); }}>
      <label htmlFor="jump-question">题号</label><input id="jump-question" inputMode="numeric" value={number} onChange={event => { setNumber(event.target.value.replace(/\D/g, '')); setError(''); }} placeholder="原书题号"/>
      <button disabled={!number || !inUnit.length} type="submit">跳转</button>
    </form>
    {error && <p role="alert" className="directory-error">{error}</p>}
    <div className="directory-filter"><label>显示<select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="all">全部题目</option><option value="submitted">已提交记录</option><option value="unseen">尚未做过</option><option value="draft">当前草稿</option></select></label><span>{visible.length} 题</span></div>
    <div className="practice-directory">{visible.slice(currentPage * 60, (currentPage + 1) * 60).map(item => {
      const status = navigationStatus(item, answers, confirmed);
      return <button key={item.key} className={`question-number status-${status}`} aria-current={item.key === currentKey ? 'page' : undefined} aria-label={`第 ${item.question} 题，${statusLabels[status]}${item.submitted && ['draft', 'preview'].includes(status) ? '，另有已提交历史' : ''}`} onClick={() => onGo(item)}><span>{item.question}</span><small>{status === 'unseen' ? '·' : statusLabels[status]}</small></button>;
    })}</div>
    {!visible.length && <p className="directory-empty">没有符合条件的题目</p>}
    {pages > 1 && <div className="directory-pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
    <div className="directory-history"><span>历史记录只读，草稿仅本次预览保留。</span><button className="text-button" onClick={onRefresh} disabled={refreshing}>{refreshing ? '读取中…' : '刷新记录'}</button></div>
    {refreshError && <p className="directory-error" role="alert">{refreshError}</p>}
  </Sheet>;
}
function Preview() {
  const [tab, setTab] = useState('practice'), [type, setType] = useState('se'), [activeKey, setActiveKey] = useState(null);
  const [catalog, setCatalog] = useState({}), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [detail, setDetail] = useState(null), [questionError, setQuestionError] = useState(''), [reload, setReload] = useState(0);
  const [answers, setAnswers] = useState({}), [confirmed, setConfirmed] = useState({}), [redo, setRedo] = useState({});
  const [sheet, setSheet] = useState(null), [enlarged, setEnlarged] = useState(null), [activeBlank, setActiveBlank] = useState(0);
  const [split, setSplit] = useState(42), [readingSize, setReadingSize] = useState(17), [readingHeight, setReadingHeight] = useState(600);
  const scroll = useRef(null), passageScroll = useRef(null), workspace = useRef(null), drag = useRef(null), passagePositions = useRef(new Map());
  const refresh = async () => {
    setLoading(true); setError('');
    try { const data = await getJson('/preview-api/catalog?refresh=1'); setCatalog(data.catalog); setReload(value => value + 1); }
    catch (error) { setError(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!activeKey) return;
    const controller = new AbortController(); setQuestionError('');
    getJson(`/preview-api/question?key=${encodeURIComponent(activeKey)}`, controller.signal).then(setDetail).catch(error => { if (error.name !== 'AbortError') setQuestionError(error.message); });
    return () => controller.abort();
  }, [activeKey, reload]);
  const category = types.find(item => item.id === type), questions = catalog[type]?.questions || [];
  const index = questions.findIndex(q => q.key === activeKey), meta = questions[index];
  const q = detail?.key === activeKey ? detail : null;
  const selected = answers[activeKey] || [], historyLocked = (!!q?.history || !!meta?.sameContentDone) && !redo[activeKey], locked = historyLocked || !!confirmed[activeKey];
  const groups = q?.groups || [], sentenceAvailable = q?.native && q?.sentences.length && !q?.passageImages.length;
  const ready = answerReady(q, selected) && (q?.mode !== 'sentence' || sentenceAvailable);
  const passageKey = meta ? unitKey(meta) : '';
  const rememberPassage = () => { if (passageScroll.current && passageKey) passagePositions.current.set(passageKey, passageScroll.current.scrollTop); };
  const go = target => { rememberPassage(); if (target) setType(target.type); setActiveKey(target?.key || null); setSheet(null); setActiveBlank(0); };
  const restorePassage = () => { if (passageScroll.current) passageScroll.current.scrollTop = passagePositions.current.get(passageKey) || 0; };
  useEffect(() => { scroll.current?.scrollTo(0, 0); restorePassage(); }, [q?.key, passageKey, tab]);
  useEffect(() => {
    if (type !== 'rc' || !q || tab !== 'practice' || !workspace.current) return;
    const observer = new ResizeObserver(([entry]) => setReadingHeight(entry.contentRect.height));
    observer.observe(workspace.current); return () => observer.disconnect();
  }, [type, q?.key, tab]);
  const availableHeight = Math.max(1, readingHeight - 28), minimumShare = Math.min(45, Math.max(25, 140 / availableHeight * 100)), maximumShare = 100 - minimumShare;
  const actualSplit = Math.max(minimumShare, Math.min(maximumShare, split));
  const changeSplit = value => setSplit(Math.max(minimumShare, Math.min(maximumShare, value)));
  useBackBridge(); useBackAction(() => go(null), activeKey !== null, 20);
  const choose = value => { if (!locked && q) setAnswers(previous => ({ ...previous, [q.key]: selectAnswer(q, previous[q.key] || [], value) })); };
  const instructions = q?.mode === 'pair' ? '选择两个答案' : q?.mode === 'multiple' ? '选择所有适用答案' : q?.mode === 'sentence' ? '在原文中选择一个句子' : q?.mode === 'entry' ? '填写答案' : groups.length ? '每空选择一个答案' : '选择一个答案';
  const options = (letters = q.letters) => <div className="practice-options" role="group" aria-label={instructions}>
    {letters.map(letter => <button key={letter} className={`practice-option ${selected.includes(letter) ? 'chosen' : ''}`} aria-pressed={selected.includes(letter)} aria-disabled={locked} onClick={() => choose(letter)}>
      <span className={`option-letter ${['pair', 'multiple'].includes(q.mode) ? 'square' : ''}`}>{letter}</span><span>{q.options[q.letters.indexOf(letter)] || (q.mode === 'comparison' ? ({ A: 'Quantity A is greater.', B: 'Quantity B is greater.', C: 'The two quantities are equal.', D: 'The relationship cannot be determined from the information given.' })[letter] : `选项 ${letter}`)}</span>{selected.includes(letter) && <Check size={18} aria-hidden="true"/>}
    </button>)}
  </div>;
  const enlarge = image => { setEnlarged(image); setSheet('image'); };
  const start = () => { const bank = catalog[type]; go(bank?.questions.find(q => q.key === bank.recommended) || bank?.questions[0]); };
  const header = <header className="screen-header question-header"><button className="icon-button" aria-label="返回刷题" onClick={() => go(null)}><ChevronLeft size={23}/></button><div><h1>{category.name}</h1><span>{meta?.unitLabel} · 第 {meta?.question} 题</span></div><button className="icon-button" aria-label="题目导航" onClick={() => setSheet('directory')}><List size={22}/></button></header>;
  return <div className="app-shell practice-prototype">
    {tab !== 'practice' ? <section className="screen"><header className="screen-header"><h1>{{ wall: '词库', review: '复习', settings: '设置' }[tab]}</h1><span className="prototype-label">界面预览</span></header><div className="empty"><p>此页沿用现有版本</p><button onClick={() => setTab('practice')}>查看刷题预览</button></div></section>
      : !activeKey ? <section className="screen"><header className="screen-header"><h1>刷题</h1><button className="icon-button" aria-label="题目导航" disabled={!questions.length} onClick={() => setSheet('directory')}><List size={22}/></button></header>
        <main className="screen-scroll practice-home"><h2>选择题型</h2><div className="practice-types">{types.map(({ id, name, en, icon: TypeIcon }) => <button key={id} aria-pressed={type === id} onClick={() => setType(id)} className="practice-type"><TypeIcon size={25} strokeWidth={1.6}/><strong>{name}</strong><small>{en}</small></button>)}</div>
          <section className="practice-start"><div><h2>{category.name}<small className="bank-count">{questions.length} 题</small></h2><p>{category.hint}</p></div><button className="primary" disabled={!questions.length || loading} onClick={start}>{loading ? '读取题库…' : '开始练习'}<ArrowRight size={17}/></button><button className="wide-button directory-entry" disabled={!questions.length} onClick={() => setSheet('directory')}>按单元选题</button></section>
          <p className="preview-note">交互预览 · 读取已有记录，当前选择不计入学习记录。</p>{error && <div role="alert" className="directory-error">{error}<button onClick={refresh}>重试</button></div>}
        </main></section>
      : <section className="screen">{header}{!q ? <main className="screen-scroll empty" role="status">{questionError || '正在读取原题…'}{questionError && <button onClick={() => setReload(value => value + 1)}>重试</button>}</main> : <>
        <div ref={workspace} className={type === 'rc' ? 'reading-workspace' : 'question-workspace'} style={{ '--passage-share': `${actualSplit}fr`, '--question-share': `${100 - actualSplit}fr`, '--reading-size': `${readingSize}px`, '--reading-image-width': `${readingSize / 17 * 100}%` }}>
          {type === 'rc' && <><section className="reading-upper" aria-label="原文区域"><div className="reading-panel-header"><span>原文</span><div className="reading-size-controls"><button aria-label="缩小阅读字号" disabled={readingSize <= 15} onClick={() => setReadingSize(v => v - 1)}>A−</button><button aria-label="放大阅读字号" disabled={readingSize >= 22} onClick={() => setReadingSize(v => v + 1)}>A＋</button></div></div>
            <article ref={passageScroll} id="reading-passage" className="practice-passage reading-passage-scroll" tabIndex={0} aria-label="阅读原文" onScroll={rememberPassage}>
              {q.passageImages.length ? <SourceImages images={q.passageImages} onEnlarge={enlarge} onLoad={restorePassage}/> : q.mode === 'sentence' && q.sentences.length ? <p>{q.sentences.map((sentence, i) => <button className={`passage-sentence ${selected.includes(sentence) ? 'chosen' : ''}`} key={i} aria-pressed={selected.includes(sentence)} aria-disabled={locked} onClick={() => choose(sentence)}>{sentence}{' '}</button>)}</p> : q.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            </article></section>
            <div className="reading-divider" role="separator" aria-label="拖动调整原文和题目高度" aria-orientation="horizontal" aria-controls="reading-passage reading-question" aria-valuemin={Math.round(minimumShare)} aria-valuemax={Math.round(maximumShare)} aria-valuenow={Math.round(actualSplit)} aria-valuetext={`原文占 ${Math.round(actualSplit)}%`} tabIndex={0} onDoubleClick={() => setSplit(42)}
              onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, y: event.clientY, share: actualSplit }; }}
              onPointerMove={event => { if (drag.current?.id === event.pointerId) changeSplit(drag.current.share + (event.clientY - drag.current.y) / availableHeight * 100); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
              onKeyDown={event => { if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); changeSplit(event.key === 'Home' ? minimumShare : event.key === 'End' ? maximumShare : actualSplit + (event.key === 'ArrowUp' ? -5 : 5)); }}><span aria-hidden="true"/></div></>}
          <main ref={scroll} className="screen-scroll question-body" id="reading-question" tabIndex={type === 'rc' ? 0 : undefined} aria-label={type === 'rc' ? '题目区域' : undefined}>
            <div className="question-instruction"><span>{instructions}</span>{q.mode === 'pair' && <span>{selected.length} / 2 已选</span>}</div>
            {q.images.length ? <SourceImages images={q.images} onEnlarge={enlarge}/> : <p className="practice-prompt">{q.prompt}</p>}
            {q.mode === 'sentence' ? <p className="sentence-selection">{!sentenceAvailable ? '本题暂以原文图片只读展示，尚无可核实的选句文本。' : selected[0] || '点按上方原文中的句子'}</p> : groups.length ? <><div className="blank-tabs" role="group" aria-label="选择填空位置">{groups.map((group, i) => <button key={i} aria-pressed={activeBlank === i} onClick={() => setActiveBlank(i)}>空 {['(i)', '(ii)', '(iii)'][i]}<span>{group.find(letter => selected.includes(letter)) || '待选'}</span></button>)}</div>{options(groups[activeBlank])}{activeBlank < groups.length - 1 && <button className="text-button next-blank" onClick={() => setActiveBlank(v => v + 1)}>下一空 <ArrowRight size={15}/></button>}</>
              : q.mode !== 'entry' && q.letters.length ? options() : <label className="directory-field">{q.mode === 'entry' ? '答案' : '按原题填写答案'}<input value={selected[0] || ''} disabled={locked} placeholder={q.mode === 'entry' ? '输入数字、分数等' : '例如 A、C'} onChange={event => setAnswers(previous => ({ ...previous, [q.key]: [event.target.value] }))}/></label>}
            <p className="practice-source">《{q.source}》</p>
            {meta?.sameContentDone && !q.history && <section className="question-history"><strong>同内容已做</strong><p>这个原题号没有独立提交记录。</p>{historyLocked && <button className="text-button" onClick={() => setRedo(previous => ({ ...previous, [q.key]: true }))}>预览重做</button>}</section>}
            {q.history && <section className="question-history"><strong>已提交记录</strong><span>{new Date(q.history.recorded_at).toLocaleString('zh-CN', { hour12: false })} · {q.history.count ? `平台提交 ${q.history.count} 次` : '旧训练记录'}</span>{(historyLocked || confirmed[q.key]) && <p>{q.history.answer ? `原作答：${q.history.answer}` : '旧记录确认完成，未保存逐题答案。'}</p>}{historyLocked && <button className="text-button" onClick={() => setRedo(previous => ({ ...previous, [q.key]: true }))}>预览重做</button>}</section>}
            {!!confirmed[q.key] && !historyLocked && <div className="preview-feedback" role="status"><Check size={18}/><div>预览已确认<small>{selected.join('、')}</small></div><button className="text-button" onClick={() => setConfirmed(v => ({ ...v, [q.key]: false }))}>修改</button></div>}
          </main>
        </div>
        <footer className="practice-controls"><button disabled={index <= 0} onClick={() => go(questions[index - 1])}>上一题</button>{locked ? <button className="primary" onClick={() => go(questions[index + 1])}>{index === questions.length - 1 ? '返回题型' : '下一题'}</button> : <button className="primary" disabled={!ready} onClick={() => setConfirmed(v => ({ ...v, [q.key]: true }))}>确认选择</button>}{!locked && <button onClick={() => go(questions[index + 1])}>{index === questions.length - 1 ? '返回' : '下一题'}</button>}</footer>
      </>}</section>}
    <BottomNav tab={tab} onChange={id => { rememberPassage(); setTab(id); setSheet(null); }} practicePreview/>
    {sheet === 'directory' && <Directory catalog={catalog} currentKey={activeKey} type={type} answers={answers} confirmed={confirmed} onGo={go} onClose={() => setSheet(null)} onRefresh={refresh} refreshing={loading} refreshError={error}/>}
    {sheet === 'image' && enlarged && <Sheet title={`原书 PDF 第 ${enlarged.page} 页`} onClose={() => setSheet(null)}><div className="math-enlarged"><img src={enlarged.url} alt="原书放大图，可横向滚动查看"/></div></Sheet>}
  </div>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
