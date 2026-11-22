// The fast search must return exactly what the original returns: same entries, same
// order, same groups. Run from the repository root:
//
//   node --test platform/mobile/tests/equivalence.test.mjs
//
// Synthetic data only (see synthetic-state.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEntries as original, buildIndexes as originalIndexes, emptyFilters } from '../src/model.mjs';
import { createWallSearch } from '../src/wall-search.mjs';
import { makeState, afterRating } from './synthetic-state.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A random but plausible set of filters for a given state.
function randomFilters(state, indexes, rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const some = (list, chance, max = 2) => (rand() < chance ? Array.from({ length: 1 + Math.floor(rand() * max) }, () => pick(list)) : []);
  const word = pick(state.vocabulary);
  const text = `${word?.word ?? ''} ${word?.meaning ?? ''} ${word?.note ?? ''}`;
  const start = Math.floor(rand() * Math.max(1, text.length - 3));
  const queries = ['', '', text.slice(start, start + 1 + Math.floor(rand() * 4)), pick(['a', 'E', 'ab', 'tra', '的', '清晰', '  re ', 'undefined', 'zzzz', '；', 'with']), (word?.word ?? '').toUpperCase().slice(0, 3)];
  return {
    ...emptyFilters,
    query: pick(queries),
    sort: pick(['az', 'az', 'za', 'random']),
    topics: some(['t0', 't1', 't5', 't10', 'unclassified'], 0.25),
    sources: some(indexes.sources.map(s => s.id), 0.2),
    ratings: some(['unrated', 'remembered', 'partial', 'forgotten'], 0.3),
    letters: some('ABCDEPRSTZ'.split(''), 0.2, 3),
    relations: some(['synonym', 'antonym', 'lookalike', 'custom'], 0.15),
    groups: some((state.relations.groups || []).map(g => g.id), 0.08, 1),
    scope: pick(['all', 'all', 'all', 'due', 'new', 'missing', 'curation']),
  };
}

for (const size of [0, 1, 40, 700]) {
  test(`same result as the original, ${size} words, 600 random filter sets`, () => {
    const state = makeState(size, 11 + size);
    const indexes = originalIndexes(state);
    const fast = createWallSearch();
    const rand = mulberry32(size + 5);
    for (let i = 0; i < 600; i++) {
      const filters = randomFilters(state, indexes, rand);
      const seed = Math.floor(rand() * 4);
      assert.deepStrictEqual(fast.filterEntries(state, filters, seed, indexes), original(state, filters, seed, indexes), JSON.stringify({ filters, seed }));
    }
  });
}

test('typing a query one character at a time gives the original result at every step', () => {
  const state = makeState(900, 3);
  const indexes = originalIndexes(state);
  const fast = createWallSearch();
  for (const typed of ['abracadab', '清晰易懂的', 'Per ', 'laissez-f', "o'c", 'résu']) {
    for (const sort of ['az', 'za', 'random']) {
      for (let n = 1; n <= typed.length; n++) {
        const filters = { ...emptyFilters, query: typed.slice(0, n), sort };
        assert.deepStrictEqual(fast.filterEntries(state, filters, 5, indexes), original(state, filters, 5, indexes), `${sort} "${typed.slice(0, n)}"`);
      }
    }
  }
});

test('after the library is replaced (a rating saved, a word added, a word deleted) results still match', () => {
  let state = makeState(500, 21);
  const fast = createWallSearch();
  const rand = mulberry32(99);
  const check = label => {
    const indexes = originalIndexes(state);
    for (let i = 0; i < 120; i++) {
      const filters = randomFilters(state, indexes, rand);
      assert.deepStrictEqual(fast.filterEntries(state, filters, 2, indexes), original(state, filters, 2, indexes), `${label} ${JSON.stringify(filters)}`);
    }
  };
  check('initial');
  state = afterRating(state); check('after a rating');
  state = { ...state, vocabulary: [...state.vocabulary, { word: 'aardvark', meaning: '土豚' }, { word: 'zymurgy', meaning: '酿造学', note: 'last' }] }; check('after adding words');
  state = { ...state, vocabulary: state.vocabulary.map((w, i) => (i % 37 === 0 ? { ...w, deleted: true } : w)) }; check('after deleting words');
  state = { ...state, vocabulary: state.vocabulary.map((w, i) => (i % 29 === 0 ? { ...w, meaning: '改过的释义', note: 'edited note' } : w)) }; check('after editing meanings');
  state = { ...state, vocabulary: [...state.vocabulary].reverse() }; check('after reordering');
});

test('buildIndexes gives the same indexes', () => {
  for (const size of [0, 30, 800]) {
    const state = makeState(size, 40 + size);
    const fast = createWallSearch();
    assert.deepStrictEqual(fast.buildIndexes(state), originalIndexes(state));
    assert.deepStrictEqual(fast.buildIndexes(afterRating(state)), originalIndexes(afterRating(state)));
  }
});
