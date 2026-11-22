// Builds WordWall.candidate.jsx from the production WordWall.jsx by applying the search
// changes, and writes the same changes as production.patch.
//
//   node platform/mobile/ui-redesign/search/make-candidate.mjs       (from the repository root)
//
// It never writes to platform/mobile/src. Each change is an exact text replacement and the
// script stops if the production file no longer contains the text it expects, so a stale
// patch cannot be produced silently.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = name => fileURLToPath(new URL(name, import.meta.url));
const source = await readFile(here('../../src/components/WordWall.jsx'), 'utf8');

// The changes, as they would be made in platform/mobile/src/components/WordWall.jsx.
const changes = [
  {
    why: 'startTransition, for the search input below',
    from: `import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';`,
    to: `import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';`,
  },
  {
    why: 'the one section of an ungrouped page was keyed by its first word, so the whole grid was rebuilt whenever the first result changed; key it by what it is',
    from: `<section className="wall-section" key={section.entries[0].key}>`,
    to: `<section className="wall-section" key={section.id}>`,
  },
  {
    why: 'use the search that sorts once and remembers the search text',
    from: `import { buildIndexes, emptyFilters, entrySections, filterCount, filterEntries, ratingLabels, relationshipLabels, wordRating } from '../model.mjs';`,
    to: `import { emptyFilters, entrySections, filterCount, ratingLabels, relationshipLabels, wordRating } from '../model.mjs';\nimport { buildIndexes, filterEntries } from '../wall-search.mjs';`,
  },
  {
    why: 'do not tear down and rebuild the whole page of tiles on every keystroke: while a query is being typed the page keeps one key, so React keeps the tiles that are still there',
    from: 'key={`${currentPage}:${filters.query}:${visible[0]?.key || \'\'}`}',
    to: 'key={`${currentPage}:${filters.query ? \'search\' : visible[0]?.key || \'\'}`}',
  },
  {
    why: 'do not search on unfinished IME composition text (pinyin letters)',
    from: `<input aria-label="搜索词库" type="search" autoCapitalize="none" autoComplete="off" placeholder="搜索单词" value={filters.query} onChange={e => changeQuery(e.target.value)}/>`,
    to: `<WallSearchInput value={filters.query} onChange={changeQuery}/>`,
  },
  {
    why: 'the input used above',
    from: `export default function WordWall(`,
    to: `// The search box keeps its own text, so a keystroke shows at once. The wall is asked to
// catch up as a transition: React may drop a half-finished result when the next key
// arrives, so fast typing never waits for results nobody will see. While an input method
// is still composing (pinyin letters), nothing is searched at all.
function WallSearchInput({ value, onChange }) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false), sent = useRef([]);
  // The wall's query arrives a moment after it was typed. If it is one this box sent, it
  // is only an echo and the box already shows newer text; anything else (the clear
  // button, a restored view) is a change from outside and replaces what the box shows.
  useEffect(() => {
    const echo = sent.current.lastIndexOf(value);
    if (echo >= 0) { sent.current.splice(0, echo + 1); return; }
    sent.current = [];
    if (!composing.current) setDraft(value);
  }, [value]);
  const search = text => { sent.current.push(text); startTransition(() => onChange(text)); };
  return <input aria-label="搜索词库" type="search" autoCapitalize="none" autoComplete="off" placeholder="搜索单词" value={draft}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={e => { composing.current = false; setDraft(e.currentTarget.value); search(e.currentTarget.value); }}
    onChange={e => { setDraft(e.target.value); if (!composing.current && !e.nativeEvent.isComposing) search(e.target.value); }}/>;
}

export default function WordWall(`,
  },
];

let patched = source;
for (const change of changes) {
  const count = patched.split(change.from).length - 1;
  if (count !== 1) throw new Error(`expected exactly one place for "${change.why}", found ${count}. WordWall.jsx has changed; update make-candidate.mjs.`);
  patched = patched.replace(change.from, () => change.to);
}

// The candidate copy lives next to this script, so its imports point back into src/.
const relocated = patched
  .replace(`from '../wall-search.mjs'`, `from './fast-filter.mjs'`)
  .replace(/from '\.\.\/(model\.mjs|wall-navigation\.mjs|card-reading-draft\.mjs|useBack)'/g, `from '../../src/$1'`)
  .replace(/from '\.\/(Primitives|WallSheets|WordTile|WordDetail)'/g, `from '../../src/components/$1'`)
  .replace(`import '../wordwall-redesign.css';`, `import '../../src/wordwall-redesign.css';`);
if (/from '\.\.?\/(?!\.\.\/src\/|fast-filter)/.test(relocated)) throw new Error('an import in the candidate still points at a path that only exists in src/');
await writeFile(here('WordWall.candidate.jsx'), `// GENERATED by make-candidate.mjs from platform/mobile/src/components/WordWall.jsx. Do not edit.\n${relocated}`);

// A unified diff for platform/mobile/src/components/WordWall.jsx, written by hand-rolled
// line comparison (the file is one statement per line, and each change touches whole lines).
const before = source.split('\n');
const after = patched.split('\n');
const hunks = [];
for (let i = 0, j = 0; i < before.length || j < after.length;) {
  if (before[i] === after[j]) { i++; j++; continue; }
  // Find where the two files line up again.
  let di = 0, dj = 0, found = false;
  for (let span = 1; span < 40 && !found; span++) {
    for (di = 0; di <= span && !found; di++) { dj = span - di; if (before[i + di] !== undefined && before[i + di] === after[j + dj]) found = true; }
    if (found) di--;
  }
  if (!found) throw new Error('could not line the patch up');
  hunks.push({ at: i, removed: before.slice(i, i + di), added: after.slice(j, j + dj), startAfter: j });
  i += di; j += dj;
}
const file = 'platform/mobile/src/components/WordWall.jsx';
let diff = `--- a/${file}\n+++ b/${file}\n`;
for (const h of hunks) {
  const lead = before.slice(Math.max(0, h.at - 1), h.at);
  const tail = before.slice(h.at + h.removed.length, h.at + h.removed.length + 1);
  diff += `@@ -${h.at - lead.length + 1},${lead.length + h.removed.length + tail.length} +${h.startAfter - lead.length + 1},${lead.length + h.added.length + tail.length} @@\n`;
  diff += [...lead.map(l => ` ${l}`), ...h.removed.map(l => `-${l}`), ...h.added.map(l => `+${l}`), ...tail.map(l => ` ${l}`)].join('\n') + '\n';
}
await writeFile(here('production.patch'), diff);
console.log(`WordWall.candidate.jsx written (${changes.length} changes). production.patch written (${hunks.length} hunks).`);
