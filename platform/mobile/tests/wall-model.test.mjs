import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDisplay, displaySettings, emptyFilters, filterEntries, entrySections, normalizeFilters } from '../src/model.mjs';

const word = (word, rating, deleted = false) => ({ word, meaning: '示例释义', note: '', deleted, sources: [], recalls: rating ? [{ self_rating: rating }] : [] });
const state = {
  vocabulary: [word('lucid', 'remembered'), word('limpid', 'partial'), word('cryptic', 'forgotten'), word('clear'), word('removed', null, true)],
  relations: {
    topics: [{ id: 'clarity', name: '表达' }, { id: 'mystery', name: '神秘' }],
    assignments: [{ word: 'lucid', topics: ['clarity'] }, { word: 'limpid', topics: ['clarity'] }, { word: 'cryptic', topics: ['mystery'] }],
    groups: [
      { id: 'syn', type: 'synonym', members: [{ word: 'lucid' }, { word: 'limpid' }, { word: 'clear' }] },
      { id: 'opp', type: 'antonym', members: [{ word: 'lucid' }, { word: 'cryptic' }] },
    ],
  },
  spacedReview: { items: [{ kind: 'word', word: 'cryptic', due_today: true, has_history: true }, { kind: 'word', word: 'lucid', due_today: false, has_history: true }] },
};
const entries = filters => filterEntries(state, { ...emptyFilters, ...filters });

test('mobile defaults to four columns and supports two-column comfortable layout', () => {
  assert.equal(defaultDisplay.columns, 4);
  assert.equal(displaySettings({ columns: 2 }).columns, 2);
  assert.equal(displaySettings({ columns: 100, height: 2, font: 90 }).columns, 4);
  assert.ok(displaySettings({ height: 2 }).height >= 48);
});

test('OR within filters, AND across dimensions; hidden words never enter wall', () => {
  assert.deepEqual(entries({ topics: ['clarity', 'mystery'], ratings: ['partial', 'forgotten'] }).map(e => e.word), ['cryptic', 'limpid']);
  assert.deepEqual(entries({ letters: ['L'], topics: ['mystery'] }), []);
  assert.deepEqual(entries({ scope: 'due' }).map(e => e.word), ['cryptic']);
  assert.ok(!entries({}).some(e => e.word === 'removed'));
  assert.deepEqual(entries({ ratings: ['unrated'] }).map(e => e.word), ['clear']);
});

test('relationship display keeps groups adjacent without pulling words outside explicit filters', () => {
  const grouped = entries({ relations: ['synonym', 'antonym'], letters: ['L', 'C'] });
  assert.equal(grouped.filter(e => e.word === 'lucid').length, 2);
  assert.equal(new Set(grouped.map(e => e.key)).size, grouped.length);
  assert.equal(entrySections(grouped).length, 2);
  const onlyL = entries({ relations: ['synonym', 'antonym'], letters: ['L'] });
  assert.ok(onlyL.every(e => e.word.startsWith('l')));
});

test('random order remains stable within one seed and settings input is normalized', () => {
  const filters = { ...emptyFilters, sort: 'random' };
  assert.deepEqual(filterEntries(state, filters, 123), filterEntries(state, filters, 123));
  assert.deepEqual(normalizeFilters({ letters: 'L', query: 7 }).letters, []);
  assert.equal(normalizeFilters({ query: 7 }).query, '');
});
