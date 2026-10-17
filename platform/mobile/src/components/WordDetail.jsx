import { useEffect, useState } from 'react';
import { Sheet } from './Primitives';
import { ratingLabels, wordRating, sourceLabel } from '../model.mjs';
import { definitionStatusLabels, partOfSpeechLabels } from '../../../shared/standard-definition.mjs';
import { highlightExample } from '../example-highlight.mjs';
import Pronunciation, { PronunciationSources } from './Pronunciation';
import { loadPronunciations } from '../pronunciation.mjs';

function hasExample(example) { return example?.en && example?.zh && example.kind === 'quotation'; }

function SenseExample({ example, meaning, pos, headword }) {
  const sourceLabel = `《${example.source?.publisher || '词典'}》`;
  return <div className="sense-example">
    <p className="sense-example-en" lang="en">{highlightExample(example.en, headword, pos).map((part,index) => part.highlight ? <strong className="example-keyword" key={index}>{part.text}</strong> : part.text)}</p>
    <p className="sense-example-zh" lang="zh-Hans">{example.zh}</p>
    <small className="sense-example-meaning">{pos} · {meaning}</small>
    <small className="sense-example-source">{/^https?:\/\//.test(example.source?.url || '') ? <a href={example.source.url} target="_blank" rel="noreferrer">{sourceLabel}</a> : sourceLabel}{example.source?.locator && ` · ${example.source.locator}`}</small>
  </div>;
}

export default function WordDetail({ word, state, busy, onSave, onRate, onClose }) {
  const [pronunciation, setPronunciation] = useState(null), [pronunciationLoading, setPronunciationLoading] = useState(true);
  useEffect(() => {
    let live = true; setPronunciation(null); setPronunciationLoading(true);
    loadPronunciations().then(words => { if (live) setPronunciation(Object.hasOwn(words, word.word) ? words[word.word] : null); }).catch(() => {}).finally(() => { if (live) setPronunciationLoading(false); });
    return () => { live = false; };
  }, [word.word]);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState({ pos: word.pos || '', meaning: word.meaning || '', note: word.note || '' });
  const schedule = state.spacedReview?.items.find(i => i.kind === 'word' && i.word === word.word);
  const reading = state.cardReadings?.find(item => item.word === word.word);
  const related = (state.relations?.groups || []).filter(g => !g.deleted && g.members.some(m => m.word === word.word));
  const senses = (word.senses || []).flatMap(group => group.meanings.map((meaning, index) => ({ pos: group.pos, meaning, example: group.examples?.[index] })));
  const examples = senses.filter(sense => hasExample(sense.example));
  const pending = senses.filter(sense => !hasExample(sense.example));
  return <Sheet title={word.word} className="word-detail-sheet" onClose={busy ? () => {} : onClose}>
    {editing ? <form onSubmit={async e => { e.preventDefault(); if (await onSave({ word: word.word, ...draft })) setEditing(false); }}>
      <label className="field">词性<input value={draft.pos} onChange={e => setDraft(p => ({ ...p, pos: e.target.value }))}/></label>
      <label className="field">中文释义<textarea required rows={4} value={draft.meaning} onChange={e => setDraft(p => ({ ...p, meaning: e.target.value }))}/></label>
      <label className="field">笔记<textarea rows={3} value={draft.note} onChange={e => setDraft(p => ({ ...p, note: e.target.value }))}/></label>
      <p className="hint">编辑后标为用户编辑、待核验；不改写过去轮次的答案快照。</p>
      <div className="form-actions"><button disabled={busy} type="button" onClick={() => setEditing(false)}>取消编辑</button><button disabled={busy} className="primary">保存词条</button></div>
    </form> : <>
      <Pronunciation word={word.word} entry={pronunciation} loading={pronunciationLoading}/>
      <div className="word-definition" aria-label="词义">{word.senses?.length ? <dl className="definition-overview">{word.senses.map(group => <div className="definition-row" key={group.pos}><dt title={partOfSpeechLabels[group.pos]}>{group.pos}</dt><dd>{group.meanings.join('；')}</dd></div>)}</dl> : <div className="definition-row"><span className="definition-pos">{word.pos || '词性未记录'}</span><p>{word.meaning || '待补释义'}</p></div>}</div>
      {!!related.length && <div className="detail-section"><h3>关联词组</h3>{related.map(group => <div className="detail-relation" key={group.id}><strong>{group.title}</strong><p className="english">{group.members.map(m => m.word).join(' · ')}</p>{group.note && <p>{group.note}</p>}</div>)}</div>}
      {!!senses.length && <section className="word-examples" aria-label="双语例句"><h3>双语例句</h3><div className="word-example-list">{examples.map((sense, index) => <SenseExample key={index} {...sense} headword={word.word}/>)}</div>{!!pending.length && <p className="sense-example-pending">{examples.length ? `待补例句：${pending.map(sense => `${sense.pos} ${sense.meaning}`).join('；')}` : '例句待补充'}</p>}</section>}
      <fieldset className="filter-section"><legend>按刚才的回忆标记</legend><div className="detail-ratings">{Object.entries(ratingLabels).map(([id, label]) => <button disabled={busy || !word.meaning?.trim()} key={id} className={`rating-${id}`} onClick={() => onRate(id, [word.word])}>{label}</button>)}</div></fieldset>
      <section className="detail-section detail-secondary" aria-label="词条说明与记录">
      {state.curationRequests?.some(item => item.word === word.word) && <small>待补充整理</small>}
      {(word.definition_status || word.note) && <details className="definition-notes"><summary>词义说明</summary>{word.definition_status && <small>{definitionStatusLabels[word.definition_status]}</small>}{word.note && <p>{word.note}</p>}</details>}
      <div className="detail-meta"><span>{ratingLabels[wordRating(word)] || '未标记'}</span><span>{schedule?.review_count ?? word.review_count ?? 0} 次复习</span></div>
      <div className="detail-meta" aria-label="翻阅记录"><span>翻阅 {reading?.view_count || 0} 次</span>{reading?.last_viewed_at && <time dateTime={reading.last_viewed_at}>最近翻阅 {new Date(reading.last_viewed_at).toLocaleString('zh-CN', { timeZone: state.timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>}</div>
      <button className="wide-button" onClick={() => setEditing(true)}>编辑词条</button>
      </section>
      <div className="detail-section"><h3>收录来源</h3>{word.sources?.length ? [...new Set(word.sources.map(sourceLabel))].map(text => <p key={text}>{text}</p>) : <p className="muted">未记录来源</p>}{word.captures?.map((capture, i) => <p key={i}>{capture.source?.material} · {capture.source?.unit} · {capture.context}</p>)}</div>
      <PronunciationSources entry={pronunciation}/>
    </>}
  </Sheet>;
}
