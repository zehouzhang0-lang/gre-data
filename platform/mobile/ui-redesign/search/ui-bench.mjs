// What does one keystroke of search cost in the real wall component?
//
//   node platform/mobile/ui-redesign/search/ui-bench.mjs          (from the repository root;
//                                                                  the prototype server on 4188 must be running)
//
// Mounts platform/mobile/src/components/WordWall.jsx (original) and the generated
// WordWall.candidate.jsx on synthetic libraries, in a new headless Chrome, and types the
// same text into both. For every keystroke it records:
//
//   blocked   how long the key event itself ran. Nothing can be shown, and no further key
//             handled, until it returns.
//   settled   from the keystroke until the wall last changed.
//   rebuilt   how many word tiles were created anew.
//
// React runs in development mode here (Vite dev server), which is several times slower
// than a production build, and this is a desktop CPU. Compare the two columns with each
// other; do not read either as what a phone will do.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const median = a => { const s = [...a].sort((x, y) => x - y); return +((s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2).toFixed(1); };
const p95 = a => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)].toFixed(1); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const problems = [];
page.on('pageerror', e => problems.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 300)); });

const report = { ranAt: new Date().toISOString(), browser: browser.version(), build: 'Vite development (React in development mode)', viewport: '390x844 @2x', note: 'ms; synthetic library; desktop CPU', rows: [] };
for (const words of [2000, 5000, 10000]) {
  const row = { words };
  for (const variant of ['original', 'candidate']) {
    await page.goto(`http://127.0.0.1:4188/search-harness.html?words=${words}&variant=${variant}`);
    await page.waitForSelector('.word-tile', { timeout: 30000 });
    await page.waitForTimeout(700);
    const r = await page.evaluate(async () => {
      const input = document.querySelector('input[type="search"]');
      const setValue = v => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); };
      const wall = document.querySelector('.wall-scroll');
      let rebuilt = 0, lastChange = 0;
      const observer = new MutationObserver(list => {
        lastChange = performance.now();
        for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) rebuilt += n.matches?.('.word-tile') ? 1 : n.querySelectorAll?.('.word-tile').length || 0;
      });
      observer.observe(wall, { childList: true, subtree: true, characterData: true });
      const shown = () => [...document.querySelectorAll('.word-tile')].map(t => t.dataset.word).join(',');
      const out = { blocked: [], settled: [], rebuilt: [], narrowingRebuilt: [], narrowingKept: [] };
      // Words typed a letter at a time, then cleared. "Narrowing" steps add a letter to the query.
      const typed = ['p', 'pe', 'per', 'pers', '', 't', 'tr', 'tra', 'trac', '', '清', '清晰', '', 'a', 'ab', 'abr', ''];
      let finalShown = '';
      for (let round = 0; round < 3; round++) {
        let previous = '';
        for (const text of typed) {
          const before = new Set(shown().split(','));
          rebuilt = 0; lastChange = 0;
          const t0 = performance.now();
          setValue(text);
          const t1 = performance.now();
          await new Promise(r => setTimeout(r, 220)); // long enough for a transition to finish
          out.blocked.push(t1 - t0);
          out.settled.push(lastChange ? lastChange - t0 : t1 - t0);
          out.rebuilt.push(rebuilt);
          if (text.length > previous.length && text.startsWith(previous) && previous) {
            const now = shown().split(',');
            out.narrowingRebuilt.push(rebuilt);
            out.narrowingKept.push(now.filter(w => before.has(w)).length);
          }
          previous = text;
          if (text === 'pers') finalShown = shown();
        }
      }
      observer.disconnect();
      // Fast typing: five letters 30 ms apart, without waiting for results in between.
      setValue(''); await new Promise(r => setTimeout(r, 300));
      const burst = [];
      let boxKeptText = true; // the box must never fall back to older text while results catch up
      for (const text of ['p', 'pe', 'per', 'pers', 'persi']) {
        const t0 = performance.now(); setValue(text); burst.push(performance.now() - t0);
        for (let i = 0; i < 3; i++) { await new Promise(r => setTimeout(r, 10)); if (input.value !== text) boxKeptText = false; }
      }
      await new Promise(r => setTimeout(r, 400));
      if (input.value !== 'persi') boxKeptText = false;
      return { ...out, burst, finalShown, afterBurst: shown(), inputAfterBurst: input.value, boxKeptText };
    });
    row[variant] = {
      blocked: { median: median(r.blocked), p95: p95(r.blocked) },
      settled: { median: median(r.settled), p95: p95(r.settled) },
      tilesRebuilt: { median: median(r.rebuilt) },
      whenNarrowing: { tilesStillWanted: median(r.narrowingKept), tilesRebuilt: median(r.narrowingRebuilt) },
      fastTyping: { blockedTotal: +r.burst.reduce((a, b) => a + b, 0).toFixed(1), worstKey: +Math.max(...r.burst).toFixed(1), boxKeptText: r.boxKeptText },
      resultFor_pers: r.finalShown, resultAfterFastTyping: r.afterBurst, inputAfterFastTyping: r.inputAfterBurst,
    };
  }
  row.sameResults = row.original.resultFor_pers === row.candidate.resultFor_pers && row.original.resultAfterFastTyping === row.candidate.resultAfterFastTyping;
  for (const v of ['original', 'candidate']) { delete row[v].resultFor_pers; delete row[v].resultAfterFastTyping; }
  report.rows.push(row);
  const o = row.original, c = row.candidate;
  console.log(`${String(words).padStart(6)} words | key blocked: ${o.blocked.median} -> ${c.blocked.median} ms (P95 ${o.blocked.p95} -> ${c.blocked.p95}) | wall settled: ${o.settled.median} -> ${c.settled.median} ms (P95 ${o.settled.p95} -> ${c.settled.p95})`);
  console.log(`${''.padStart(6)}       | tiles rebuilt per key: ${o.tilesRebuilt.median} -> ${c.tilesRebuilt.median}; when a letter is added, ${o.whenNarrowing.tilesStillWanted} tiles stay wanted and ${o.whenNarrowing.tilesRebuilt} -> ${c.whenNarrowing.tilesRebuilt} are rebuilt | five fast keys block ${o.fastTyping.blockedTotal} -> ${c.fastTyping.blockedTotal} ms in all (box kept its text: ${o.fastTyping.boxKeptText} / ${c.fastTyping.boxKeptText}) | same results: ${row.sameResults}`);
}
report.problems = [...new Set(problems)];
if (report.problems.length) console.log('problems:', report.problems.slice(0, 5));
await writeFile(fileURLToPath(new URL('./UI-BENCH.json', import.meta.url)), JSON.stringify(report, null, 2));
await browser.close();
console.log('\nwritten to UI-BENCH.json');
