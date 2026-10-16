import { cleanWord, clone, projectState, validateData } from './model.mjs';
import { applyStandardDefinition } from '../../../shared/standard-definition.mjs';

export const CATALOG_REVISION = '2026-10-16-source-examples-3';

// Only content is merged. Never import desktop events, review baselines or rounds.
export function updateCatalog(current, incoming, revision) {
  const next = clone(current);
  const raw = projectState({...current, baseline:{...current.baseline, definitions:[]}});
  const localWords = new Map(raw.vocabulary.map(w => [w.word,w]));
  const incomingRaw = projectState({...incoming, baseline:{...incoming.baseline, definitions:[]}});
  let added = 0;
  for (const word of incomingRaw.vocabulary) {
    if (word.deleted || localWords.has(word.word)) continue;
    const fresh = cleanWord({...word, recalls:[], status:'未检验', feedback:'', deleted:false});
    next.baseline.vocabulary.push(fresh);
    localWords.set(word.word,fresh);
    added++;
  }
  const definitions = new Map((current.baseline.definitions || []).map(d => [d.word,d]));
  let updated = 0, preserved = 0;
  for (const d of incoming.baseline.definitions || []) {
    const local = localWords.get(d.word);
    if (!local || !d.senses.length) continue;
    if (applyStandardDefinition(local,d).definition_status === 'changed') { preserved++; continue; }
    definitions.set(d.word,clone(d)); updated++;
  }
  next.baseline.definitions = [...definitions.values()];
  const catalog = projectState(incoming);
  const catalogWords = new Set(catalog.vocabulary.map(w => w.word));
  const topics = new Map(next.baseline.relations.topics.map(t => [t.id,t]));
  for (const t of catalog.relations.topics.filter(t => !t.deleted)) {
    const assigned = catalog.relations.assignments.filter(a => a.topics.includes(t.id) && localWords.has(a.word)).map(a => a.word);
    const existing = topics.get(t.id);
    topics.set(t.id, {id:t.id, name:t.name, words:[...new Set([...(existing?.words || []).filter(w => !catalogWords.has(w)),...assigned])]});
  }
  next.baseline.relations.topics = [...topics.values()];
  // Existing phone topic/word_topics events still override these defaults.
  next.settings.catalogUpdate = {revision, updated, preserved, added};
  return validateData(next);
}
