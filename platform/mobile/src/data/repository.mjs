import { clone, cleanWord, validateData, projectState, prepareEvent, ensureRound, MAX_FILE_BYTES } from './model.mjs';
import { BACKUP_FORMAT, createPackage, readPackage } from './packages.mjs';
import { createStorage } from './storage.mjs';
import { dayKey } from '../../../server/spaced-review.mjs';

export function emptyData(timeZone = 'Asia/Shanghai') {
  return { schema_version: 1, dataset_id: crypto.randomUUID(), time_zone: timeZone, baseline: { vocabulary: [], legacyWords: [], relations: { topics: [], groups: [] } }, events: [], quickRound: null, settings: {} };
}
function planImport(current, incoming) {
  const existing = projectState(current), imported = projectState(incoming);
  const words = new Map(existing.vocabulary.map(w => [w.word, w]));
  const additions = imported.vocabulary.filter(w => !w.deleted && !words.has(w.word));
  const conflicts = [];
  for (const word of imported.vocabulary.filter(w => !w.deleted && words.has(w.word))) {
    const local = words.get(word.word);
    if (['meaning', 'pos', 'note'].some(key => local[key] !== word[key]) || local.deleted) conflicts.push({ type: 'word', word: word.word, existing: local.meaning, incoming: word.meaning });
  }
  const localTopics = new Map(existing.relations.topics.map(t => [t.id, t])), localGroups = new Map(existing.relations.groups.map(g => [g.id, g]));
  const topics = imported.relations.topics.filter(t => !t.deleted && !localTopics.has(t.id) && !existing.relations.topics.some(l => l.name === t.name));
  for (const t of imported.relations.topics.filter(t => !t.deleted)) {
    const local = localTopics.get(t.id);
    if (local && (local.name !== t.name || local.deleted)) conflicts.push({ type: 'topic', word: t.name, existing: local.name, incoming: t.name });
  }
  const available = new Set([...words.keys(), ...additions.map(w => w.word)]);
  const groups = imported.relations.groups.filter(g => !g.deleted && !localGroups.has(g.id) && g.members.every(m => available.has(m.word)));
  for (const g of imported.relations.groups.filter(g => !g.deleted && localGroups.has(g.id))) {
    const local = localGroups.get(g.id);
    const content = group => JSON.stringify([group.title, group.type, group.note, group.members.map(m => [m.word, m.usage, m.example])]);
    if (local.deleted || content(local) !== content(g)) conflicts.push({ type: 'group', word: g.title, existing: local.title, incoming: g.title });
  }
  return { existing, imported, additions, topics, groups, preview: { newWords: additions.length, existingWords: imported.vocabulary.filter(w => !w.deleted && words.has(w.word)).length, conflicts, wordCount: imported.vocabulary.filter(w => !w.deleted).length, eventCount: incoming.events.length, newTopics: topics.length, newGroups: groups.length, addedWords: additions.map(w => w.word), ignoresReviewHistory: true } };
}
export async function openRepository(options = {}) {
  const storage = options.storage || await createStorage(), now = options.now || (() => new Date()), makeId = options.makeId || (() => crypto.randomUUID());
  let current, recovery = null, queue = Promise.resolve();
  const persisted = await storage.read();
  if (persisted != null) {
    let document;
    try { document = JSON.parse(persisted); } catch { throw Error('本机数据无法读取；请保留应用，使用备份恢复，不要卸载'); }
    if (document.storage_version !== 1) throw Error('不支持的本机数据库版本，请升级应用，当前数据保留');
    current = validateData(document.current);
    recovery = document.recovery ? validateData(document.recovery) : null;
  } else {
    if (options.seed) current = typeof options.seed === 'string' ? (await readPackage(options.seed)).data : validateData(options.seed);
    else {
      const response = await fetch('./vocabulary-seed.json');
      if (!response.ok) throw Error('安装包词库缺失，请安装完整版本；未创建空白库覆盖记录');
      current = (await readPackage(await response.text())).data;
    }
    ensureRound(current, now(), makeId);
    await storage.write(JSON.stringify({ storage_version: 1, current, recovery }));
  }
  const enqueue = task => { const operation = queue.then(task); queue = operation.catch(() => {}); return operation; };
  async function persist(next, nextRecovery = recovery) {
    // Both the replacement and its pre-restore safety copy are one transaction.
    const encoded = JSON.stringify({ storage_version: 1, current: next, recovery: nextRecovery });
    if (new TextEncoder().encode(JSON.stringify(next)).length > MAX_FILE_BYTES - 8192) throw Error('本机数据超过备份上限，请先导出备份并联系维护者；此次操作未保存');
    await storage.write(encoded);
    current = next; recovery = nextRecovery;
  }
  function snapshot() { return { ...projectState(current, now()), hasRecovery: !!recovery, storageKind: storage.kind || 'test', eventCount: current.events.length }; }
  function addEvent(next, kind, payload, id = makeId()) {
    const event = prepareEvent(next, kind, payload, id, now());
    if (!next.events.some(e => e.id === event.id)) next.events.push(event);
    return event;
  }
  return {
    async getState() { await queue; return clone(snapshot()); },
    saveEvent(kind, payload, id = makeId()) { return enqueue(async () => { const next = clone(current), event = addEvent(next, kind, payload, id); await persist(next); return clone(event); }); },
    rate(words, rating, id = makeId()) { return enqueue(async () => {
      const next = clone(current), round = ensureRound(next, now(), makeId);
      const event = addEvent(next, 'vocab_quick_review', { session_id: round.id, items: [...new Set(words.map(w => typeof w === 'string' ? w : w.word))].map(word => ({ word, self_rating: rating })) }, id);
      await persist(next); return clone(event);
    }); },
    startQuickRound() { return enqueue(async () => { const next = clone(current); next.quickRound = { day: dayKey(now(), current.time_zone), id: makeId() }; await persist(next); return clone(next.quickRound); }); },
    undoQuickReview() { return enqueue(async () => { const target = snapshot().undoId; if (!target) throw Error('没有可撤销的标记'); const next = clone(current), event = addEvent(next, 'vocab_quick_undo', { target_id: target }); await persist(next); return clone(event); }); },
    setSettings(patch) { return enqueue(async () => { const next = clone(current); next.settings = { ...next.settings, ...clone(patch) }; const checked = validateData(next); await persist(checked); return clone(checked.settings); }); },
    async backup() { await queue; return createPackage(current, BACKUP_FORMAT, now()); },
    async backupRecovery() { await queue; if (!recovery) throw Error('没有恢复前快照'); return createPackage(recovery, BACKUP_FORMAT, now()); },
    async previewImport(json) { await queue; const packet = await readPackage(json); return { ...planImport(current, packet.data).preview, kind: packet.format, canRestore: packet.format === BACKUP_FORMAT }; },
    importVocabulary(json) { return enqueue(async () => {
      const packet = await readPackage(json), plan = planImport(current, packet.data), next = clone(current), added = new Set(plan.additions.map(w => w.word));
      next.baseline.vocabulary.push(...plan.additions.map(w => cleanWord({ ...w, recalls: [], deleted: false })));
      const assignments = new Map(plan.imported.relations.assignments.map(a => [a.word, a.topics]));
      // Only new words receive imported classifications. Existing words, all phone
      // learning events, old review baselines and unfinished rounds are untouched.
      for (const topic of plan.topics) next.baseline.relations.topics.push({ id: topic.id, name: topic.name, words: [...added].filter(w => assignments.get(w)?.includes(topic.id)) });
      for (const topic of next.baseline.relations.topics) {
        const incomingTopic = plan.imported.relations.topics.find(t => t.id === topic.id);
        if (incomingTopic?.name === topic.name && !incomingTopic.deleted) topic.words = [...new Set([...topic.words, ...[...added].filter(w => assignments.get(w)?.includes(topic.id))])];
      }
      next.baseline.relations.groups.push(...plan.groups.map(({ members, id, type, title, note, source, sources }) => ({ id, type, title, note, source, sources: sources || [], members: members.map(({ word, usage, example }) => ({ word, usage, example })) })));
      await persist(validateData(next)); return clone(plan.preview);
    }); },
    restore(json) { return enqueue(async () => {
      const packet = await readPackage(json);
      if (packet.format !== BACKUP_FORMAT) throw Error('完整恢复仅接受完整备份；词库包请使用“导入新增词”');
      const replacement = packet.data;
      await persist(replacement, clone(current));
      return clone(snapshot());
    }); },
    restorePrevious() { return enqueue(async () => {
      if (!recovery) throw Error('没有恢复前快照');
      const previous = validateData(recovery);
      await persist(previous, clone(current)); return clone(snapshot());
    }); },
    async close() { await queue; storage.close?.(); },
  };
}
