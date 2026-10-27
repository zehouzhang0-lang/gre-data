import { withQuickReviews, QUICK_RATINGS } from '../../../shared/quick-review.mjs';
import { WORD_STAGES, meaningChoices, drillResult, roundProgress, roundRating } from '../../../shared/word-session.mjs';
import { projectReview, dayKey } from '../../../server/spaced-review.mjs';
import { projectRelations, validateRelation } from '../../../server/word-relations.mjs';
import { applyStandardDefinition, validateStandardDefinition } from '../../../shared/standard-definition.mjs';
import { cleanCardReadingPayload, projectCardReadings } from './card-reading.mjs';
import { cleanCurationPayload, projectCurationRequests } from './curation.mjs';
import { REVIEW_EVENT_KINDS, cleanReviewPayload, projectReviewTasks, projectWordGroups } from './review-tasks.mjs';

export const DATA_VERSION = 1;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const VOCAB_EVENT_KINDS = new Set(['vocab_upsert', 'vocab_capture', 'vocab_delete', 'vocab_restore', 'vocab_recall', 'vocab_card_reading', 'vocab_curation_request', 'vocab_quick_review', 'vocab_quick_undo', 'vocab_session', 'vocab_drill', 'topic_upsert', 'topic_delete', 'topic_restore', 'word_topics', 'relation_upsert', 'relation_delete', 'relation_restore']);
REVIEW_EVENT_KINDS.forEach(kind => VOCAB_EVENT_KINDS.add(kind));
export const clone = value => structuredClone(value);
export const normalizeWord = value => text(value, '单词', 120).toLowerCase().replace(/\s+/g, ' ');
export function text(value, label, max = 10000, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`${label}格式无效`);
  return value.trim();
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw Error('记录编号格式无效');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error('记录时间格式无效');
  return new Date(value).toISOString();
}
function array(value, label, max = 50000) {
  if (!Array.isArray(value) || value.length > max) throw Error(`${label}格式或数量无效`);
  return value;
}
function unique(items, key, label) {
  if (new Set(items.map(key)).size !== items.length) throw Error(`${label}包含重复编号`);
  return items;
}
function count(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10000000) throw Error('复习次数无效');
  return value;
}
function url(value) {
  const s = text(value, '词典链接', 2000, true);
  if (s && !/^https?:\/\//i.test(s)) throw Error('词典链接必须使用 http 或 https');
  return s;
}
export function cleanWord(value) {
  if (!value || typeof value !== 'object') throw Error('词条格式无效');
  if (value.recalls?.length) throw Error('词条基线不得包含事件回忆；请使用完整词库导出包');
  const out = { word: normalizeWord(value.word), meaning: text(value.meaning, '释义', 10000, true), pos: text(value.pos, '词性', 200, true), note: text(value.note, '备注', 10000, true), deleted: !!value.deleted, status: text(value.status, '状态', 100, true) || '未检验', recalls: [] };
  for (const key of ['collocation', 'original_context', 'definition_source', 'feedback']) out[key] = text(value[key], key, 10000, true);
  out.dictionary_url = url(value.dictionary_url);
  out.sources = array(value.sources || [], '词条来源', 1000).map(source => Object.fromEntries(['material_id', 'record', 'kind', 'origin_word'].filter(key => source[key] != null).map(key => [key, text(source[key], key, 1000, true)])));
  out.captures = array(value.captures || [], '摘词来源', 1000).map(c => {
    const p = cleanPayload('vocab_capture', { word: out.word, source: c.source, context: c.context });
    return { source: p.source, context: p.context, recorded_at: timestamp(c.recorded_at) };
  });
  return out;
}
export function cleanRelations(value) {
  if (!value || typeof value !== 'object') throw Error('分类关系数据缺失');
  const topics = unique(array(value.topics, '主题', 500).map(t => {
    if (t.pattern) throw Error('手机导入不执行外部正则分类规则，请使用手机词库导出脚本');
    return { ...validateRelation('topic_upsert', t), words: [...new Set(array(t.words || [], '主题词表').map(normalizeWord))] };
  }), t => t.id, '主题');
  const groups = unique(array(value.groups, '词组', 10000).map(g => {
    const base = validateRelation('relation_upsert', g);
    return { ...base, source: ['dictionary_checked', 'coach_draft', 'user_edited'].includes(g.source) ? g.source : 'coach_draft', sources: array(g.sources || [], '关系来源', 100).map(s => typeof s === 'string' ? url(s) : { word: text(s.word, '来源词', 120, true), url: url(s.url), title: text(s.title, '来源标题', 300, true) }) };
  }), g => g.id, '词组');
  return { topics, groups };
}
export function cleanPayload(kind, p) {
  if (!VOCAB_EVENT_KINDS.has(kind) || !p || typeof p !== 'object') throw Error('不是支持的词库记录');
  if (kind === 'vocab_card_reading') return cleanCardReadingPayload(p, normalizeWord, timestamp);
  if (kind === 'vocab_curation_request') return cleanCurationPayload(p, normalizeWord);
  if (REVIEW_EVENT_KINDS.includes(kind)) return cleanReviewPayload(kind, p, { text, uuid, normalizeWord });
  const relation = validateRelation(kind, p);
  if (relation) return relation;
  if (kind === 'vocab_quick_undo') return { target_id: uuid(p.target_id) };
  if (kind === 'vocab_quick_review') {
    const items = unique(array(p.items, '批量标记', 5000).map(i => {
      if (!QUICK_RATINGS.includes(i?.self_rating)) throw Error('记忆标记无效');
      return { word: normalizeWord(i.word), self_rating: i.self_rating };
    }), i => i.word, '批量标记');
    if (!items.length) throw Error('请选择要标记的单词');
    return { session_id: uuid(p.session_id), items, assessment: 'self_reported' };
  }
  if (kind === 'vocab_session') {
    const words = unique(array(p.words, '本轮单词').map(normalizeWord), w => w, '本轮单词');
    if (!words.length || ![1, 2].includes(p.meaning_passes)) throw Error('每轮至少 1 词，认义 1 或 2 遍');
    return { session_id: uuid(p.session_id), words, meaning_passes: p.meaning_passes };
  }
  if (kind === 'vocab_drill') {
    if (!WORD_STAGES.includes(p.stage) || !['correct', 'incorrect', 'revealed'].includes(p.result) || !['choice', 'typing', 'self_check'].includes(p.response_mode)) throw Error('练习步骤无效');
    return { session_id: uuid(p.session_id), word: normalizeWord(p.word), stage: p.stage, answer: text(p.answer, '回答', 3000, true), result: p.result, response_mode: p.response_mode };
  }
  const word = normalizeWord(p.word);
  if (kind === 'vocab_upsert') return { word, meaning: text(p.meaning, '释义', 3000), pos: text(p.pos, '词性', 80, true), note: text(p.note, '备注', 3000, true) };
  if (kind === 'vocab_capture') {
    if (!['tc', 'se', 'rc', 'quant'].includes(p.source?.type)) throw Error('摘词来源无效');
    return { word, source: { material: text(p.source.material, '教材', 200), unit: text(p.source.unit, '单元', 200), question: text(p.source.question, '题号', 100), type: p.source.type }, context: text(p.context, '摘词语境', 240, true) };
  }
  if (kind === 'vocab_recall') {
    if (p.mode === 'multistage') return { word, mode: 'multistage', session_id: uuid(p.session_id) };
    if (!QUICK_RATINGS.includes(p.self_rating) || !['flashcard', 'recall'].includes(p.mode)) throw Error('回忆记录无效');
    return { word, answer: text(p.answer, '回答', 3000, true), self_rating: p.self_rating, mode: p.mode, assessment: 'self_reported' };
  }
  return { word };
}
function cleanSnapshot(p) {
  const items = array(p.items, '开轮词义快照').map(item => ({ word: normalizeWord(item.word), meaning: text(item.meaning, '开轮释义', 10000), pos: text(item.pos, '词性', 200, true), choices: array(item.choices, '认义选项', 4).map(c => ({ word: normalizeWord(c.word), meaning: text(c.meaning, '选项释义', 10000) })) }));
  if (JSON.stringify(items.map(i => i.word)) !== JSON.stringify(p.words)) throw Error('开轮快照与单词顺序不一致');
  for (const item of items) {
    if (![0, 4].includes(item.choices.length) || new Set(item.choices.map(c => c.word)).size !== item.choices.length || item.choices.length && !item.choices.some(c => c.word === item.word && c.meaning === item.meaning)) throw Error('开轮选项快照无效');
  }
  return items;
}
function applyWordEvent(words, event) {
  const p = event.payload;
  if (event.kind === 'vocab_upsert') words.set(p.word, { ...(words.get(p.word) || cleanWord({ word: p.word })), ...p, deleted: false, definition_source: '用户编辑，待词典核验' });
  if (event.kind === 'vocab_capture') {
    const w = words.get(p.word) || cleanWord({ word: p.word, definition_source: '题中摘词，待补释义' });
    const captures = [...(w.captures || [])];
    if (!captures.some(c => JSON.stringify(c.source) === JSON.stringify(p.source) && c.context === p.context)) captures.push({ source: p.source, context: p.context, recorded_at: event.recorded_at });
    words.set(p.word, { ...w, deleted: false, captures });
  }
  if (['vocab_delete', 'vocab_restore'].includes(event.kind) && words.has(p.word)) words.get(p.word).deleted = event.kind === 'vocab_delete';
}

// Validate full raw evidence before accepting a restore. No projection is treated as
// an additional event; base words never carry platform recalls.
export function validateData(value) {
  if (!value || value.schema_version !== DATA_VERSION) throw Error('不支持的数据版本；请保留原文件并使用兼容版本');
  const time_zone = text(value.time_zone, '学习时区', 100);
  try { new Intl.DateTimeFormat('en', { timeZone: time_zone }).format(); } catch { throw Error('学习时区无效'); }
  const baseline = value.baseline;
  if (!baseline) throw Error('词库原始基线缺失');
  const vocabulary = unique(array(baseline.vocabulary, '词库').map(cleanWord), w => w.word, '词库');
  const definitions = unique(array(baseline.definitions || [], '规范释义').map(validateStandardDefinition), d=>d.word, '规范释义');
  const legacyWords = unique(array(baseline.legacyWords, '旧复习证据').map(w => {
    const last_day = w.last_day == null ? null : text(w.last_day, '复习日期', 10);
    if (last_day && (!/^\d{4}-\d{2}-\d{2}$/.test(last_day) || !Number.isFinite(Date.parse(last_day)) || new Date(last_day).toISOString().slice(0, 10) !== last_day)) throw Error('旧复习日期无效');
    return { word: normalizeWord(w.word), review_count: count(w.review_count), last_day, records: array(w.records || [], '旧记录来源', 5000).map(r => text(r, '记录来源', 1000)) };
  }), w => w.word, '旧复习证据');
  const relations = cleanRelations(baseline.relations);
  const definitionMap = new Map(definitions.map(d => [d.word,d]));
  const words = new Map(vocabulary.map(w => [w.word, clone(w)]));
  const sessions = new Map(), drills = [], recalls = [], seen = new Map();
  const reviewTasks = new Map(), reviewMetadata = new Map(), taskDays = new Map(), customGroups = new Set();
  const topics = new Set(relations.topics.map(t => t.id)), groups = new Set(relations.groups.map(g => g.id));
  const events = unique(array(value.events, '学习记录', 100000).map(e => {
    if (e.schema_version !== 1) throw Error('不支持的事件版本');
    const payload = cleanPayload(e.kind, e.payload);
    if (e.kind === 'vocab_session') payload.items = cleanSnapshot({ ...payload, items: e.payload.items });
    if (e.kind === 'vocab_drill') payload.assessment = payload.response_mode === 'self_check' ? 'self_reported' : 'locally_checked';
    if (e.kind === 'vocab_recall' && payload.mode === 'multistage') {
      if (!QUICK_RATINGS.includes(e.payload.self_rating) || !['mixed', 'locally_checked'].includes(e.payload.assessment)) throw Error('复习结算记录不完整');
      Object.assign(payload, { self_rating: e.payload.self_rating, answer: text(e.payload.answer, '拼写原答', 3000, true), assessment: e.payload.assessment });
    }
    return { schema_version: 1, id: uuid(e.id), recorded_at: timestamp(e.recorded_at), kind: e.kind, payload };
  }), e => e.id, '学习记录').sort(eventOrder);
  for (const e of events) {
    const p = e.payload;
    if (e.kind === 'vocab_word_group') {
      if (customGroups.has(p.id) || topics.has(p.id) || groups.has(p.id) || p.words.some(w => !words.has(w) || words.get(w).deleted)) throw Error('自定义分组编号重复或引用不可用单词');
      customGroups.add(p.id);
      (p.kind === 'topic' ? topics : groups).add(p.id);
    }
    if (e.kind === 'vocab_review_task') {
      if (reviewTasks.get(p.id)?.cancelled || p.filter.topic && !topics.has(p.filter.topic) || p.filter.group && !groups.has(p.filter.group) || p.deadline < dayKey(new Date(e.recorded_at), time_zone)) throw Error('复习任务引用无效范围、日期或已取消任务');
      reviewTasks.set(p.id, p);
    }
    if (e.kind === 'vocab_review_task_cancel') {
      if (!reviewTasks.has(p.id)) throw Error('取消引用未知任务');
      reviewTasks.set(p.id, { ...reviewTasks.get(p.id), cancelled: true });
    }
    if (e.kind === 'vocab_review_round') {
      const previous = reviewMetadata.get(p.session_id), task = p.task_id && reviewTasks.get(p.task_id);
      if (!sessions.has(p.session_id)) throw Error('轮次配置引用未知轮次');
      if (previous && (previous.task_id !== p.task_id || previous.day !== p.day || previous.deadline !== p.deadline || previous.deleted && !p.deleted)) throw Error('不能改变轮次来源或恢复已删除轮次');
      if (p.task_id) {
        const key = `${p.task_id}:${p.day}`;
        if (!task || p.day > p.deadline || taskDays.has(key) && taskDays.get(key) !== p.session_id) throw Error('任务每日轮次重复或来源无效');
        if (!previous && (task.cancelled || p.deadline !== task.deadline || p.day !== dayKey(new Date(sessions.get(p.session_id).recorded_at), time_zone) || sessions.get(p.session_id).words.length > task.word_count)) throw Error('每日轮次与创建时任务不一致');
        taskDays.set(key, p.session_id);
      }
      reviewMetadata.set(p.session_id, p);
    }
    if (e.kind === 'vocab_curation_request' && p.words.some(word => !words.has(word) || words.get(word).deleted)) throw Error('补充整理引用未知或已移除的单词');
    if (e.kind === 'vocab_card_reading' && p.items.some(i => !words.has(i.word) || words.get(i.word).deleted || i.viewed_at > e.recorded_at)) throw Error('翻阅记录引用无效单词或未来时间');
    if (e.kind === 'vocab_quick_undo' && seen.get(p.target_id)?.kind !== 'vocab_quick_review') throw Error('撤销指向不存在的标记');
    if (e.kind === 'vocab_quick_review' && p.items.some(i => !words.has(i.word) || words.get(i.word).deleted || !applyStandardDefinition(words.get(i.word),definitionMap.get(i.word)).meaning)) throw Error('标记引用未就绪单词');
    if (e.kind === 'vocab_recall' && !words.has(p.word)) throw Error('回忆引用未知单词');
    if (['vocab_delete', 'vocab_restore'].includes(e.kind) && !words.has(p.word)) throw Error('词条操作引用未知单词');
    if (e.kind === 'topic_upsert') topics.add(p.id);
    if (['topic_delete', 'topic_restore'].includes(e.kind) && !topics.has(p.id)) throw Error('分类操作引用未知主题');
    if (e.kind === 'word_topics' && (!words.has(p.word) || p.topics.some(id => !topics.has(id)))) throw Error('分类归属引用未知单词或主题');
    if (e.kind === 'relation_upsert') {
      if (p.members.some(m => !words.has(m.word))) throw Error('关系组引用未知单词');
      groups.add(p.id);
    }
    if (['relation_delete', 'relation_restore'].includes(e.kind) && !groups.has(p.id)) throw Error('关系操作引用未知词组');
    if (e.kind === 'vocab_session') {
      if (sessions.has(p.session_id) || p.words.some(w => !words.has(w))) throw Error('轮次编号重复或引用未知单词');
      sessions.set(p.session_id, { ...p, recorded_at: e.recorded_at });
    }
    if (e.kind === 'vocab_drill' || e.kind === 'vocab_recall' && p.mode === 'multistage') {
      const session = sessions.get(p.session_id), item = session?.items.find(w => w.word === p.word);
      if (!item) throw Error('练习引用不存在的轮次单词');
      const progress = roundProgress(session, drills, recalls);
      if (e.kind === 'vocab_drill') { validateDrill(p, item, progress); drills.push(p); }
      else {
        const wordDrills = drills.filter(d => d.session_id === p.session_id && d.word === p.word);
        const assessment = wordDrills.some(d => d.response_mode === 'self_check') ? 'mixed' : 'locally_checked';
        if (!progress.ready_words.includes(p.word) || progress.completed_words.includes(p.word) || roundRating(session, p.word, drills) !== p.self_rating || p.assessment !== assessment || p.answer !== (wordDrills.filter(d => d.stage === 'spelling').at(-1)?.answer || '')) throw Error('复习结算重复或缺少完成证据');
        recalls.push(p);
      }
    }
    applyWordEvent(words, e); seen.set(e.id, e);
  }
  if (legacyWords.some(w => !words.has(w.word)) || relations.topics.some(t => t.words.some(w => !words.has(w))) || relations.groups.some(g => g.members.some(m => !words.has(m.word)))) throw Error('词库基线引用未知单词');
  const quickRound = value.quickRound == null ? null : { day: text(value.quickRound.day, '轮次日期', 10), id: uuid(value.quickRound.id) };
  if (quickRound && !/^\d{4}-\d{2}-\d{2}$/.test(quickRound.day)) throw Error('轮次日期无效');
  const settings = JSON.parse(JSON.stringify(value.settings || {}));
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings) || JSON.stringify(settings).length > 100000) throw Error('设置格式无效');
  return { schema_version: DATA_VERSION, dataset_id: uuid(value.dataset_id), time_zone, baseline: { vocabulary, legacyWords, relations, definitions }, events, quickRound, settings };
}
export const eventOrder = (a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id);
function validateDrill(p, item, progress) {
  if (progress.next?.word !== p.word || progress.next?.stage !== p.stage) throw Error('练习顺序不一致，请重新打开本轮');
  const mode = p.stage.startsWith('meaning_') ? (item.choices.length ? 'choice' : 'self_check') : 'typing';
  if (p.response_mode !== mode || p.result === 'revealed' && p.answer || p.result !== 'revealed' && mode !== 'self_check' && !p.answer || mode === 'choice' && p.result !== 'revealed' && !item.choices.some(c => c.word === p.answer) || drillResult(item, p) !== p.result) throw Error('回答与核对结果不一致');
}
export function projectState(data, now = new Date()) {
  const words = new Map(data.baseline.vocabulary.map(w => [w.word, clone(w)]));
  for (const e of data.events) applyWordEvent(words, e);
  const effective = withQuickReviews(data.events), completed = new Set();
  for (const e of effective) if (e.kind === 'vocab_recall') {
    const p = e.payload, key = `${p.session_id}:${p.word}`;
    if (p.mode === 'multistage' && completed.has(key)) continue;
    if (p.mode === 'multistage') completed.add(key);
    words.get(p.word)?.recalls.push({ ...p, recorded_at: e.recorded_at });
  }
  for(const definition of data.baseline.definitions || []) { const w=words.get(definition.word); if(w)words.set(w.word,applyStandardDefinition(w,definition)); }
  const vocabulary = [...words.values()].sort((a, b) => a.word.localeCompare(b.word));
  const relations = projectRelations(vocabulary, data.baseline.relations, data.events);
  const wordGroups = projectWordGroups(data.events, relations, vocabulary);
  const spacedReview = projectReview({ vocabulary, legacyWords: data.baseline.legacyWords, events: data.events, now, timeZone: data.time_zone });
  const vocabDrills = data.events.filter(e => e.kind === 'vocab_drill').map(e => ({ ...e.payload, id: e.id, recorded_at: e.recorded_at }));
  const recalls = data.events.filter(e => e.kind === 'vocab_recall' && e.payload.mode === 'multistage').map(e => ({ ...e.payload, id: e.id, recorded_at: e.recorded_at }));
  const vocabSessions = data.events.filter(e => e.kind === 'vocab_session').map(e => {
    const session = { ...e.payload, id: e.id, recorded_at: e.recorded_at }, progress = roundProgress(session, vocabDrills, recalls);
    return { ...session, ...progress, completed_at: progress.complete ? recalls.filter(r => r.session_id === session.session_id).at(-1)?.recorded_at || null : null };
  }).reverse();
  const undone = new Set(data.events.filter(e => e.kind === 'vocab_quick_undo').map(e => e.payload.target_id));
  return { vocabulary, relations, wordGroups, ...projectReviewTasks(data.events, vocabSessions, data.time_zone, now), spacedReview, vocabSessions, vocabDrills, cardReadings: projectCardReadings(data.events, vocabulary), curationRequests: projectCurationRequests(data.events), events: data.events.map(e => ({ ...e, ...e.payload })).reverse(), quickRound: data.quickRound, undoId: data.events.findLast(e => e.kind === 'vocab_quick_review' && !undone.has(e.id))?.id || null, settings: clone(data.settings), timeZone: data.time_zone, datasetId: data.dataset_id };
}
export function prepareEvent(data, kind, payload, id, now = new Date()) {
  const p = cleanPayload(kind, payload), prior = data.events.find(e => e.id === id);
  uuid(id);
  if (prior) {
    if (prior.kind !== kind || JSON.stringify(cleanPayload(kind, prior.payload)) !== JSON.stringify(p)) throw Error('记录编号已被其他操作使用');
    return prior;
  }
  const state = projectState(data, now), available = new Map(state.vocabulary.filter(w => !w.deleted).map(w => [w.word, w]));
  if (REVIEW_EVENT_KINDS.includes(kind)) {
    // Full replay validates cross-event references and immutable round provenance.
    const at = Math.max(+new Date(now), data.events.length ? Date.parse(data.events.at(-1).recorded_at) + 1 : 0);
    const event = { schema_version: 1, id, recorded_at: new Date(at).toISOString(), kind, payload: p };
    validateData({ ...data, events: [...data.events, event] });
    return event;
  }
  if (kind === 'vocab_curation_request' && p.words.some(word => !available.has(word))) throw Error('补充整理引用未知或已移除的单词');
  if (kind === 'vocab_card_reading' && p.items.some(i => !available.has(i.word) || Date.parse(i.viewed_at) > +new Date(now))) throw Error('翻阅记录引用无效单词或未来时间');
  if (kind === 'vocab_quick_review' && p.items.some(i => !available.get(i.word)?.meaning)) throw Error('存在已移除、未知或缺释义的词，本批未保存');
  if (kind === 'vocab_quick_undo' && data.events.find(e => e.id === p.target_id)?.kind !== 'vocab_quick_review') throw Error('只能撤销已有单词墙标记');
  if (['vocab_delete', 'vocab_restore'].includes(kind) && !state.vocabulary.some(w => w.word === p.word)) throw Error('单词不存在');
  if (['topic_delete', 'topic_restore'].includes(kind) && !state.relations.topics.some(t => t.id === p.id)) throw Error('主题不存在');
  if (['relation_delete', 'relation_restore'].includes(kind) && !state.relations.groups.some(g => g.id === p.id)) throw Error('词组不存在');
  if (kind === 'vocab_recall' && p.mode !== 'multistage' && !available.get(p.word)?.meaning) throw Error('该词未就绪，不能保存回忆');
  if (kind === 'vocab_session') {
    const existing = data.events.find(e => e.kind === kind && e.payload.session_id === p.session_id);
    if (existing) {
      if (JSON.stringify(cleanPayload(kind, existing.payload)) !== JSON.stringify(p)) throw Error('此轮编号已被使用');
      return existing;
    }
    if (p.words.some(w => !available.get(w)?.meaning)) throw Error('本轮单词须存在且有释义');
    p.items = p.words.map(word => { const w = available.get(word); return { word, meaning: w.meaning, pos: w.pos || '', choices: meaningChoices(w, state.vocabulary, state.relations, p.session_id + word) }; });
  }
  if (kind === 'vocab_drill' || kind === 'vocab_recall' && p.mode === 'multistage') {
    const session = state.vocabSessions.find(s => s.session_id === p.session_id), item = session?.items.find(i => i.word === p.word);
    if (!item) throw Error('找不到本轮单词');
    if (kind === 'vocab_drill') { validateDrill(p, item, session); p.assessment = p.response_mode === 'self_check' ? 'self_reported' : 'locally_checked'; }
    else {
      const existing = data.events.find(e => e.kind === kind && e.payload.session_id === p.session_id && e.payload.word === p.word);
      if (existing) return existing;
      if (!session.ready_words.includes(p.word)) throw Error('完成全部步骤后才能结算');
      const drills = state.vocabDrills.filter(d => d.session_id === p.session_id && d.word === p.word);
      Object.assign(p, { self_rating: roundRating(session, p.word, state.vocabDrills), answer: drills.filter(d => d.stage === 'spelling').at(-1)?.answer || '', assessment: drills.some(d => d.response_mode === 'self_check') ? 'mixed' : 'locally_checked' });
    }
  }
  if (kind === 'relation_upsert' && p.members.some(m => !available.has(m.word))) throw Error('关系成员必须是已有词');
  if (kind === 'word_topics' && (!available.has(p.word) || p.topics.some(id => !state.relations.topics.some(t => t.id === id && !t.deleted)))) throw Error('单词或主题不存在');
  if (kind === 'topic_upsert' && state.relations.topics.some(t => !t.deleted && t.id !== p.id && t.name === p.name)) throw Error('存在同名主题');
  const at = Math.max(+new Date(now), data.events.length ? Date.parse(data.events.at(-1).recorded_at) + 1 : 0);
  return { schema_version: 1, id, recorded_at: new Date(at).toISOString(), kind, payload: p };
}
export function ensureRound(data, now, makeId) {
  const day = dayKey(now, data.time_zone);
  if (data.quickRound?.day !== day) data.quickRound = { day, id: makeId() };
  return data.quickRound;
}
