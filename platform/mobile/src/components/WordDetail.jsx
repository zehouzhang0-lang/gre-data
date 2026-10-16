import { useState } from 'react';
import { Sheet } from './Primitives';
import { ratingLabels, wordRating, sourceLabel } from '../model.mjs';
import { definitionStatusLabels, partOfSpeechLabels } from '../../../shared/standard-definition.mjs';

function SenseExample({ example }) {
  if (!example?.en || !example?.zh || example.kind !== 'quotation') return <small className="sense-example-pending">例句待补充</small>;
  const sourceLabel = `原例句来源：${example.source?.publisher || '词典'}`;
  return <div className="sense-example">
    <p className="sense-example-en" lang="en">{example.en}</p>
    <p className="sense-example-zh" lang="zh-Hans">{example.zh}</p>
    <small className="sense-example-source">{/^https?:\/\//.test(example.source?.url || '') ? <a href={example.source.url} target="_blank" rel="noreferrer">{sourceLabel}</a> : sourceLabel}{example.source?.locator && ` · ${example.source.locator}`}</small>
  </div>;
}

export default function WordDetail({ word, state, busy, onSave, onRate, onClose }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState({ pos: word.pos || '', meaning: word.meaning || '', note: word.note || '' });
  const schedule = state.spacedReview?.items.find(i => i.kind === 'word' && i.word === word.word);
  const related = (state.relations?.groups || []).filter(g => !g.deleted && g.members.some(m => m.word === word.word));
  return <Sheet title={word.word} className="word-detail-sheet" onClose={busy ? () => {} : onClose}>
    {editing ? <form onSubmit={async e => { e.preventDefault(); if (await onSave({ word: word.word, ...draft })) setEditing(false); }}>
      <label className="field">词性<input value={draft.pos} onChange={e => setDraft(p => ({ ...p, pos: e.target.value }))}/></label>
      <label className="field">中文释义<textarea required rows={4} value={draft.meaning} onChange={e => setDraft(p => ({ ...p, meaning: e.target.value }))}/></label>
      <label className="field">笔记<textarea rows={3} value={draft.note} onChange={e => setDraft(p => ({ ...p, note: e.target.value }))}/></label>
      <p className="hint">编辑后标为用户编辑、待核验；不改写过去轮次的答案快照。</p>
      <div className="form-actions"><button disabled={busy} type="button" onClick={() => setEditing(false)}>取消编辑</button><button disabled={busy} className="primary">保存词条</button></div>
    </form> : <>
      <div className="word-definition">{word.senses?.length ? word.senses.map(group=><section className="word-pos-group" key={group.pos}><div className="word-pos-label"><span>{group.pos}</span><small>{partOfSpeechLabels[group.pos]}</small></div><div className="word-senses">{group.meanings.map((meaning,i)=><div className="word-sense" key={i}><p className="sense-meaning">{meaning}</p><SenseExample example={group.examples?.[i]}/></div>)}</div></section>) : <><small>{word.pos || '词性未记录'}</small><p>{word.meaning || '待补释义'}</p></>}{word.definition_status&&<small>{definitionStatusLabels[word.definition_status]}</small>}{word.note && <p className="muted">{word.note}</p>}</div>
      <div className="detail-meta"><span>{ratingLabels[wordRating(word)] || '未标记'}</span><span>{schedule?.review_count ?? word.review_count ?? 0} 次复习</span></div>
      <button className="wide-button" onClick={() => setEditing(true)}>编辑词条</button>
      <fieldset className="filter-section"><legend>按刚才的回忆标记</legend><div className="detail-ratings">{Object.entries(ratingLabels).map(([id, label]) => <button disabled={busy || !word.meaning?.trim()} key={id} className={`rating-${id}`} onClick={() => onRate(id, [word.word])}>{label}</button>)}</div><p className="hint">自评影响复习排期，不等于核验掌握。</p></fieldset>
      {!!related.length && <div className="detail-section"><h3>关联词组</h3>{related.map(group => <div className="detail-relation" key={group.id}><strong>{group.title}</strong><p className="english">{group.members.map(m => m.word).join(' · ')}</p>{group.note && <p>{group.note}</p>}</div>)}</div>}
      <div className="detail-section"><h3>收录来源</h3>{word.sources?.length ? [...new Set(word.sources.map(sourceLabel))].map(text => <p key={text}>{text}</p>) : <p className="muted">未记录来源</p>}{word.captures?.map((capture, i) => <p key={i}>{capture.source?.material} · {capture.source?.unit} · {capture.context}</p>)}</div>
    </>}
  </Sheet>;
}
