import { useState } from 'react';
import { Sheet } from './Primitives';
import { emptyFilters, ratingLabels, relationshipLabels } from '../model.mjs';

function Choices({ label, options, values, onChange, letters = false }) {
  const toggle = id => onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  return <fieldset className="filter-section"><legend>{label}</legend><div className={`choice-list ${letters ? 'letter-list' : ''}`}>
    <button type="button" aria-pressed={!values.length} onClick={() => onChange([])}>全部</button>
    {options.map(o => <button type="button" key={o.id} aria-pressed={values.includes(o.id)} onClick={() => toggle(o.id)}>{o.name}</button>)}
  </div></fieldset>;
}
export function FilterSheet({ filters, indexes, onApply, onClose }) {
  const [draft, setDraft] = useState(filters);
  const change = key => value => setDraft(p => ({ ...p, [key]: value }));
  return <Sheet title="筛选词库" onClose={onClose} footer={<><button onClick={() => setDraft({ ...emptyFilters, query: draft.query, sort: draft.sort })}>重置筛选</button><button className="primary" onClick={() => onApply(draft)}>应用筛选</button></>}>
    <p className="hint">同一项可多选；不同项同时满足。关系模式会按词组排列。</p>
    <label className="field">复习范围<select value={draft.scope} onChange={e => change('scope')(e.target.value)}><option value="all">全部单词</option><option value="due">今日待复习</option><option value="new">待首轮回忆</option><option value="missing">待补释义</option></select></label>
    <Choices label="语义主题" options={[...indexes.topics, { id: 'unclassified', name: '待分类' }]} values={draft.topics} onChange={change('topics')}/>
    <Choices label="关系 · 同组排列" options={Object.entries(relationshipLabels).map(([id, name]) => ({ id, name }))} values={draft.relations} onChange={change('relations')}/>
    <Choices label="记忆状态" options={Object.entries({ unrated: '未标记', ...ratingLabels }).map(([id, name]) => ({ id, name }))} values={draft.ratings} onChange={change('ratings')}/>
    <Choices label="首字母" letters options={'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(id => ({ id, name: id }))} values={draft.letters} onChange={change('letters')}/>
    <Choices label="收录来源" options={indexes.sources} values={draft.sources} onChange={change('sources')}/>
  </Sheet>;
}
export function SizeSheet({ display, onChange, onClose, busy = false }) {
  return <Sheet title="尺寸与排布" onClose={busy ? () => {} : onClose} footer={<button className="primary" disabled={busy} onClick={onClose}>{busy ? '保存中…' : '完成'}</button>}>
    <fieldset className="filter-section"><legend>每行列数</legend><div className="segmented">{[2, 3, 4].map(n => <button key={n} aria-pressed={display.columns === n} onClick={() => onChange({ ...display, columns: n })}>{n} 列</button>)}</div></fieldset>
    <label className="field">卡片高度 <span>{display.height} px</span><input type="range" min="48" max="100" step="2" aria-label="卡片高度" value={display.height} onChange={e => onChange({ ...display, height: Number(e.target.value) })}/></label>
    <label className="field">英文字号 <span>{display.font} px</span><input type="range" min="12" max="22" step="0.5" aria-label="英文字号" value={display.font} onChange={e => onChange({ ...display, font: Number(e.target.value) })}/></label>
    <p className="hint">每页最多 60 张卡片；行数随列数调整。长词保留完整拼写，必要时折行。</p>
  </Sheet>;
}
export function SortSheet({ sort, onChange, onClose }) {
  return <Sheet title="排序" onClose={onClose}><div className="action-list">{[['az', '字母 A–Z'], ['za', '字母 Z–A'], ['random', '随机排列']].map(([id, text]) => <button key={id} aria-pressed={sort === id} onClick={() => onChange(id)}>{text}</button>)}</div></Sheet>;
}
export function SearchSheet({ query, onApply, onClose }) {
  const [value, setValue] = useState(query);
  return <Sheet title="搜索单词" onClose={onClose}><form className="search-form" onSubmit={e => { e.preventDefault(); onApply(value); }}><label className="field">英文、中文释义或笔记<input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="搜索单词" aria-label="搜索词库" type="search" autoCapitalize="none"/></label><div className="form-actions"><button type="button" onClick={() => onApply('')}>清除搜索</button><button className="primary" type="submit">搜索</button></div></form></Sheet>;
}
