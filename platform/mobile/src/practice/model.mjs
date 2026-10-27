import { validateExplanation } from '../../../shared/ai-explanation.mjs';

export const PRACTICE_TYPES = ['se', 'tc', 'rc', 'quant'];
export const BACKUP_FORMAT = 'gre-practice-backup';
export const MAX_BYTES = 20 * 1024 * 1024;
export const clone = value => structuredClone(value);
export const questionKey = question => JSON.stringify([question.material, question.unit, String(question.question)]);
export const unitKey = question => JSON.stringify([question.material, question.unit]);
export function unitsFor(questions, search = '') {
  const units = new Map();
  for (const q of questions) {
    const key = unitKey(q);
    if (!units.has(key)) units.set(key, { key, label: q.unitLabel, materialLabel: q.materialLabel, count: 0 });
    units.get(key).count++;
  }
  const query = search.trim().toLowerCase().replace(/\s+/g, ' ');
  return [...units.values()].filter(unit => `${unit.materialLabel} ${unit.label}`.toLowerCase().includes(query));
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function navigationStatus(question, drafts = {}) {
  if (drafts[question.key]) return 'draft';
  return question.submitted ? 'submitted' : question.sameContentDone ? 'duplicate' : 'unseen';
}
function validValues(question, selected) {
  if (!question || !Array.isArray(selected) || selected.length > 12 || selected.some(value => typeof value !== 'string' || value.length > 10000) || new Set(selected).size !== selected.length) return false;
  // Some original PDFs have incomplete extracted labels. Preserve the original
  // mode while accepting the user's exact transcription from the visible page.
  if (question.answerInput === 'text') return selected.length <= 1;
  if (question.mode === 'sentence') return !!question.native && !question.passageImages?.length && selected.every(value => question.sentences?.includes(value));
  if (question.letters?.length && question.mode !== 'entry') return selected.every(value => question.letters.includes(value));
  return selected.length <= 1;
}
export function answerReady(question, selected = []) {
  if (!validValues(question, selected)) return false;
  if (question.answerInput === 'text') return selected.length === 1 && !!selected[0].trim();
  if (question.mode === 'pair') return selected.length === 2;
  if (question.groups?.length) return selected.length === question.groups.length && question.groups.every(group => group.filter(letter => selected.includes(letter)).length === 1);
  if (question.mode === 'multiple' && question.letters?.length) return selected.length > 0;
  return selected.length === 1 && !!selected[0].trim();
}
export function validateSelection(question, selected) {
  if (!validValues(question, selected)) throw Error('作答不符合本题选项，请重新选择');
  return [...selected];
}
export function selectAnswer(question, old, value) {
  if (question.answerInput === 'text') return [value];
  if (['pair', 'multiple'].includes(question.mode) && question.letters?.length) {
    if (!question.letters.includes(value)) return old;
    return old.includes(value) ? old.filter(x => x !== value)
      : question.mode === 'pair' && old.length >= 2 ? old : [...old, value];
  }
  if (question.groups?.length) {
    const group = question.groups.find(g => g.includes(value));
    if (!group) return old;
    return [...old.filter(x => !group.includes(x)), value];
  }
  return [value];
}
export function serializedAnswer(question, selected) {
  if (question.answerInput === 'text') return selected[0];
  if (question.groups?.length) return question.groups.map(group => group.find(letter => selected.includes(letter))).join('/');
  if (question.letters?.length && question.mode !== 'entry') return question.letters.filter(letter => selected.includes(letter)).join('/');
  return selected[0];
}
export function gradeAnswer(answer, key, question) {
  if (!key || typeof key.answer !== 'string' || !key.answer.trim()) return null;
  if (question.mode === 'sentence') {
    if (key.answer_format !== 'sentence') return null;
    const clean = v => v.normalize('NFKC').replace(/([a-z])-\s+([a-z])/g, '$1-$2').replace(/\s+/g, ' ').trim();
    return clean(answer) === clean(key.answer);
  }
  const clean = v => v.trim().toUpperCase().replace(/[\s,，/;；、]+/g, '');
  const a = clean(answer), b = clean(key.answer);
  if (/^[A-L]+$/.test(a) && /^[A-L]+$/.test(b)) {
    const normalize = v => question.type === 'tc' ? v : [...new Set(v)].sort().join('');
    return normalize(a) === normalize(b);
  }
  const number = v => {
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/[+-]?\d+(?:\.\d+)?)?$/.test(v)) return null;
    const [numerator, denominator = '1'] = v.split('/'), value = Number(numerator) / Number(denominator);
    return Number.isFinite(value) ? value : null;
  };
  const x = number(answer.trim()), y = number(key.answer.trim());
  return x !== null && y !== null ? Math.abs(x - y) <= 1e-10 * Math.max(1, Math.abs(y)) : null;
}
export async function sha256(value) {
  const data = typeof value === 'string' ? value : JSON.stringify(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const date = value => text(value) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
function validQuestion(value) { return object(value) && text(value.material) && text(value.unit) && text(String(value.question ?? '')) && PRACTICE_TYPES.includes(value.type); }
export function validatePreferences(preferences) {
  if (!object(preferences) || Object.keys(preferences).some(key => !['type', 'activeKey', 'split', 'readingSize', 'passagePositions'].includes(key))) throw Error('刷题设置格式无效');
  if (preferences.type != null && !PRACTICE_TYPES.includes(preferences.type)) throw Error('题型无效');
  if (preferences.activeKey != null && typeof preferences.activeKey !== 'string') throw Error('题号无效');
  if (preferences.split != null && (!Number.isFinite(preferences.split) || preferences.split < 10 || preferences.split > 90)) throw Error('分屏比例无效');
  if (preferences.readingSize != null && (!Number.isFinite(preferences.readingSize) || preferences.readingSize < 15 || preferences.readingSize > 22)) throw Error('阅读字号无效');
  if (preferences.passagePositions != null && (!object(preferences.passagePositions) || Object.keys(preferences.passagePositions).length > 1000
    || Object.values(preferences.passagePositions).some(value => !Number.isFinite(value) || value < 0 || value > 10000000))) throw Error('阅读位置无效');
  return preferences;
}
export function validateDocument(value, { maxBytes = MAX_BYTES - 8192 } = {}) {
  if (!object(value) || value.format !== 'gre-practice-storage' || value.version !== 1 || !text(value.dataset_id)
    || !Array.isArray(value.events) || !Array.isArray(value.legacy) || !Array.isArray(value.drafts) || !object(value.preferences) || !Array.isArray(value.seed_revisions)) throw Error('刷题记录格式不兼容，原数据已保留');
  validatePreferences(value.preferences);
  const ids = new Set(), submittedSessions = new Set();
  for (const event of value.events) {
    if (!object(event) || !text(event.id) || ids.has(event.id) || !date(event.recorded_at) || !['attempt', 'attempts_import'].includes(event.kind)) throw Error('刷题事件无效或重复，原数据已保留');
    ids.add(event.id);
    const items = event.kind === 'attempt' ? [event.payload] : event.payload?.items;
    if (!Array.isArray(items) || items.some(item => !validQuestion(item) || typeof item.answer !== 'string' || item.answer.length > 10000)) throw Error('刷题原始答案无效，原数据已保留');
    if (event.practice) {
      const item = event.practice;
      if (event.kind !== 'attempt' || !object(item) || !text(item.draft_session_id) || submittedSessions.has(item.draft_session_id)
        || !text(item.draft_id) || !text(item.bank_revision) || !text(item.content_id) || !object(item.question_snapshot)
        || item.question_snapshot.key !== questionKey(event.payload) || !Array.isArray(item.selected)
        || ![true, false, null].includes(item.result) || (item.answerKey !== null && (!object(item.answerKey) || typeof item.answerKey.answer !== 'string' || !text(item.answerKey.answer_source)))) throw Error('手机作答快照无效或重复提交，原数据已保留');
      submittedSessions.add(item.draft_session_id);
      const snapshot = item.question_snapshot;
      if (snapshot.version !== undefined) {
        if (snapshot.version !== 2 || snapshot.type !== event.payload.type || typeof snapshot.prompt !== 'string'
          || !['options', 'letters', 'groups', 'paragraphs', 'sentences', 'images', 'passageImages'].every(field => Array.isArray(snapshot[field]))
          || !['options', 'letters', 'paragraphs', 'sentences'].every(field => snapshot[field].every(value => typeof value === 'string'))
          || !snapshot.groups.every(group => Array.isArray(group) && group.every(value => typeof value === 'string'))
          || typeof snapshot.native !== 'boolean') throw Error('题库提交快照格式无效');
        if (!answerReady(snapshot, item.selected) || serializedAnswer(snapshot, item.selected) !== event.payload.answer
          || gradeAnswer(event.payload.answer, item.answerKey, snapshot) !== item.result) throw Error('题库提交快照与原始答案或判定不一致');
      }
    }
  }
  const legacyIds = new Set();
  for (const record of value.legacy) {
    const id = legacyId(record);
    if (!validQuestion(record) || !text(record.record) || !date(record.recorded_at) || legacyIds.has(id)) throw Error('旧训练来源无效或重复，原数据已保留');
    legacyIds.add(id);
  }
  const draftIds = new Set(), sessions = new Map();
  for (const draft of value.drafts) {
    if (!object(draft) || !text(draft.id) || !text(draft.session_id) || !text(draft.key) || !date(draft.updated_at) || typeof draft.redo !== 'boolean'
      || !Array.isArray(draft.answer) || draft.answer.length > 12 || draft.answer.some(answer => typeof answer !== 'string' || answer.length > 10000) || draftIds.has(draft.id)) throw Error('刷题草稿无效或重复，原数据已保留');
    draftIds.add(draft.id);
    if (sessions.has(draft.session_id) && sessions.get(draft.session_id) !== draft.key) throw Error('草稿轮次对应了不同题号，原数据已保留');
    sessions.set(draft.session_id, draft.key);
  }
  for (const event of value.events.filter(event => event.practice)) {
    const draft = value.drafts.find(draft => draft.id === event.practice.draft_id);
    if (!draft || draft.session_id !== event.practice.draft_session_id || draft.key !== questionKey(event.payload)
      || canonical(draft.answer) !== canonical(event.practice.selected)) throw Error('提交与原始草稿快照不一致，原数据已保留');
  }
  if (value.draft_heads !== undefined && (!object(value.draft_heads) || Object.entries(value.draft_heads).some(([key, id]) => !value.drafts.some(draft => draft.id === id && draft.key === key)))) throw Error('刷题草稿定位无效，原数据已保留');
  if (value.ai_reviews !== undefined) {
    if (!Array.isArray(value.ai_reviews)) throw Error('AI讲解记录格式无效');
    const reviewIds = new Set();
    for (const review of value.ai_reviews) {
      validateAiReview(review, value.events);
      if (reviewIds.has(review.id) || ids.has(review.id)) throw Error('AI讲解ID重复');
      reviewIds.add(review.id);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxBytes) throw Error('刷题记录超过 20 MB 备份上限，请先导出备份');
  return value;
}
export function validateAiReview(review, events) {
  const attempt = events.find(event => event.id === review?.attempt_id && ['attempt', 'attempts_import'].includes(event.kind));
  const hasQuestion = attempt && (attempt.kind === 'attempt' ? [attempt.payload] : attempt.payload.items).some(item => questionKey(item) === review.question_key);
  if (!object(review) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(review.id)
    || !date(review.recorded_at) || !hasQuestion
    || !/^[a-f0-9]{64}$/.test(review.input_hash) || !text(review.model) || review.model.length > 100
    || review.provisional !== true || !object(review.result) || Date.parse(review.recorded_at) < Date.parse(attempt.recorded_at)) throw Error('AI讲解编号、时间或原作答引用无效');
  const result = review.result;
  if (!['summary', 'evidence', 'reasoning_gap', 'next_action'].every(field => typeof result[field] === 'string' && result[field].trim())
    || !['supported', 'needs_review'].includes(result.assessment) || !Array.isArray(result.technique_ids)
    || !result.technique_ids.every(id => typeof id === 'string' && id.trim())) throw Error('AI讲解必要字段缺失');
  validateExplanation(result, attempt.practice?.question_snapshot || {});
  return review;
}
export const legacyId = record => JSON.stringify([record.record, questionKey(record)]);
export function emptyDocument(id) {
  return { format: 'gre-practice-storage', version: 1, dataset_id: id, seed_revisions: [], events: [], legacy: [], drafts: [], draft_heads: {}, preferences: {} };
}
export function recordsOf(document) {
  return document.events.flatMap(event => (event.kind === 'attempt' ? [event.payload] : event.payload.items).map((payload, index) => ({
    ...payload, event_id: event.id, item_index: event.kind === 'attempts_import' ? index : null, recorded_at: event.recorded_at,
    origin: event.practice ? 'mobile' : 'platform', practice: event.practice || null,
  })));
}
export function activeDrafts(document) {
  const submittedSessions = new Set(document.events.map(event => event.practice?.draft_session_id).filter(Boolean));
  const latestSubmission = new Map();
  for (const record of recordsOf(document)) if (record.practice) latestSubmission.set(questionKey(record), Math.max(latestSubmission.get(questionKey(record)) || 0, Date.parse(record.recorded_at)));
  const result = {};
  for (const draft of document.drafts) {
    if (submittedSessions.has(draft.session_id) || Date.parse(draft.updated_at) < (latestSubmission.get(draft.key) || 0)) continue;
    const old = result[draft.key];
    if (!old || Date.parse(draft.updated_at) >= Date.parse(old.updated_at)) result[draft.key] = draft;
  }
  for (const [key, id] of Object.entries(document.draft_heads || {})) {
    const draft = document.drafts.find(item => item.id === id);
    // An explicitly selected local draft survives a device clock correction.
    if (draft && !submittedSessions.has(draft.session_id)) result[key] = draft;
  }
  return result;
}
export function project(document, bank) {
  const records = recordsOf(document), counts = new Map(), latest = new Map(), contentDone = new Set(), drafts = activeDrafts(document);
  const index = new Map(PRACTICE_TYPES.flatMap(type => (bank.catalog[type]?.questions || []).map(q => [q.key, q])));
  for (const record of records) {
    const key = questionKey(record);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const record of [...records, ...document.legacy.map(record => ({ ...record, origin: 'legacy', answer: record.answer ?? null }))]) {
    const key = questionKey(record), previous = latest.get(key);
    if (!previous || Date.parse(record.recorded_at) > Date.parse(previous.recorded_at)) latest.set(key, record);
    const contentId = index.get(key)?.content_id;
    if (contentId) contentDone.add(contentId);
  }
  const catalog = {};
  for (const type of PRACTICE_TYPES) {
    const questions = (bank.catalog[type]?.questions || []).map(q => ({
      ...q, submitted: latest.has(q.key), sameContentDone: !latest.has(q.key) && contentDone.has(q.content_id), draft: !!drafts[q.key],
    }));
    const recent = records.filter(record => record.type === type).sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0]
      || document.legacy.filter(record => record.type === type).sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0];
    const previousIndex = recent ? questions.findIndex(q => q.key === questionKey(recent)) : -1;
    const unseen = q => !q.submitted && !q.sameContentDone;
    const next = questions.slice(previousIndex + 1).find(unseen) || questions.find(unseen);
    catalog[type] = { questions, recommended: questions.find(q => q.draft)?.key || next?.key || null };
  }
  return { catalog, drafts, preferences: document.preferences, latest, counts,
    stats: { attemptCount: records.length, eventCount: document.events.length, completedCount: latest.size, draftCount: Object.keys(drafts).length, legacyCount: document.legacy.length } };
}
export function mergeRecords(current, incoming) {
  const next = clone(current), conflicts = [], additions = {};
  for (const [kind, idOf] of [['events', item => item.id], ['legacy', legacyId], ['drafts', item => item.id], ['ai_reviews', item => item.id]]) {
    const existing = new Map((next[kind] || []).map(item => [idOf(item), item]));
    additions[kind] = 0;
    for (const item of incoming[kind] || []) {
      const id = idOf(item), old = existing.get(id);
      if (old) { if (canonical(old) !== canonical(item)) conflicts.push({ kind, id }); }
      else { existing.set(id, item); (next[kind] ||= []).push(clone(item)); additions[kind]++; }
    }
  }
  next.draft_heads = { ...(incoming.draft_heads || {}), ...(current.draft_heads || {}) };
  const submittedSessions = new Map();
  for (const event of next.events.filter(event => event.practice)) {
    const session = event.practice.draft_session_id;
    if (submittedSessions.has(session) && submittedSessions.get(session) !== event.id) conflicts.push({ kind: 'submission', id: session });
    submittedSessions.set(session, event.id);
  }
  // Retain every draft revision, but preserve the local active choice on merge.
  // Preferences are device-local and never overwritten by imported settings.
  return { next, preview: { format: BACKUP_FORMAT, eventCount: incoming.events.length, newEvents: additions.events, draftCount: incoming.drafts.length, newDrafts: additions.drafts, legacyCount: incoming.legacy.length, newLegacy: additions.legacy, newAiReviews: additions.ai_reviews, conflicts, canMerge: !conflicts.length } };
}
