// How long does one keystroke of wall search cost? Original against fast, same input.
//
//   node platform/mobile/ui-redesign/search/bench.mjs            (from the repository root)
//
// Synthetic libraries of several sizes; the real library is never read. This measures the
// search function only, on this machine's CPU, in Node. It does not include React, layout
// or paint, and a phone will be several times slower. Read the ratios, not the milliseconds.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { filterEntries as original, buildIndexes as originalIndexes, emptyFilters } from '../../src/model.mjs';
import { createWallSearch } from './fast-filter.mjs';
import { makeState, afterRating } from './synthetic-state.mjs';

const TYPED = ['p', 'pe', 'per', 'pers', 'persi', '清', '清晰', 'a', 'ab', 'tra', 'trac', 'x', 'xq'];
const stat = values => {
  const s = [...values].sort((a, b) => a - b);
  const at = q => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
  return { median: +((s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2).toFixed(3), p95: +at(0.95).toFixed(3) };
};
const time = fn => { const t = performance.now(); fn(); return performance.now() - t; };

function typing(search, state, indexes, sort, rounds) {
  const samples = [];
  for (let r = 0; r < rounds; r++) {
    for (const query of TYPED) samples.push(time(() => search(state, { ...emptyFilters, query, sort }, 3, indexes)));
  }
  return stat(samples);
}

const report = { ranAt: new Date().toISOString(), node: process.version, platform: `${process.platform} ${process.arch}`, typed: TYPED, note: 'ms per call; search function only; synthetic library', sizes: [] };
for (const size of [2000, 5000, 10000, 20000]) {
  const state = makeState(size, 100 + size);
  const indexes = originalIndexes(state);
  const fast = createWallSearch();
  const rounds = size > 5000 ? 8 : 16;
  // Warm both up, so neither is measured on a cold JIT.
  for (let i = 0; i < 3; i++) { original(state, { ...emptyFilters, query: 'e' }, 3, indexes); fast.filterEntries(state, { ...emptyFilters, query: 'e' }, 3, indexes); }
  const row = { words: size, perKeystroke: {}, indexes: {}, firstSearchAfterChange: {} };
  for (const sort of ['az', 'random']) {
    const a = typing(original, state, indexes, sort, rounds);
    const b = typing(fast.filterEntries, state, indexes, sort, rounds);
    row.perKeystroke[sort] = { original: a, fast: b, timesFaster: +(a.median / b.median).toFixed(1) };
  }
  // With a rating filter on as well, as when browsing "完全忘记" and typing.
  const filtered = (search) => stat(Array.from({ length: rounds * 3 }, (_, i) => time(() => search(state, { ...emptyFilters, query: TYPED[i % TYPED.length], ratings: ['forgotten', 'partial'] }, 3, indexes))));
  { const a = filtered(original), b = filtered(fast.filterEntries); row.perKeystroke.withRatingFilter = { original: a, fast: b, timesFaster: +(a.median / b.median).toFixed(1) }; }
  // What the fast version pays once, after the library changed.
  const changed = afterRating(state);
  const changedIndexes = originalIndexes(changed);
  row.firstSearchAfterChange.sameWords = +time(() => fast.filterEntries(changed, { ...emptyFilters, query: 'per' }, 3, changedIndexes)).toFixed(3);
  const added = { ...changed, vocabulary: [...changed.vocabulary, { word: 'zzzadded', meaning: '新词' }] };
  const addedIndexes = originalIndexes(added);
  row.firstSearchAfterChange.wordAdded = +time(() => fast.filterEntries(added, { ...emptyFilters, query: 'per' }, 3, addedIndexes)).toFixed(3);
  row.firstSearchAfterChange.original = +time(() => original(added, { ...emptyFilters, query: 'per' }, 3, addedIndexes)).toFixed(3);
  // buildIndexes, which runs after every saved change.
  const ia = stat(Array.from({ length: 12 }, () => time(() => originalIndexes(state))));
  const ib = stat(Array.from({ length: 12 }, () => time(() => fast.buildIndexes(state))));
  row.indexes = { original: ia, fast: ib, timesFaster: +(ia.median / ib.median).toFixed(1) };
  report.sizes.push(row);
  const k = row.perKeystroke;
  console.log(`${String(size).padStart(6)} words | keystroke A–Z: ${k.az.original.median} -> ${k.az.fast.median} ms (${k.az.timesFaster}x, P95 ${k.az.original.p95} -> ${k.az.fast.p95}) | random: ${k.random.original.median} -> ${k.random.fast.median} ms (${k.random.timesFaster}x) | with rating filter: ${k.withRatingFilter.original.median} -> ${k.withRatingFilter.fast.median} ms (${k.withRatingFilter.timesFaster}x)`);
  console.log(`${''.padStart(6)}       | first search after a change: same words ${row.firstSearchAfterChange.sameWords} ms, word added ${row.firstSearchAfterChange.wordAdded} ms (original ${row.firstSearchAfterChange.original} ms) | buildIndexes: ${ia.median} -> ${ib.median} ms (${row.indexes.timesFaster}x)`);
}
await writeFile(fileURLToPath(new URL('./BENCH.json', import.meta.url)), JSON.stringify(report, null, 2));
console.log('\nwritten to BENCH.json');
