// A drop-in for filterEntries and buildIndexes in ./model.mjs.
//
// It returns the same entries, in the same order, with the same groups. What changes is
// when the work happens. The original does all of this on every keystroke:
//
//   1. builds "word meaning note" and lower-cases it, for every word;
//   2. sorts every match with localeCompare(…, 'en'), or with two hashes per comparison;
//   3. looks up topics and schedule for every word, whether or not a filter needs them.
//
// Here:
//
//   1. the lower-cased search text is built once per word and remembered;
//   2. the order of the whole library is worked out once per sort (and per seed for the
//      random sort), and remembered for as long as the list of words is the same. A
//      keystroke then only walks that order and keeps what matches: no sorting at all;
//   3. a lookup is made only when its filter is switched on.
//
// Why the order is the same: the original filters in vocabulary order and then sorts
// stably. Sorting the whole library stably and then filtering leaves any two words in the
// same relative order, including words that compare equal.
//
// What the caches depend on: the app replacing state.vocabulary and the word objects in
// it when something changes, rather than editing them in place. WordWall.jsx already
// relies on exactly that (its useMemo calls are keyed on state.vocabulary).
import { wordRating, sourceLabel } from './model.mjs';

const collator = new Intl.Collator('en'); // what localeCompare(…, 'en') uses, built once
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

export function createWallSearch() {
  const text = new WeakMap();   // word object -> lower-cased "word meaning note"
  let book = null;              // { vocabulary, live, names, orders } for the latest library
  // One entry object per word, reused from call to call. WordTile is memoised on its
  // `entry` prop, so a tile whose word stays on screen while the query changes is then
  // left alone by React instead of being rendered again.
  const entries = new Map();
  const entryFor = w => {
    let entry = entries.get(w.word);
    if (!entry) { entry = { key: w.word, word: w.word, group: null }; entries.set(w.word, entry); }
    return entry;
  };

  const searchText = w => {
    let t = text.get(w);
    if (t === undefined) {
      t = `${w.word} ${w.meaning} ${w.note || ''}`.toLocaleLowerCase(); // the original expression, unchanged
      text.set(w, t);
    }
    return t;
  };

  // The words that are not deleted, in vocabulary order. When the library is replaced
  // but holds the same words in the same order (a rating was saved, a meaning edited),
  // the orders already worked out still apply.
  function bookFor(vocabulary) {
    if (book && book.vocabulary === vocabulary) return book;
    const live = vocabulary.filter(w => !w.deleted);
    const same = book && book.live.length === live.length && live.every((w, i) => w.word === book.names[i]);
    book = { vocabulary, live, names: same ? book.names : live.map(w => w.word), orders: same ? book.orders : new Map() };
    return book;
  }

  // Positions into `live`, in display order.
  function orderFor(b, sort, seed) {
    const key = sort === 'random' ? `random:${seed}` : sort === 'za' ? 'za' : 'az';
    let order = b.orders.get(key);
    if (order) return order;
    const names = b.names;
    order = Array.from(names, (_, i) => i);
    if (key === 'az') order.sort((i, j) => collator.compare(names[i], names[j]));
    else if (key === 'za') order.sort((i, j) => collator.compare(names[j], names[i]));
    else {
      const keys = names.map(name => hash(`${seed}:${name}`));
      order.sort((i, j) => keys[i] - keys[j]);
      for (const k of b.orders.keys()) if (k.startsWith('random:')) b.orders.delete(k); // one random order at a time
    }
    b.orders.set(key, order);
    return order;
  }

  function filterEntries(state, filters, seed = 0, indexes = buildIndexes(state)) {
    const query = filters.query.trim().toLocaleLowerCase();
    const b = bookFor(state.vocabulary);
    const order = orderFor(b, filters.sort, seed);
    const { topics, sources, ratings, letters, scope } = filters;
    const curation = scope === 'curation' ? new Set((state.curationRequests || []).map(item => item.word)) : null;
    const words = [];
    for (let n = 0; n < order.length; n++) {
      const w = b.live[order[n]];
      if (query && !searchText(w).includes(query)) continue;
      if (topics.length) {
        const assigned = indexes.assignments.get(w.word)?.topics || [];
        if (!topics.some(t => (t === 'unclassified' ? !assigned.length : assigned.includes(t)))) continue;
      }
      if (sources.length && !sources.some(s => indexes.sourceKeys.get(w.word)?.has(s))) continue;
      if (ratings.length && !ratings.includes(wordRating(w))) continue;
      if (letters.length && !letters.includes(w.word[0]?.toUpperCase())) continue;
      if (scope !== 'all') {
        const schedule = indexes.schedules.get(w.word);
        if (!(scope === 'due' && schedule?.due_today || scope === 'new' && !schedule?.has_history || scope === 'missing' && !w.meaning?.trim() || scope === 'curation' && curation.has(w.word))) continue;
      }
      words.push(w);
    }
    if (!filters.relations.length && !filters.groups?.length) return words.map(entryFor);
    // Grouped view: unchanged from the original.
    const rank = new Map(words.map((w, i) => [w.word, i]));
    return (state.relations?.groups || []).filter(g => !g.deleted && (!filters.relations.length || filters.relations.includes(g.type)) && (!filters.groups?.length || filters.groups.includes(g.id)))
      .map(g => ({ ...g, members: g.members.filter(m => rank.has(m.word)).sort((a, c) => rank.get(a.word) - rank.get(c.word)) }))
      .filter(g => g.members.length).sort((a, c) => rank.get(a.members[0].word) - rank.get(c.members[0].word))
      .flatMap((group, i) => group.members.map(member => ({ key: `${group.id}:${member.word}`, word: member.word, group, groupNumber: i + 1 })));
  }

  // buildIndexes runs after every saved change. Its cost is sourceLabel: a date match and
  // up to three pattern tests per source of every word, although a library has only a
  // handful of distinct sources. The label for each distinct source is worked out once.
  const labels = new Map();
  const labelOf = source => {
    const key = `${source.record || ''}\u0000${source.material_id || ''}\u0000${source.kind}`;
    let label = labels.get(key);
    if (label === undefined) { label = sourceLabel(source); labels.set(key, label); }
    return label;
  };
  function buildIndexes(state) {
    const topics = (state.relations?.topics || []).filter(t => !t.deleted);
    const assignments = new Map((state.relations?.assignments || []).map(a => [a.word, a]));
    const schedules = new Map((state.spacedReview?.items || []).filter(i => i.kind === 'word').map(i => [i.word, i]));
    const sources = new Map(), sourceKeys = new Map();
    for (const word of state.vocabulary) {
      const keys = new Set((word.sources || []).map(labelOf));
      if (word.captures?.length) keys.add('题中摘词');
      if (!keys.size) keys.add('其他既有词库');
      for (const key of keys) sources.set(key, { id: key, name: key });
      sourceKeys.set(word.word, keys);
    }
    const groups = (state.relations?.groups || []).filter(g => !g.deleted).map(g => ({ id: g.id, name: g.title || g.id }));
    return { topics, groups, assignments, schedules, sources: [...sources.values()], sourceKeys };
  }

  return { filterEntries, buildIndexes };
}

// One shared instance, for use exactly like the originals.
const shared = createWallSearch();
export const filterEntries = shared.filterEntries;
export const buildIndexes = shared.buildIndexes;
