import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Check, ChevronLeft, List, BookOpen, Equal, TextCursorInput, Sigma } from 'lucide-react';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import { BottomNav, Sheet } from '../src/components/Primitives';
import { useBackAction, useBackBridge } from '../src/useBack';
import '../src/design-tokens.css';
import '../src/mobile.css';
import './preview.css';
import samples from './samples.local.json';

const types = [
  { id: 'se', name: '六选二', en: 'Sentence Equivalence', hint: '选出两个使句意等价的答案', icon: Equal },
  { id: 'tc', name: '填空', en: 'Text Completion', hint: '单空、双空、三空', icon: TextCursorInput },
  { id: 'rc', name: '阅读', en: 'Reading Comprehension', hint: '原文在上，题目在下', icon: BookOpen },
  { id: 'quant', name: '数学', en: 'Quantitative Reasoning', hint: '先预览数量比较的答题布局', icon: Sigma },
];

function Preview() {
  const [tab, setTab] = useState('practice');
  const [type, setType] = useState('se'), [index, setIndex] = useState(null);
  const [answers, setAnswers] = useState({}), [confirmed, setConfirmed] = useState({});
  const [sheet, setSheet] = useState(null);
  const [activeBlank, setActiveBlank] = useState(0);
  const [split, setSplit] = useState(42), [readingSize, setReadingSize] = useState(17);
  const [readingHeight, setReadingHeight] = useState(600);
  const scroll = useRef(null), passageScroll = useRef(null), workspace = useRef(null), drag = useRef(null);
  const category = types.find(item => item.id === type);
  const questions = samples[type], q = index === null ? null : questions[index];
  const selected = answers[q?.key] || [], locked = !!confirmed[q?.key];
  const groups = q?.groups || [];
  const ready = q && (q.mode === 'pair' ? selected.length === 2 : groups.length
    ? groups.every(group => group.some(letter => selected.includes(letter))) : selected.length === 1);
  useEffect(() => { scroll.current?.scrollTo(0, 0); }, [index, type]);
  // Keep the passage position while moving between questions about the same text.
  const passageKey = q?.paragraphs.join('\n');
  useEffect(() => { passageScroll.current?.scrollTo(0, 0); }, [passageKey]);
  useEffect(() => {
    if (type !== 'rc' || index === null || tab !== 'practice' || !workspace.current) return;
    const observer = new ResizeObserver(([entry]) => setReadingHeight(entry.contentRect.height));
    observer.observe(workspace.current);
    return () => observer.disconnect();
  }, [type, index, tab]);
  const availableHeight = Math.max(1, readingHeight - 28);
  const minimumShare = Math.min(45, Math.max(25, 140 / availableHeight * 100));
  const maximumShare = 100 - minimumShare;
  const actualSplit = Math.max(minimumShare, Math.min(maximumShare, split));
  const changeSplit = value => setSplit(Math.max(minimumShare, Math.min(maximumShare, value)));
  const go = next => { setIndex(next); setSheet(null); setActiveBlank(0); };
  useBackBridge();
  useBackAction(() => go(null), index !== null, 20);
  const choose = letter => {
    if (locked) return;
    setAnswers(previous => {
      const old = previous[q.key] || [];
      let next;
      if (q.mode === 'pair') next = old.includes(letter) ? old.filter(x => x !== letter) : old.length < 2 ? [...old, letter] : old;
      else if (groups.length) {
        const group = groups.find(g => g.includes(letter));
        next = [...old.filter(x => !group.includes(x)), letter];
      } else next = [letter];
      return { ...previous, [q.key]: next };
    });
  };
  const instructions = q?.mode === 'pair' ? '选择两个答案' : groups.length ? '每空选择一个答案' : '选择一个答案';
  const options = (letters = q.letters) => <div className="practice-options" role="group" aria-label={instructions}>
    {letters.map(letter => <button key={letter} className={`practice-option ${selected.includes(letter) ? 'chosen' : ''}`}
      aria-pressed={selected.includes(letter)} aria-disabled={locked} onClick={() => choose(letter)}>
      <span className={`option-letter ${q.mode === 'pair' ? 'square' : ''}`}>{letter}</span>
      <span>{q.options[q.letters.indexOf(letter)]}</span>
      {selected.includes(letter) && <Check size={18} aria-hidden="true"/>}
    </button>)}
  </div>;
  return <div className="app-shell practice-prototype">
    {tab !== 'practice' ? <section className="screen">
      <header className="screen-header"><h1>{{ wall: '词库', review: '复习', settings: '设置' }[tab]}</h1><span className="prototype-label">界面预览</span></header>
      <div className="empty"><p>此页沿用现有版本</p><button onClick={() => setTab('practice')}>查看刷题预览</button></div>
    </section> : index === null ? <section className="screen">
      <header className="screen-header"><h1>刷题</h1><span className="prototype-label">交互预览</span></header>
      <main className="screen-scroll practice-home">
        <h2>选择题型</h2>
        <div className="practice-types">{types.map(({ id, name, en, icon: TypeIcon }) => <button key={id}
          aria-pressed={type === id} onClick={() => setType(id)} className="practice-type">
          <TypeIcon size={25} strokeWidth={1.6}/><strong>{name}</strong><small>{en}</small>
        </button>)}</div>
        <section className="practice-start">
          <div><h2>{category.name}</h2><p>{category.hint}</p></div>
          <button className="primary" onClick={() => go(0)}>开始练习 <ArrowRight size={17}/></button>
        </section>
        <p className="preview-note">仅预览交互，不判分、不保存学习记录。</p>
      </main>
    </section> : <section className="screen">
      <header className="screen-header question-header">
        <button className="icon-button" aria-label="返回刷题" onClick={() => go(null)}><ChevronLeft size={23}/></button>
        <div><h1>{category.name}</h1><span>样题 {index + 1} / {questions.length}</span></div>
        <button className="icon-button" aria-label="题目目录" onClick={() => setSheet('directory')}><List size={22}/></button>
      </header>
      <div ref={workspace} className={type === 'rc' ? 'reading-workspace' : 'question-workspace'}
        style={{ '--passage-share': `${actualSplit}fr`, '--question-share': `${100 - actualSplit}fr`, '--reading-size': `${readingSize}px` }}>
        {type === 'rc' && <>
          <section className="reading-upper" aria-label="原文区域">
            <div className="reading-panel-header"><span>原文</span><div className="reading-size-controls">
              <button aria-label="缩小阅读字号" disabled={readingSize <= 15} onClick={() => setReadingSize(v => v - 1)}>A−</button>
              <button aria-label="放大阅读字号" disabled={readingSize >= 22} onClick={() => setReadingSize(v => v + 1)}>A＋</button>
            </div></div>
            <article ref={passageScroll} id="reading-passage" className="practice-passage reading-passage-scroll" tabIndex={0} aria-label="阅读原文">
              {q.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            </article>
          </section>
          <div className="reading-divider" role="separator" aria-label="拖动调整原文和题目高度"
            aria-orientation="horizontal" aria-controls="reading-passage reading-question"
            aria-valuemin={Math.round(minimumShare)} aria-valuemax={Math.round(maximumShare)} aria-valuenow={Math.round(actualSplit)}
            aria-valuetext={`原文占 ${Math.round(actualSplit)}%`} tabIndex={0}
            onDoubleClick={() => setSplit(42)}
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: event.pointerId, y: event.clientY, share: actualSplit };
            }}
            onPointerMove={event => {
              if (drag.current?.id === event.pointerId) changeSplit(drag.current.share + (event.clientY - drag.current.y) / availableHeight * 100);
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            onLostPointerCapture={() => { drag.current = null; }}
            onKeyDown={event => {
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              changeSplit(event.key === 'Home' ? minimumShare : event.key === 'End' ? maximumShare : actualSplit + (event.key === 'ArrowUp' ? -5 : 5));
            }}><span aria-hidden="true"/></div>
        </>}
      <main ref={scroll} className="screen-scroll question-body" id="reading-question" tabIndex={type === 'rc' ? 0 : undefined} aria-label={type === 'rc' ? '题目区域' : undefined}>
          <div className="question-instruction"><span>{instructions}</span>{q.mode === 'pair' && <span>{selected.length} / 2 已选</span>}
          </div>
          {q.image ? <button className="math-image-button" aria-label="放大数学原题" onClick={() => setSheet('math')}>
            <img className="math-source" src={q.image} alt="数量比较原题：题干与 Quantity A、Quantity B，来自下方注明的教材题号"/>
          </button> :
            <p className="practice-prompt">{q.prompt}</p>}
          {groups.length ? <>
            <div className="blank-tabs" role="group" aria-label="选择填空位置">{groups.map((group, i) => <button key={i}
              aria-pressed={activeBlank === i} onClick={() => setActiveBlank(i)}>
              空 {['(i)', '(ii)', '(iii)'][i]}<span>{group.find(letter => selected.includes(letter)) || '待选'}</span>
            </button>)}</div>
            {options(groups[activeBlank])}
            {activeBlank < groups.length - 1 && <button className="text-button next-blank" onClick={() => setActiveBlank(v => v + 1)}>下一空 <ArrowRight size={15}/></button>}
          </> : options()}
          <p className="practice-source">《{q.source}》</p>
          {locked && <div className="preview-feedback" role="status"><Check size={18}/><div>已确认选择：{[...selected].sort().join('、')}<small>预览不判分，也不保存作答。</small></div>
            <button className="text-button" onClick={() => setConfirmed(v => ({ ...v, [q.key]: false }))}>修改</button>
          </div>}
      </main>
      </div>
      <footer className="practice-controls">
        <button disabled={index === 0} onClick={() => go(index - 1)}>上一题</button>
        {locked ? <button className="primary" onClick={() => go(index === questions.length - 1 ? null : index + 1)}>{index === questions.length - 1 ? '返回题型' : '下一题'}</button> :
          <button className="primary" disabled={!ready} onClick={() => setConfirmed(v => ({ ...v, [q.key]: true }))}>确认选择</button>}
        {!locked && <button onClick={() => go(index === questions.length - 1 ? null : index + 1)}>{index === questions.length - 1 ? '返回' : '跳过'}</button>}
      </footer>
    </section>}
    <BottomNav tab={tab} onChange={id => { setTab(id); setSheet(null); }} practicePreview/>
    {sheet === 'directory' && <Sheet title={`${category.name} · 样题`} onClose={() => setSheet(null)}>
      <div className="practice-directory">{questions.map((item, i) => <button key={item.key} aria-current={i === index ? 'page' : undefined}
        aria-pressed={i === index} onClick={() => go(i)}>{i + 1}{confirmed[item.key] && <Check size={13}/>}</button>)}</div>
    </Sheet>}
    {sheet === 'math' && <Sheet title="数学原题" onClose={() => setSheet(null)}>
      <div className="math-enlarged"><img src={q.image} alt="数学原题放大图，可横向滚动查看"/></div>
    </Sheet>}
  </div>;
}

createRoot(document.getElementById('root')).render(<Preview/>);
