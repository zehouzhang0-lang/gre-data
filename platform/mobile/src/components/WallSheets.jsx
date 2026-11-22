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
  const alreadyRandom = filters.sort === 'random' && draft.sort === 'random';
  return <Sheet title="筛选词库" onClose={onClose} footer={<>
    <button onClick={() => setDraft({ ...emptyFilters, query: draft.query, sort: draft.sort })}>重置筛选</button>
    {alreadyRandom && <button onClick={() => onApply(draft, { reshuffle: true })}>重新随机</button>}
    <button className="primary" onClick={() => onApply(draft)}>应用筛选</button>
  </>}>
    <p className="hint">同一项可多选；不同项同时满足。关系模式会按词组排列。</p>
    <Choices label="记忆状态" options={Object.entries({ unrated: '未标记', ...ratingLabels }).map(([id, name]) => ({ id, name }))} values={draft.ratings} onChange={change('ratings')}/>
    <label className="field">排序<select value={draft.sort} onChange={e => change('sort')(e.target.value)}><option value="az">字母 A–Z</option><option value="za">字母 Z–A</option><option value="random">随机排列</option></select></label>
    <Choices label="关系 · 同组排列" options={Object.entries(relationshipLabels).map(([id, name]) => ({ id, name }))} values={draft.relations} onChange={change('relations')}/>
    {!!indexes.groups?.length && <label className="field">指定关系组<select value={draft.groups?.[0] || ''} onChange={e => setDraft(previous => ({ ...previous, groups: e.target.value ? [e.target.value] : [], relations: [] }))}><option value="">全部关系组</option>{indexes.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
    <label className="field">词库范围<select value={draft.scope} onChange={e => change('scope')(e.target.value)}><option value="all">全部单词</option><option value="due">今日待复习</option><option value="new">待首轮回忆</option><option value="missing">待补释义</option><option value="curation">待补充整理</option></select></label>
    <details className="wall-filter-more">
      <summary>更多条件</summary>
      <Choices label="语义主题" options={[...indexes.topics, { id: 'unclassified', name: '待分类' }]} values={draft.topics} onChange={change('topics')}/>
      <Choices label="首字母" letters options={'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(id => ({ id, name: id }))} values={draft.letters} onChange={change('letters')}/>
      <Choices label="收录来源" options={indexes.sources} values={draft.sources} onChange={change('sources')}/>
    </details>
  </Sheet>;
}

export function WallFontField({ value, onChange, disabled = false }) {
  return <label className="field wall-font-field">英文字号上限 <span>{value} px</span>
    <input type="range" min="12" max="22" step="0.5" aria-label="英文字号上限" aria-valuetext={`${value} 像素`}
      value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))}/>
  </label>;
}

export function WallGestureHelp({ axis = 'x' }) {
  return <ul className="wall-gesture-help">
    <li>轻触卡片翻面。普通词墙{axis === 'y' ? '上下' : '左右'}拖动翻页，按关系分组时左右滑动翻页。</li>
    <li>在普通词墙按住词卡，滑到对应的颜色标记上松开，也可滑到「分组」或「详情」。要同时标记多个词，先点「多选」，再按住其中一张已选词卡滑到颜色标记。</li>
    <li>双指上滑 Fresh 本页，双指下滑撤销上一次可撤销的标记或 Fresh。也可以用「词库操作」里的按钮。</li>
  </ul>;
}
