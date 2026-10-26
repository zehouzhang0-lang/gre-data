import { createPracticeStorage } from './storage.mjs';
import { loadPracticeBank, validateBank } from './loader.mjs';
import { readPracticeBackup, practiceHistoryDocument } from './packages.mjs';
import { BACKUP_FORMAT, MAX_BYTES, PRACTICE_TYPES, clone, canonical, emptyDocument, validateDocument, validatePreferences, mergeRecords, project, questionKey, validateSelection, answerReady, serializedAnswer, gradeAnswer, sha256 } from './model.mjs';

let defaultRepository;
export function getPracticeRepository() {
  if (!defaultRepository) defaultRepository = openPracticeRepository().catch(error => { defaultRepository = null; throw error; });
  return defaultRepository;
}
export async function openPracticeRepository(options = {}) {
  const loaded = options.bank ? { bank: validateBank(options.bank), history: options.history || { events: [], legacy: [] }, loadQuestion: options.loadQuestion } : await loadPracticeBank(options.fetch);
  const { bank, history } = loaded, storage = options.storage || await createPracticeStorage(), now = options.now || (() => new Date()), makeId = options.makeId || (() => crypto.randomUUID());
  let current, queue = Promise.resolve();
  const listeners = new Set(), details = new Map(), index = new Map(PRACTICE_TYPES.flatMap(type => bank.catalog[type].questions.map(q => [q.key, q])));
  const persisted = await storage.read();
  if (persisted !== null && persisted !== undefined) {
    try { current = validateDocument(JSON.parse(persisted)); } catch (error) { throw Error(`刷题记录未能读取，请保留应用和原数据：${error.message}`); }
  } else current = emptyDocument(makeId());
  const enqueue = task => { const operation = queue.then(task); queue = operation.catch(() => {}); return operation; };
  async function persist(next) {
    validateDocument(next);
    await storage.write(JSON.stringify(next));
    current = next;
    for (const listener of listeners) { try { listener(); } catch { /* A UI listener cannot invalidate a committed transaction. */ } }
  }
  if (!current.seed_revisions.includes(bank.revision)) {
    const incoming = practiceHistoryDocument(history);
    const plan = mergeRecords(current, incoming);
    if (plan.preview.conflicts.length) throw Error('安装包与本机存在同 ID 不同内容的刷题记录，已保留双方并停止合并');
    plan.next.seed_revisions.push(bank.revision);
    await persist(plan.next);
  }
  function snapshot() {
    const { latest, counts, ...state } = project(current, bank);
    return { ...state, revision: bank.revision, storageKind: storage.kind || 'test' };
  }
  async function detailFor(key) {
    const meta = index.get(key);
    if (!meta) throw Error('安装包中没有这个题号');
    if (!details.has(key)) {
      const operation = Promise.resolve().then(() => loaded.loadQuestion(meta)).then(detail => {
        if (!detail || detail.key !== key || questionKey(detail) !== key || detail.type !== meta.type || detail.content_id !== meta.content_id) throw Error('题目内容与原题定位不一致');
        return clone(detail);
      }).catch(error => { details.delete(key); throw error; });
      details.set(key, operation);
    }
    return details.get(key);
  }
  const stamp = () => new Date(now()).toISOString();
  function draftFor(key) { return project(current, bank).drafts[key]; }
  function ensureEditable(key) {
    const projected = project(current, bank), meta = index.get(key);
    if (!meta) throw Error('题号不存在');
    const question = projected.catalog[meta.type].questions.find(q => q.key === key);
    // A draft started before another position was completed (or before new
    // bundled history arrived) remains a valid, resumable original response.
    if ((question.submitted || question.sameContentDone) && !projected.drafts[key]) throw Error('请先点击重做，再填写新的作答');
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async getState() { await queue; return clone(snapshot()); },
    async loadQuestion(key) {
      const detail = await detailFor(key); await queue;
      const projected = project(current, bank), record = projected.latest.get(key);
      const history = record ? {
        event_id: record.event_id || null, recorded_at: record.recorded_at, answer: record.answer ?? null,
        count: projected.counts.get(key) || null, origin: record.origin,
        result: record.practice ? record.practice.result : (record.answer ? gradeAnswer(record.answer, detail.answerKey, detail) : null),
        answerKey: record.practice ? record.practice.answerKey : detail.answerKey || null,
        source_ref: record.record || null,
      } : null;
      return clone({ ...detail, history, draft: projected.drafts[key] || null });
    },
    saveDraft(key, answer) {
      const selected = clone(answer);
      return enqueue(async () => {
        const detail = await detailFor(key); validateSelection(detail, selected); ensureEditable(key);
        const previous = draftFor(key);
        if (previous && canonical(previous.answer) === canonical(selected)) return clone(previous);
        const next = clone(current), draft = { id: makeId(), session_id: previous?.session_id || makeId(), key, answer: selected, redo: previous?.redo || false, updated_at: stamp() };
        next.drafts.push(draft); (next.draft_heads ||= {})[key] = draft.id; await persist(next); return clone(draft);
      });
    },
    startRedo(key) { return enqueue(async () => {
      await detailFor(key);
      const previous = draftFor(key);
      if (previous?.redo) return clone(previous);
      const next = clone(current), draft = { id: makeId(), session_id: makeId(), key, answer: [], redo: true, updated_at: stamp() };
      next.drafts.push(draft); (next.draft_heads ||= {})[key] = draft.id; await persist(next); return clone(draft);
    }); },
    submit(key) { return enqueue(async () => {
      const detail = await detailFor(key), draft = draftFor(key);
      if (!draft) {
        const event = [...current.events].reverse().find(event => event.practice && event.kind === 'attempt' && questionKey(event.payload) === key);
        if (event) return clone(event); // Double taps/retry after confirmed commit are idempotent.
        throw Error('请先选择或填写答案');
      }
      ensureEditable(key);
      if (!answerReady(detail, draft.answer)) throw Error('请完整填写本题答案后提交');
      const answer = serializedAnswer(detail, draft.answer), next = clone(current);
      const event = {
        schema_version: 1, id: makeId(), kind: 'attempt', recorded_at: stamp(),
        payload: { material: detail.material, unit: detail.unit, question: String(detail.question), type: detail.type, answer, duration_seconds: null, note: '', ...(detail.mode === 'sentence' ? { answer_format: 'sentence' } : {}) },
        practice: { draft_session_id: draft.session_id, draft_id: draft.id, bank_revision: bank.revision, content_id: detail.content_id,
          question_snapshot: { key: detail.key, mode: detail.mode, source: detail.source, provenance: detail.provenance || null },
          selected: clone(draft.answer), answerKey: clone(detail.answerKey || null), result: gradeAnswer(answer, detail.answerKey, detail) },
      };
      next.events.push(event); delete next.draft_heads?.[key]; await persist(next); return clone(event);
    }); },
    savePreferences(patch) { return enqueue(async () => {
      validatePreferences(patch);
      const next = clone(current);
      next.preferences = { ...next.preferences, ...clone(patch) };
      if (next.preferences.activeKey && !index.has(next.preferences.activeKey)) throw Error('题号无效');
      if (canonical(next.preferences) !== canonical(current.preferences)) await persist(next);
      return clone(next.preferences);
    }); },
    async backup() {
      await queue;
      const payload = clone(current);
      const result = JSON.stringify({ format: BACKUP_FORMAT, version: 1, created_at: stamp(), checksum: { algorithm: 'SHA-256', value: await sha256(payload) }, payload });
      if (new TextEncoder().encode(result).length > MAX_BYTES) throw Error('刷题备份超过 20 MB 上限，原记录保留');
      return result;
    },
    async previewImport(json) { const incoming = await readPracticeBackup(json); await queue; return mergeRecords(current, incoming).preview; },
    importBackup(json) { return enqueue(async () => {
      const incoming = await readPracticeBackup(json), plan = mergeRecords(current, incoming);
      if (plan.preview.conflicts.length) throw Error(`发现 ${plan.preview.conflicts.length} 条同 ID 不同内容的记录，未导入；双方记录均保留`);
      if (plan.preview.newEvents || plan.preview.newLegacy || plan.preview.newDrafts) await persist(plan.next);
      return clone(plan.preview);
    }); },
    async close() { await queue; storage.close?.(); },
  };
}
