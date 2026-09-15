import { useDeferredValue, useMemo, useState } from 'react';
import { Header, Modal, Field, Empty } from './components';
import { save } from './api';

const types = { synonym: '近义词', antonym: '反义词', lookalike: '形近词' };
const blank = (type = 'synonym', words = []) => ({ id: crypto.randomUUID(), type, title: '', note: '', members: words.map(word => ({ word, usage: '', example: '' })) });

export default function WordRelations({ state, refresh, notify, startRecall, initialSearch = '', back }) {
  const [search, setSearch] = useState(initialSearch), [topic, setTopic] = useState('all'), [tab, setTab] = useState(initialSearch ? 'synonym' : 'words');
  const [limit, setLimit] = useState(30), [removed, setRemoved] = useState(false), [edit, setEdit] = useState(null), [detail, setDetail] = useState(null);
  const [reveal, setReveal] = useState(true), [classify, setClassify] = useState(null), [manage, setManage] = useState(false), [topicDraft, setTopicDraft] = useState({ id: '', name: '' });
  const [candidate, setCandidate] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const query = useDeferredValue(search.trim().toLowerCase());
  const relations = state.relations || { topics: [], assignments: [], groups: [], suggestions: [] };
  const topics = relations.topics.filter(t => !t.deleted);
  const wordMap = useMemo(() => new Map(state.vocabulary.filter(w => !w.deleted).map(w => [w.word, w])), [state.vocabulary]);
  const assignment = new Map(relations.assignments.map(a => [a.word, a]));
  const inTopic = word => topic === 'all' || (topic === 'none' ? !assignment.get(word)?.topics.length : assignment.get(word)?.topics.includes(topic));
  const words = [...wordMap.values()].filter(w => inTopic(w.word) && `${w.word} ${w.meaning}`.toLowerCase().includes(query));
  const groups = relations.groups.filter(g => g.type === tab && !!g.deleted === removed && g.members.some(m => inTopic(m.word)) && `${g.title} ${g.note} ${g.members.map(m => `${m.word} ${m.usage} ${wordMap.get(m.word)?.meaning || ''}`).join(' ')}`.toLowerCase().includes(query));
  const suggestions = relations.suggestions.filter(s => s.words.some(inTopic) && s.words.some(w => `${w} ${wordMap.get(w)?.meaning || ''}`.toLowerCase().includes(query)));
  const currentDetail = detail && relations.groups.find(g => g.id === detail.id);
  const detailWords = currentDetail?.members.map(m => wordMap.get(m.word)).filter(Boolean) || [];
  async function mutate(kind, payload) {
    setBusy(true); setError('');
    try { await save(kind, payload); await refresh(); notify('分类与关联已保存'); return true; }
    catch(e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  function openEdit(value) { setError(''); setCandidate(''); setEdit(structuredClone(value)); }
  function selectTab(value) { setTab(value); setLimit(30); setRemoved(false); }
  function memberChange(index, key, value) { setEdit(old => ({ ...old, members: old.members.map((m,i) => i === index ? { ...m, [key]:value } : m) })); }
  const errorText = error && <p role="alert" className="error">{error}</p>;
  return <>
    <Header title="分类与关联" description="在语境中辨义，把容易混淆的词放在一起记。">
      <button onClick={back}>返回生词本</button>
      <button disabled={!words.length} onClick={() => startRecall(words)}>背诵当前词表</button>
      <button className="primary" onClick={() => openEdit(blank(tab === 'words' ? 'synonym' : tab))}>新增词组</button>
    </Header>
    <div className="relation-layout">
      <aside className="topic-panel" aria-label="语义主题">
        <div className="topic-heading"><strong>语义主题</strong><button className="text-button" onClick={() => { setError(''); setManage(true); }}>管理</button></div>
        <div className="topic-list">
          {[{ id: 'all', name: '全部主题' }, ...topics, { id: 'none', name: '待分类' }].map(t => <button key={t.id} aria-pressed={topic === t.id} className={topic === t.id ? 'selected' : ''} onClick={() => { setTopic(t.id); setLimit(30); }}>
            <span>{t.name}</span><small>{t.id === 'all' ? wordMap.size : relations.assignments.filter(a => t.id === 'none' ? !a.topics.length : a.topics.includes(t.id)).length}</small>
          </button>)}
        </div>
        <small className="muted">主题为初步建议，可多选或手动调整。</small>
      </aside>
      <section className="relation-content" aria-label="词汇关联">
        <div className="table-tools"><input className="relation-search" aria-label="搜索词汇关系" placeholder="搜索单词、释义或用法…" value={search} onChange={e => { setSearch(e.target.value); setLimit(30); }}/></div>
        <div className="relation-tabs" role="tablist" aria-label="关系类型">
          {Object.entries({ words:'词汇', ...types }).map(([id,label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => selectTab(id)}>{label}</button>)}
        </div>
        {errorText}
        {tab === 'words' ? <>
          <p className="muted">{words.length} 个词 · 点击分类可调整归属</p>
          <div className="classified-words">{words.slice(0,limit).map(w => <article key={w.word}>
            <div><button className="word-link" onClick={() => { setSearch(w.word); selectTab('synonym'); }}>{w.word}</button><p>{w.meaning || '尚未整理释义'}</p></div>
            <button className="topic-tag" aria-label={`调整 ${w.word} 的分类`} onClick={() => { setError(''); setClassify({ word:w.word, topics:assignment.get(w.word)?.topics || [] }); }}>
              {(assignment.get(w.word)?.topics || []).map(id => topics.find(t => t.id === id)?.name).join(' · ') || '待分类'}{assignment.get(w.word)?.source === 'manual' && ' · 手动'}
            </button>
          </article>)}</div>
          {!words.length && <Empty title="没有匹配的词汇"><p>试试其他主题或搜索词。</p></Empty>}
          {words.length > limit && <button onClick={() => setLimit(n => n+30)}>再看 30 个词</button>}
        </> : <>
          <div className="relation-summary"><span className="muted">{groups.length} 组{tab === 'synonym' ? ' · 近义不代表在句中可互换' : ''}</span><label><input type="checkbox" checked={removed} onChange={e => setRemoved(e.target.checked)}/> 已移除</label></div>
          <div className="relation-grid">{groups.slice(0,limit).map(g => <article className={`relation-card ${g.type}`} key={g.id}>
            <small>{types[g.type]}{g.source === 'coach_draft' ? ' · 待词典逐项核验' : g.source === 'user_edited' ? ' · 自己整理' : ' · 已查词典'}</small>
            <h2>{g.title}</h2><div className="relation-members">{g.members.map(m => <span key={m.word} className={!m.available ? 'muted' : ''}>{m.word}{!m.available && '（已移除）'}</span>)}</div>
            <p>{g.note || '补充用法区别，让对照更容易记住。'}</p>
            <div className="relation-card-actions"><button onClick={() => { setDetail(g); setReveal(true); }}>查看区别</button><button onClick={() => { setDetail(g); setReveal(false); }}>对照记忆</button>
              {removed ? <button disabled={busy} onClick={() => mutate('relation_restore',{id:g.id})}>恢复</button> : <button className="text-button" onClick={() => openEdit(g)}>编辑</button>}
            </div>
          </article>)}</div>
          {!groups.length && <Empty title={removed ? '没有已移除的词组' : '这里还没有词组'}><p>可切换关系类型、清除筛选，或新增词组。</p></Empty>}
          {groups.length > limit && <button onClick={() => setLimit(n => n+30)}>查看更多词组</button>}
          {tab === 'lookalike' && !removed && <details className="spelling-suggestions"><summary>拼写相似建议 · {suggestions.length} 对</summary><p className="muted">仅按拼写生成，不代表近义。确认确实容易混淆后再收录。</p>
            {suggestions.slice(0,limit).map(s => <div className="suggestion-row" key={s.pair}><div>{s.words.map(w => <p key={w}><strong>{w}</strong>　{wordMap.get(w)?.meaning || '尚未整理释义'}</p>)}</div><button onClick={() => openEdit({...blank('lookalike',s.words),title:s.words.join(' · ')})}>收录并编辑</button></div>)}
            {suggestions.length > limit && <button onClick={() => setLimit(n => n+30)}>更多建议</button>}
          </details>}
        </>}
      </section>
    </div>
    {currentDetail && <Modal title={currentDetail.title} onClose={() => setDetail(null)}>
      {!reveal ? <div className="contrast-recall"><div className="relation-members">{currentDetail.members.map(m => <strong key={m.word}>{m.word}</strong>)}</div><p>先回忆各词的意思、语气和一个适用场景。</p><button className="primary" onClick={() => setReveal(true)}>显示区别</button></div> : <>
        <p>{currentDetail.note}</p>{currentDetail.members.map(m => <article className="member-detail" key={m.word}><h3>{m.word}</h3><p>{m.usage || '用法区别尚未整理'}</p>{m.example && <blockquote>{m.example}</blockquote>}<a href={`https://www.merriam-webster.com/dictionary/${encodeURIComponent(m.word)}`} target="_blank" rel="noreferrer">查词典 ↗</a></article>)}
        <small className="muted">例句为学习示例；{currentDetail.source === 'dictionary_checked' ? '本组已参照词典核对。' : '本组为整理草稿，遇到具体题目以语境和权威词典为准。'}</small>
      </>}
      {errorText}<div className="modal-actions"><button disabled={!detailWords.length} onClick={() => startRecall(detailWords)}>背诵这一组</button><button onClick={() => setReveal(v => !v)}>{reveal ? '隐藏释义再回忆' : '查看用法'}</button>{!currentDetail.deleted && <button className="text-button" disabled={busy} onClick={async () => { if(await mutate('relation_delete',{id:currentDetail.id})) setDetail(null); }}>移除词组</button>}</div>
    </Modal>}
    {classify && <Modal title={`${classify.word} · 调整分类`} onClose={() => setClassify(null)}>
      <div className="topic-checkboxes">{topics.map(t => <label key={t.id}><input type="checkbox" checked={classify.topics.includes(t.id)} onChange={e => setClassify({...classify,topics:e.target.checked?[...classify.topics,t.id]:classify.topics.filter(id=>id!==t.id)})}/>{t.name}</label>)}</div>
      {errorText}<div className="modal-actions"><button disabled={busy} onClick={async () => { if(await mutate('word_topics',{...classify,automatic:true}))setClassify(null); }}>恢复自动建议</button><button className="primary" disabled={busy} onClick={async () => { if(await mutate('word_topics',{...classify,automatic:false}))setClassify(null); }}>保存分类</button></div>
    </Modal>}
    {manage && <Modal title="管理主题" onClose={() => setManage(false)}>
      <form className="topic-edit" onSubmit={async e => { e.preventDefault(); if(await mutate('topic_upsert',{...topicDraft,id:topicDraft.id||crypto.randomUUID()}))setTopicDraft({id:'',name:''}); }}><Field label={topicDraft.id ? '修改主题名称' : '新增主题名称'}><input required maxLength={40} value={topicDraft.name} onChange={e => setTopicDraft({...topicDraft,name:e.target.value})}/></Field><button disabled={busy}>保存主题</button>{topicDraft.id && <button type="button" onClick={() => setTopicDraft({id:'',name:''})}>取消编辑</button>}</form>
      {errorText}<div className="topic-management">{relations.topics.map(t => <div key={t.id}><span>{t.name}{t.deleted && '（已移除）'}</span><div>{!t.deleted && <button className="text-button" onClick={() => setTopicDraft({id:t.id,name:t.name})}>改名</button>}<button className="text-button" disabled={busy} onClick={() => mutate(t.deleted?'topic_restore':'topic_delete',{id:t.id})}>{t.deleted?'恢复':'移除'}</button></div></div>)}</div>
    </Modal>}
    {edit && <Modal title="编辑词组" onClose={() => setEdit(null)}><form onSubmit={async e => {e.preventDefault();if(await mutate('relation_upsert',edit))setEdit(null);}}>
      <div className="relation-editor-top"><Field label="关系"><select value={edit.type} onChange={e=>setEdit({...edit,type:e.target.value})}>{Object.entries(types).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field><Field label="词组名称"><input required maxLength={100} value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/></Field></div>
      <div className="topic-edit"><Field label="从生词本添加"><input list="relation-word-options" value={candidate} onChange={e=>setCandidate(e.target.value)} placeholder="输入已有单词"/></Field><datalist id="relation-word-options">{[...wordMap.keys()].map(w=><option key={w} value={w}/>)}</datalist><button type="button" disabled={edit.members.length>=12||!wordMap.has(candidate.trim().toLowerCase())||edit.members.some(m=>m.word===candidate.trim().toLowerCase())} onClick={()=>{setEdit({...edit,members:[...edit.members,{word:candidate.trim().toLowerCase(),usage:'',example:''}]});setCandidate('');}}>加入词组</button></div>
      {edit.members.map((m,i)=><div className="member-editor" key={m.word}><div className="topic-heading"><strong>{m.word}</strong><button type="button" className="text-button" aria-label={`移除词组成员 ${m.word}`} onClick={()=>setEdit({...edit,members:edit.members.filter((_,j)=>i!==j)})}>移出</button></div><Field label={`${m.word} 的用法区别`}><textarea maxLength={1500} value={m.usage} onChange={e=>memberChange(i,'usage',e.target.value)} placeholder="词性、适用场景、语气、常用搭配"/></Field><details><summary>例句（可选）</summary><Field label={`${m.word} 的例句`}><input maxLength={500} value={m.example} onChange={e=>memberChange(i,'example',e.target.value)}/></Field></details></div>)}
      <Field label="一句话辨析（可选）"><textarea maxLength={3000} value={edit.note} onChange={e=>setEdit({...edit,note:e.target.value})}/></Field>{errorText}<div className="modal-actions"><button type="button" onClick={()=>setEdit(null)}>取消</button><button className="primary" disabled={busy||edit.members.length<2}>保存词组</button></div>
    </form></Modal>}
  </>;
}
