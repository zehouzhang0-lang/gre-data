import { cleanWord, clone, projectState, validateData } from './model.mjs';
import { applyStandardDefinition } from '../../../shared/standard-definition.mjs';

export const CATALOG_REVISION = '2026-10-29-vocabulary-examples-1';

// Only content is merged. Never import desktop events, review baselines or rounds.
export function updateCatalog(current, incoming, revision) {
  const next = clone(current);
  const raw = projectState({...current, baseline:{...current.baseline, definitions:[]}});
  const localWords = new Map(raw.vocabulary.map(w => [w.word,w]));
  const existingWords = new Set(localWords.keys());
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
  const requested = new Set(current.events.filter(e => e.kind === 'vocab_curation_request').flatMap(e => e.payload.words));
  const edited = new Set(current.events.filter(e => e.kind === 'vocab_upsert').map(e => e.payload.word));
  let updated = 0, preserved = 0;
  for (const d of incoming.baseline.definitions || []) {
    const local = localWords.get(d.word);
    if (!local) continue;
    if (!d.senses.length) {
      // Retain a visible historical capture while identifying its confirmed
      // truncated spelling; never manufacture a meaning or hide its event.
      if(d.status==='spelling_redirect' && !local.deleted && !edited.has(d.word) && d.input.meaning===local.meaning && d.input.pos===local.pos){definitions.set(d.word,clone(d));updated++;}
      continue;
    }
    let definition = d;
    if (existingWords.has(d.word) && !local.meaning && !local.pos) {
      // Check every existing blank before fingerprint matching: a personal
      // bundle may already carry an adapted empty input from another phone.
      const existing=definitions.get(d.word);
      const sameEstablishedSenses=existing?.senses.length && applyStandardDefinition(local,existing).definition_status!=='changed'
        && JSON.stringify(existing.senses.map(({pos,meanings})=>({pos,meanings})))===JSON.stringify(d.senses.map(({pos,meanings})=>({pos,meanings})));
      const canFill = !local.deleted && (requested.has(d.word) || d.curation?.status === 'completed' || sameEstablishedSenses) && !edited.has(d.word)
        && ['dictionary_checked', 'historical_checked'].includes(d.status) && d.sources?.length
        && !['spelling_pending', 'spelling_redirect'].includes(definitions.get(d.word)?.status);
      if (!canFill) { preserved++; continue; }
      definition = {...d, input:{meaning:local.meaning, pos:local.pos}};
    } else if (applyStandardDefinition(local,d).definition_status === 'changed') { preserved++; continue; }
    definitions.set(d.word,clone(definition)); updated++;
  }
  next.baseline.definitions = [...definitions.values()];
  const catalog = projectState(incoming);
  const catalogWords = new Set(catalog.vocabulary.map(w => w.word));
  const topics = new Map(next.baseline.relations.topics.map(t => [t.id,t]));
  for (const t of catalog.relations.topics.filter(t => !t.deleted && !t.custom)) {
    const assigned = catalog.relations.assignments.filter(a => a.topics.includes(t.id) && localWords.has(a.word)).map(a => a.word);
    const existing = topics.get(t.id);
    topics.set(t.id, {id:t.id, name:t.name, words:[...new Set([...(existing?.words || []).filter(w => !catalogWords.has(w)),...assigned])]});
  }
  next.baseline.relations.topics = [...topics.values()];
  // A phone's group ID belongs to the phone even when its latest event deletes
  // it. Append complete new groups only; never replace or resurrect local ones.
  const groupIds = new Set([
    ...next.baseline.relations.groups.map(g => g.id),
    ...current.events.filter(e => ['relation_upsert', 'relation_delete', 'relation_restore'].includes(e.kind)).map(e => e.payload.id),
    ...current.events.filter(e => e.kind === 'vocab_word_group').map(e => e.payload.id),
  ]);
  for (const group of catalog.relations.groups) {
    if (group.custom || group.deleted || groupIds.has(group.id) || !group.members.every(m => localWords.has(m.word) && !localWords.get(m.word).deleted)) continue;
    const {id, type, title, note, source, sources, members} = group;
    next.baseline.relations.groups.push(clone({id, type, title, note, source, sources:sources || [], members:members.map(({word, usage, example}) => ({word, usage, example}))}));
    groupIds.add(group.id);
  }
  // Existing phone topic/word_topics events still override these defaults.
  next.settings.catalogUpdate = {revision, updated, preserved, added};
  return validateData(next);
}
