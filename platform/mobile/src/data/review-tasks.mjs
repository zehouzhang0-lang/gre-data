import { dayKey } from '../../../server/spaced-review.mjs';

export const REVIEW_EVENT_KINDS = ['vocab_review_task', 'vocab_review_task_cancel', 'vocab_review_round', 'vocab_word_group'];
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw Error('复习配置包含无效字段');
}
export function reviewDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw Error('复习日期无效');
  return value;
}
export function cleanReviewPayload(kind, p, { text, uuid, normalizeWord }) {
  const filter = value => {
    exact(value, ['scope', 'topic', 'group']);
    if (!['all', 'due', 'new'].includes(value.scope)) throw Error('复习范围无效');
    return { scope: value.scope, topic: text(value.topic, '主题', 100, true), group: text(value.group, '关系组', 100, true) };
  };
  if (kind === 'vocab_review_task') {
    exact(p, ['id', 'name', 'word_count', 'filter', 'deadline', 'meaning_passes']);
    if (!Number.isInteger(p.word_count) || p.word_count < 1 || p.word_count > 50000 || ![1, 2].includes(p.meaning_passes)) throw Error('复习词数或认义遍数无效');
    return { id: uuid(p.id), name: text(p.name, '任务名称', 100), word_count: p.word_count, filter: filter(p.filter), deadline: reviewDate(p.deadline), meaning_passes: p.meaning_passes };
  }
  if (kind === 'vocab_review_task_cancel') { exact(p, ['id']); return { id: uuid(p.id) }; }
  if (kind === 'vocab_review_round') {
    exact(p, ['session_id', 'name', 'pinned', 'deleted', 'task_id', 'day', 'deadline']);
    if (typeof p.pinned !== 'boolean' || typeof p.deleted !== 'boolean') throw Error('轮次状态无效');
    const out = { session_id: uuid(p.session_id), name: text(p.name, '轮次名称', 100), pinned: p.pinned, deleted: p.deleted };
    if (p.task_id != null) Object.assign(out, { task_id: uuid(p.task_id), day: reviewDate(p.day), deadline: reviewDate(p.deadline) });
    else if (p.day != null || p.deadline != null) throw Error('任务轮次来源不完整');
    return out;
  }
  if (kind === 'vocab_word_group') {
    exact(p, ['id', 'kind', 'name', 'words']);
    if (!['topic', 'relation'].includes(p.kind) || !Array.isArray(p.words) || !p.words.length || p.words.length > 50000) throw Error('自定义分组格式无效');
    const words = p.words.map(normalizeWord);
    if (new Set(words).size !== words.length) throw Error('分组不能包含重复单词');
    return { id: uuid(p.id), kind: p.kind, name: text(p.name, '分组名称', 40), words };
  }
  return null;
}

// This extra projection never changes old relation events or their classifications.
export function projectWordGroups(events, relations, vocabulary) {
  const groups = events.filter(e => e.kind === 'vocab_word_group').map(e => ({ ...e.payload, created_at: e.recorded_at }));
  const available = new Set(vocabulary.filter(w => !w.deleted).map(w => w.word));
  const topicChanges = new Map(), groupChanges = new Map(), assignments = new Map(), names = new Map();
  for (const e of events) {
    if (e.kind === 'topic_delete' || e.kind === 'topic_restore') topicChanges.set(e.payload.id, e.kind === 'topic_delete');
    if (e.kind === 'relation_delete' || e.kind === 'relation_restore') groupChanges.set(e.payload.id, e.kind === 'relation_delete');
    if (e.kind === 'word_topics') assignments.set(e.payload.word, e);
    if (e.kind === 'topic_upsert') { names.set(e.payload.id, e.payload.name); topicChanges.set(e.payload.id, false); }
    if (e.kind === 'relation_upsert') groupChanges.set(e.payload.id, false);
  }
  for (const g of groups) {
    if (g.kind === 'topic') {
      const topic = { id: g.id, name: names.get(g.id) || g.name, custom: true, deleted: topicChanges.get(g.id) || false };
      relations.topics = relations.topics.filter(t => t.id !== g.id);
      relations.topics.push(topic);
      const members = new Set(g.words);
      for (const a of relations.assignments) {
        const override = assignments.get(a.word), laterManual = override && override.recorded_at > g.created_at && !override.payload.automatic;
        const assigned = laterManual ? override.payload.topics.includes(g.id) : members.has(a.word);
        a.topics = a.topics.filter(id => id !== g.id);
        if (assigned && !topic.deleted) a.topics.push(g.id);
      }
    } else if (!relations.groups.some(item => item.id === g.id)) relations.groups.push({ id: g.id, type: 'custom', title: g.name, note: '', source: 'user_edited', custom: true, deleted: groupChanges.get(g.id) || false, members: g.words.map(word => ({ word, usage: '', example: '', available: available.has(word) })) });
  }
  return groups;
}

export function projectReviewTasks(events, sessions, timeZone, now = new Date()) {
  const tasks = new Map(), metadata = new Map();
  for (const e of events) {
    const p = e.payload;
    if (e.kind === 'vocab_review_task') tasks.set(p.id, { ...p, created_at: tasks.get(p.id)?.created_at || e.recorded_at, updated_at: e.recorded_at, cancelled: tasks.get(p.id)?.cancelled || false });
    if (e.kind === 'vocab_review_task_cancel' && tasks.has(p.id)) tasks.get(p.id).cancelled = true;
    if (e.kind === 'vocab_review_round') metadata.set(p.session_id, p);
  }
  const today = dayKey(now, timeZone);
  return {
    reviewTasks: [...tasks.values()].map(t => ({ ...t, expired: t.deadline < today })),
    reviewRounds: sessions.map(s => ({ ...s, name: dayKey(new Date(s.recorded_at), timeZone), pinned: false, deleted: false, ...metadata.get(s.session_id) })),
  };
}

export function selectReviewWords(state, filter, count = 50000, taskId) {
  const reviews = new Map((state.spacedReview?.items || []).filter(i => i.kind === 'word').map(i => [i.word, i]));
  const topics = new Map(state.relations.assignments.map(a => [a.word, a.topics]));
  const group = filter.group ? state.relations.groups.find(g => g.id === filter.group && !g.deleted) : null;
  const members = new Set(group?.members.map(m => m.word));
  const assigned = new Map();
  for (const r of state.reviewRounds || []) if (r.task_id === taskId) for (const word of r.words) if (!assigned.has(word) || assigned.get(word) < r.recorded_at) assigned.set(word, r.recorded_at);
  return state.vocabulary.filter(w => !w.deleted && w.meaning?.trim()
    && (!filter.topic || topics.get(w.word)?.includes(filter.topic))
    && (!filter.group || members.has(w.word))
    && (filter.scope === 'all' || filter.scope === 'due' && reviews.get(w.word)?.due || filter.scope === 'new' && !reviews.get(w.word)?.has_history))
    .sort((a, b) => Number(!!reviews.get(b.word)?.due) - Number(!!reviews.get(a.word)?.due) || (assigned.get(a.word) || '').localeCompare(assigned.get(b.word) || '') || a.word.localeCompare(b.word)).slice(0, count);
}

export function roundUrgency(round, state, now = new Date()) {
  if (round.completed_at || round.complete) return { level: 'complete', label: '已完成' };
  const today = dayKey(now, state.timeZone), words = new Set(round.words), completed = new Set(round.completed_words || []);
  const pending = (state.spacedReview?.items || []).filter(i => i.kind === 'word' && words.has(i.word) && !completed.has(i.word));
  if (round.deadline && round.deadline < today || pending.some(i => i.overdue)) return { level: 'urgent', label: '已到期 · 优先复习' };
  if (round.deadline === today || pending.some(i => i.due)) return { level: 'today', label: '今天复习' };
  return { level: 'planned', label: round.deadline ? `截止 ${round.deadline}` : '待开始' };
}

export function orderedReviewRounds(state, scope = 'all', now = new Date()) {
  const ranks = { urgent: 0, today: 1, planned: 2, complete: 3 };
  return (state.reviewRounds || []).filter(r => !r.deleted && (scope === 'all' || (scope === 'completed') === !!(r.completed_at || r.complete)))
    .map(r => ({ ...r, urgency: roundUrgency(r, state, now) }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || ranks[a.urgency.level] - ranks[b.urgency.level] || b.recorded_at.localeCompare(a.recorded_at));
}
