import { wordRating, ratingLabels, relationshipLabels as baseRelationshipLabels } from '../../web/src/word-wall-model.mjs';

export { wordRating, ratingLabels };
export const relationshipLabels = { ...baseRelationshipLabels, custom: '自定义关系' };
export const PAGE_SIZE = 28;
export const emptyFilters = { query: '', topics: [], sources: [], relations: [], groups: [], ratings: [], letters: [], scope: 'all', sort: 'az' };
export const defaultDisplay = { columns: 4, height: 52, font: 14.5 };
export function displaySettings(value = {}) {
  return { columns: 4,
    height: Math.max(48, Math.min(100, Number(value.height) || 52)),
    font: Math.max(12, Math.min(22, Number(value.font) || 14.5)) };
}
export function sourceLabel(source) {
  const raw = source.record || source.material_id || '';
  const date = raw.match(/(20\d{2})(\d{2})(\d{2})/);
  const prefix = date ? `${date[1]}-${date[2]}-${date[3]} · ` : '';
  if (/handwritten|手写/i.test(`${raw} ${source.kind}`)) return `${prefix}手写笔记`;
  if (/captur|摘词/i.test(`${raw} ${source.kind}`)) return `${prefix}题中摘词`;
  if (/homework/i.test(raw)) return `${prefix}历史词汇训练`;
  return source.material_id || raw.split(/[\\/]/).at(-1)?.replace(/\.(json|md|yaml)$/i, '') || '历史词库';
}
export function buildIndexes(state) {
  const topics = (state.relations?.topics || []).filter(t => !t.deleted);
  const assignments = new Map((state.relations?.assignments || []).map(a => [a.word, a]));
  const schedules = new Map((state.spacedReview?.items || []).filter(i => i.kind === 'word').map(i => [i.word, i]));
  const sources = new Map(), sourceKeys = new Map();
  for (const word of state.vocabulary) {
    const keys = new Set((word.sources || []).map(sourceLabel));
    if (word.captures?.length) keys.add('题中摘词');
    if (!keys.size) keys.add('其他既有词库');
    for (const key of keys) sources.set(key, { id: key, name: key });
    sourceKeys.set(word.word, keys);
  }
  const groups = (state.relations?.groups || []).filter(g => !g.deleted).map(g => ({ id: g.id, name: g.title || g.id }));
  return { topics, groups, assignments, schedules, sources: [...sources.values()], sourceKeys };
}
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function filterEntries(state, filters, seed = 0, indexes = buildIndexes(state)) {
  const query = filters.query.trim().toLocaleLowerCase();
  const curation = new Set((state.curationRequests || []).map(item => item.word));
  const words = state.vocabulary.filter(w => {
    if (w.deleted) return false;
    const topics = indexes.assignments.get(w.word)?.topics || [];
    const schedule = indexes.schedules.get(w.word);
    return (!query || `${w.word} ${w.meaning} ${w.note || ''}`.toLocaleLowerCase().includes(query))
      && (!filters.topics.length || filters.topics.some(t => t === 'unclassified' ? !topics.length : topics.includes(t)))
      && (!filters.sources.length || filters.sources.some(s => indexes.sourceKeys.get(w.word)?.has(s)))
      && (!filters.ratings.length || filters.ratings.includes(wordRating(w)))
      && (!filters.letters.length || filters.letters.includes(w.word[0]?.toUpperCase()))
      && (filters.scope === 'all' || filters.scope === 'due' && schedule?.due_today || filters.scope === 'new' && !schedule?.has_history || filters.scope === 'missing' && !w.meaning?.trim() || filters.scope === 'curation' && curation.has(w.word));
  });
  words.sort((a, b) => filters.sort === 'random' ? hash(`${seed}:${a.word}`) - hash(`${seed}:${b.word}`)
    : filters.sort === 'za' ? b.word.localeCompare(a.word, 'en') : a.word.localeCompare(b.word, 'en'));
  if (!filters.relations.length && !filters.groups?.length) return words.map(w => ({ key: w.word, word: w.word, group: null }));
  const rank = new Map(words.map((w, i) => [w.word, i]));
  return (state.relations?.groups || []).filter(g => !g.deleted && (!filters.relations.length || filters.relations.includes(g.type)) && (!filters.groups?.length || filters.groups.includes(g.id)))
    .map(g => ({ ...g, members: g.members.filter(m => rank.has(m.word)).sort((a, b) => rank.get(a.word) - rank.get(b.word)) }))
    .filter(g => g.members.length).sort((a, b) => rank.get(a.members[0].word) - rank.get(b.members[0].word))
    .flatMap((group, i) => group.members.map(member => ({ key: `${group.id}:${member.word}`, word: member.word, group, groupNumber: i + 1 })));
}
export function entrySections(entries) {
  const sections = [];
  for (const entry of entries) {
    if (!sections.length || sections.at(-1).id !== (entry.group?.id || 'all')) sections.push({ id: entry.group?.id || 'all', group: entry.group, number: entry.groupNumber, entries: [] });
    sections.at(-1).entries.push(entry);
  }
  return sections;
}
export function filterCount(filters) { return ['topics', 'sources', 'relations', 'groups', 'ratings', 'letters'].reduce((n, key) => n + (filters[key]?.length || 0), 0) + (filters.scope !== 'all' ? 1 : 0); }
export function normalizeFilters(value = {}) {
  const next = { ...emptyFilters, ...value };
  for (const key of ['topics', 'sources', 'relations', 'groups', 'ratings', 'letters']) next[key] = Array.isArray(value[key]) ? value[key].filter(v => typeof v === 'string') : [];
  next.query = typeof next.query === 'string' ? next.query : '';
  next.scope = ['all', 'due', 'new', 'missing', 'curation'].includes(next.scope) ? next.scope : 'all';
  next.sort = ['az', 'za', 'random'].includes(next.sort) ? next.sort : 'az';
  next.relations = next.relations.filter(id => Object.hasOwn(relationshipLabels, id));
  next.ratings = next.ratings.filter(id => id === 'unrated' || Object.hasOwn(ratingLabels, id));
  next.letters = next.letters.filter(id => /^[A-Z]$/.test(id));
  return next;
}
