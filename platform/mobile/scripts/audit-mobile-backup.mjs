// Archive and audit a user-supplied backup without writing to either app database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPackage } from '../src/data/packages.mjs';
import { projectState, VOCAB_EVENT_KINDS } from '../src/data/model.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const [input, stem] = process.argv.slice(2);
if (!input || !stem || !/^vocab\/imports\/\d{8}_\d{4}_[a-z_]+$/.test(stem)) {
  throw Error('Usage: node audit-mobile-backup.mjs <backup.json> vocab/imports/YYYYMMDD_HHMM_mobile_backup');
}
const raw = await fs.readFile(input, 'utf8'), packet = JSON.parse(raw);
const { data, format } = await readPackage(raw);
if (format !== 'gre-vocabulary-backup') throw Error('需要手机完整备份，不接受词库种子代替。');
const capturedAt = packet.created_at;
if (!Number.isFinite(Date.parse(capturedAt))) throw Error('备份导出时间无效');
const state = projectState(data, new Date(capturedAt));
const hash = createHash('sha256').update(raw).digest('hex');
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const eventIdentity = e => JSON.stringify(canonical({ ...e, recorded_at: new Date(e.recorded_at).toISOString() }));
const desktop = new Map();
for (const file of (await fs.readdir(path.join(root, 'platform/events'))).filter(f => f.endsWith('.json'))) {
  const e = JSON.parse(await fs.readFile(path.join(root, 'platform/events', file), 'utf8'));
  desktop.set(e.id, e);
}
const rawById = new Map(packet.payload.events.map(e => [e.id, e]));
const shared = [], phoneOnly = [], conflicts = [];
for (const event of data.events) {
  const original = rawById.get(event.id), other = desktop.get(event.id);
  if (!other) phoneOnly.push(original);
  else if (eventIdentity(original) === eventIdentity(other)) shared.push(event.id);
  else conflicts.push(event.id);
}
if (conflicts.length) throw Error(`同编号记录冲突；停止归档分析，不覆盖双方：${conflicts.join(', ')}`);
const kinds = events => Object.fromEntries([...new Set(events.map(e => e.kind))].sort().map(kind => [kind, events.filter(e => e.kind === kind).length]));
const vocabulary = new Map(state.vocabulary.map(w => [w.word, w]));
const assignments = new Map(state.relations.assignments.map(a => [a.word, a]));
const topicNames = new Map(state.relations.topics.map(t => [t.id, t.name]));
const taskList = state.curationRequests.map(request => {
  const w = vocabulary.get(request.word), senses = w?.senses || [];
  const total = senses.reduce((sum, group) => sum + group.meanings.length, 0);
  const present = senses.reduce((sum, group) => sum + group.meanings.filter((_, i) => !!group.examples?.[i]).length, 0);
  const topics = assignments.get(request.word)?.topics || [];
  const recalls = [...(w?.recalls || [])].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return {
    ...request, status: 'pending', tasks: ['核对词形和词性', '整理分类', '核对并补齐具体释义', '补查逐义项 ETS／Oxford 原例句，未找到留空'],
    current: {
      meaning: w?.meaning || '', definition_status: w?.definition_status || 'unstructured',
      topics: topics.map(id => ({ id, name: topicNames.get(id) })),
      sense_count: total, example_count: present, missing_example_count: total - present,
      deleted: !!w?.deleted, latest_self_rating: recalls.at(-1)?.self_rating || null,
      latest_recall_at: recalls.at(-1)?.recorded_at || null,
    },
    observed_gaps: [
      ...(!w?.meaning ? ['missing_meaning'] : []),
      ...(!senses.length ? ['missing_structured_senses'] : []),
      ...(!topics.length ? ['uncategorized'] : []),
      ...(total > present ? ['missing_sense_examples'] : []),
    ],
  };
});
const recallItems = state.vocabulary.flatMap(w => w.recalls.map(r => ({ word: w.word, ...r })));
const byDay = {};
for (const e of phoneOnly) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: data.time_zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(e.recorded_at));
  byDay[day] ||= {};
  byDay[day][e.kind] = (byDay[day][e.kind] || 0) + 1;
}
const summary = {
  schema_version: 1, kind: 'mobile_backup_audit', assessment: 'source_records_only',
  source: { filename: path.basename(input), sha256: hash, payload_checksum: packet.checksum.value, created_at: capturedAt, dataset_id: data.dataset_id, time_zone: data.time_zone },
  audited_at: new Date().toISOString(),
  semantics: '本文件仅归档和核对手机证据；不向 platform/events 写事件，不替换手机数据库，不把自评或翻阅改为已掌握。',
  counts: {
    vocabulary_total: state.vocabulary.length, vocabulary_visible: state.vocabulary.filter(w => !w.deleted).length,
    raw_events: data.events.length, event_kinds: kinds(data.events),
    shared_desktop_event_ids: shared.length, phone_only_events: phoneOnly.length, conflicting_event_ids: 0,
    desktop_only_vocab_events: [...desktop.values()].filter(e => VOCAB_EVENT_KINDS.has(e.kind) && !rawById.has(e.id)).length,
    effective_recalls: recallItems.length, words_with_recall: new Set(recallItems.map(r => r.word)).size,
    recall_modes: Object.fromEntries([...new Set(recallItems.map(r => r.mode))].map(mode => [mode, recallItems.filter(r => r.mode === mode).length])),
    curation_words: taskList.length, recorded_browsing_words: state.cardReadings.length,
    recorded_browsing_count: state.cardReadings.reduce((sum, r) => sum + r.view_count, 0),
    sessions: state.vocabSessions.length, complete_sessions: state.vocabSessions.filter(s => s.complete).length,
    pending_sessions: state.vocabSessions.filter(s => !s.complete).length,
  },
  phone_only_events_by_day: byDay,
  desktop_only_vocab_event_refs: [...desktop.values()]
    .filter(e => VOCAB_EVENT_KINDS.has(e.kind) && !rawById.has(e.id))
    .map(e => ({ id: e.id, kind: e.kind, recorded_at: e.recorded_at, word: e.payload.word || null, record: `platform/events/${e.id}.json` })),
  phone_only_event_kinds: kinds(phoneOnly),
  last_event_at: data.events.at(-1)?.recorded_at || null,
  last_recall_at: recallItems.map(r => r.recorded_at).sort().at(-1) || null,
  sessions: state.vocabSessions.map(s => ({
    session_id: s.session_id, recorded_at: s.recorded_at, words: s.words,
    completed_words: s.completed_words, drill_count: s.drill_count, complete: s.complete, completed_at: s.completed_at,
  })),
  curation_requests: taskList,
  phone_word_edits: phoneOnly.filter(e => e.kind === 'vocab_upsert'),
  shared_desktop_event_ids: shared,
  phone_only_events: phoneOnly,
};
const archiveDir = path.join(root, '.gre-platform/mobile-backups');
await fs.mkdir(archiveDir, { recursive: true });
const archive = path.join(archiveDir, `${hash}.json`);
try { await fs.writeFile(archive, raw, { flag: 'wx' }); }
catch (error) { if (error.code !== 'EEXIST' || await fs.readFile(archive, 'utf8') !== raw) throw error; }
summary.source.local_archive = path.relative(root, archive).replaceAll('\\', '/');
await fs.writeFile(path.join(root, `${stem}.json`), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ source: summary.source, counts: summary.counts, phone_only_event_kinds: summary.phone_only_event_kinds, pending: summary.sessions.filter(s => !s.complete), curation_gaps: {
  no_meaning: taskList.filter(t => !t.current.meaning).length,
  unstructured: taskList.filter(t => !t.current.sense_count).length,
  uncategorized: taskList.filter(t => !t.current.topics.length).length,
  incomplete_examples: taskList.filter(t => t.current.missing_example_count > 0).length,
} }, null, 2));
