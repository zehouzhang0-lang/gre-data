// Verification for candidate C (c.html), in the same spirit as qa.mjs for A/B.
//
//   node platform/mobile/ui-redesign/prototype/c-qa.mjs        (prototype server on 4188 must be running)
//
// A new headless Chrome and a fresh Playwright context: no real browser profile, no personal
// storage, only the synthetic prototype on 127.0.0.1. Writes C-QA.json and screenshots/c-*.png.
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const shots = path.join(root, 'screenshots');
const base = 'http://127.0.0.1:4188';
const STATE = 'gre-ui-synthetic-prototype-v1';
const PREFS = 'gre-ui-candidate-c-prefs-v1';
const MARKS = 'gre-ui-candidate-c-marks-v1';

const results = {
  startedAt: new Date().toISOString(),
  target: `${base}/c.html`,
  isolation: 'New headless Chrome, fresh Playwright context; no real browser profile or personal storage.',
  environment: { platform: process.platform, node: process.version, build: 'Vite development', data: '168 synthetic words, plus 28 hand-written stress entries', viewport: '390x844 @2x, touch', cpuThrottle: 'none' },
  checks: [], screenshots: [], performance: {}, sound: [], errors: [],
  limitations: [
    'Desktop Chrome with CDP touch emulation is not an Android WebView and not a finger. Hold time, drag distance and flick speed all need tuning on a phone.',
    'paintProxyMs is click to double requestAnimationFrame, measured the same way for A and C. It is not display time and says nothing about Android.',
    'IME composition is simulated with synthetic composition events, not a real input method.',
    'Sounds are rendered offline and measured (level, loudness through a phone-speaker model, length, attack, brightness). Nobody has listened to them in this run; whether they sound natural is a judgement for ears.',
    'The phone-speaker model is two high-pass filters and a presence peak. It is a stand-in, not a measurement of any phone.',
  ],
};
const flush = () => writeFile(path.join(root, 'C-QA.json'), JSON.stringify(results, null, 2));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const check = async (name, fn) => {
  try {
    const evidence = await fn();
    results.checks.push({ name, status: 'pass', evidence });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.checks.push({ name, status: 'fail', error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
  await flush();
};

await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
results.environment.browser = browser.version();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

// One in-page driver for both apps, so A/B and C are driven by identical steps.
// Fresh has no button on C's wall any more: the driver goes the way a tapping user would,
// 多选 -> more -> "fresh 本页".
await context.addInitScript(() => {
  const isC = location.pathname.endsWith('c.html');
  const L = label => document.querySelector(`[aria-label="${label}"]`);
  const byText = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  const set = (el, value) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  };
  const qa = () => (isC ? window.candidateQA : window.prototypeQA);
  const order = ['forgot', 'partial', 'clear', 'none'];
  window.__d = {
    snap() {
      const s = qa().snapshot();
      return { index: s.index, pages: s.pages.length, total: s.total, ids: s.ids.join(','), order: s.pages.map(p => p[0]).join(','), filter: s.filter, sort: s.sort, query: s.query, reviews: s.reviews.join(',') };
    },
    raw: () => qa().snapshot(),
    next: () => L('下一页').click(),
    prev: () => L('上一页').click(),
    fresh() {
      if (!isC) return document.querySelector('.fresh-button').click();
      byText('多选').click();
      return new Promise(resolve => requestAnimationFrame(() => {
        document.querySelector('[aria-label^="更多操作"]').click();
        requestAnimationFrame(() => {
          document.querySelector('.sheet-rows button').click();
          // On the last page Fresh is unavailable: back out the way a user would.
          requestAnimationFrame(() => {
            document.querySelector('.sheet [aria-label="关闭"]')?.click();
            requestAnimationFrame(() => { byText('取消')?.click(); resolve(); });
          });
        });
      }));
    },
    undo: () => (isC ? document.querySelector('.slot button') : [...document.querySelectorAll('.toast button')].find(b => b.textContent.trim().startsWith('撤销')))?.click(),
    search: value => set(L('搜索单词、释义或笔记'), value),
    clear: () => L('清空搜索').click(),
    sort: key => set(L('排序'), key),
    filter(key) {
      if (!isC) return set(L('筛选词库'), key);
      const current = qa().snapshot().filter;
      const counts = document.querySelectorAll('.count');
      if (key === 'all') { if (current !== 'all') counts[order.indexOf(current)].click(); }
      else if (current !== key) counts[order.indexOf(key)].click();
    },
    tiles: () => [...document.querySelectorAll(isC ? '.pane.current .tile' : '.word-tile')],
    scenario(value) {
      const select = document.querySelector('#c-scenario');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
});

const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error') results.errors.push({ url: page.url(), text: m.text() }); });
page.on('pageerror', e => results.errors.push({ url: page.url(), text: String(e) }));
const settle = (ms = 160) => page.waitForTimeout(ms);
// `prefs.hinted` is set so the one-time hint does not sit in the status slot during checks.
const open = async (url, prefs = {}) => {
  await page.goto(base + url);
  await page.evaluate(([state, prefsKey, marksKey, value]) => {
    localStorage.removeItem(state);
    localStorage.removeItem(marksKey);
    localStorage.setItem(prefsKey, JSON.stringify(value));
  }, [STATE, PREFS, MARKS, { hinted: true, ...prefs }]);
  await page.reload();
  await page.waitForSelector(url === '/' ? '.word-tile' : '.pane.current .tile');
  await settle(350);
};
const d = (method, ...args) => page.evaluate(([m, a]) => window.__d[m](...a), [method, args]);
const shot = async name => {
  await settle(650); // let turns and glides finish
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
  results.screenshots.push(`screenshots/${name}.png`);
};
const nav = i => page.evaluate(n => document.querySelectorAll('.nav button')[n].click(), i);
const centre = selector => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);

const cdp = await context.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
async function stroke(startPoints, endPoints, { hold = 0, steps = 10 } = {}) {
  await touch('touchStart', startPoints);
  if (hold) await page.waitForTimeout(hold);
  if (endPoints) {
    for (let step = 1; step <= steps; step++) {
      await touch('touchMove', startPoints.map((p, i) => ({ x: p.x + (endPoints[i].x - p.x) * step / steps, y: p.y + (endPoints[i].y - p.y) * step / steps })));
      await page.waitForTimeout(16);
    }
  }
  await touch('touchEnd', []);
  await settle(520);
}

// The comparison script: the same eleven steps on A/B and on C.
async function walk() {
  const log = {};
  const mark = async name => { await settle(); log[name] = await d('snap'); };
  await mark('start');
  await d('next'); await settle(); await d('next'); await mark('page3');
  await d('fresh'); await mark('fresh');
  await d('search', 'a'); await mark('search');
  await d('next'); await mark('searchPage2');
  await d('filter', 'partial'); await settle(); await d('sort', 'az'); await mark('searchFiltered');
  await d('fresh'); await mark('searchFresh');
  await d('clear'); await mark('cleared');
  await d('filter', 'clear'); await mark('filterClear');
  await d('next'); await settle(); await d('fresh'); await mark('filteredFresh');
  await d('filter', 'all'); await mark('backToAll');
  return log;
}

async function sampleTimes(runs = 20) {
  const names = ['next', 'prev', 'search', 'clear'];
  const samples = Object.fromEntries(names.map(n => [n, []]));
  const time = (method, arg) => page.evaluate(async ([m, a]) => {
    const start = performance.now();
    window.__d[m](a);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - start;
  }, [method, arg]);
  await d('next'); await settle(500); // leave page 1 so that prev is always possible
  for (let i = 0; i < runs; i++) {
    for (const [name, arg] of [['next'], ['prev'], ['search', 'a'], ['clear']]) {
      samples[name].push(await time(name, arg));
      await settle(name === 'next' || name === 'prev' ? 480 : 320); // let glides and idle work finish before the next sample
    }
  }
  const stat = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { n: sorted.length, median: +((sorted[9] + sorted[10]) / 2).toFixed(2), p95: +sorted[18].toFixed(2) }; // nearest-rank P95 of 20
  };
  return Object.fromEntries(names.map(n => [n, stat(samples[n])]));
}

try {
  // ---------- the wall at rest ----------
  await open('/c.html');
  await shot('c-wall');

  await check('home is the wall: 28 tiles in 4 columns and 7 rows, no Fresh button, no overflow', async () => {
    const layout = await page.evaluate(() => {
      const tiles = window.__d.tiles().map(t => t.getBoundingClientRect());
      const board = document.querySelector('.board').getBoundingClientRect();
      return {
        tiles: tiles.length,
        columns: new Set(tiles.map(r => Math.round(r.left))).size,
        rows: new Set(tiles.map(r => Math.round(r.top))).size,
        tile: `${tiles[0].width.toFixed(1)}x${tiles[0].height.toFixed(1)}`,
        wallShareOfViewport: +(board.height / innerHeight).toFixed(3),
        freshButtonOnHome: [...document.querySelectorAll('.wall button')].some(b => /fresh/i.test(b.textContent)),
        neighbourPagesVisibleAtRest: getComputedStyle(document.querySelector('.clip')).clipPath,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        verticalScroll: document.querySelector('.c-main').scrollHeight - document.querySelector('.c-main').clientHeight,
        // The pages on either side must not make the screen scrollable: try to scroll it.
        scrolledWhenPushed: (() => { const m = document.querySelector('.c-main'); m.scrollTop = 400; m.scrollLeft = 400; const moved = [m.scrollTop, m.scrollLeft]; m.scrollTop = 0; m.scrollLeft = 0; return moved; })(),
        wordFont: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).join(', '),
      };
    });
    assert(layout.tiles === 28 && layout.columns === 4 && layout.rows === 7, JSON.stringify(layout));
    assert(!layout.freshButtonOnHome, 'a Fresh button is on the home screen');
    assert(!layout.horizontalOverflow && layout.verticalScroll === 0, 'page overflows');
    assert(layout.scrolledWhenPushed.join() === '0,0', `the screen can be scrolled away from the wall: ${layout.scrolledWhenPushed}`);
    assert(layout.wordFont.includes('Source Serif 4'), `word font not loaded: ${layout.wordFont}`);
    return layout;
  });

  await check('no word overflows its tile on any of the six pages (390)', async () => {
    const pages = [];
    for (let p = 0; p < 6; p++) {
      pages.push(await page.evaluate(() => {
        const tiles = window.__d.tiles();
        const width = tiles[0].getBoundingClientRect().width;
        const sizes = {};
        let overflow = 0;
        for (const t of tiles) {
          const w = t.querySelector('.word');
          const size = getComputedStyle(w).fontSize;
          sizes[size] = (sizes[size] || 0) + 1;
          if (w.getBoundingClientRect().width > width - 4) overflow++;
        }
        return { sizes, overflow, wrapped: tiles.filter(t => t.querySelector('.word.wrap')).length };
      }));
      await d('next'); await settle(480);
    }
    assert(pages.every(p => p.overflow === 0), JSON.stringify(pages));
    return pages;
  });

  await open('/c.html');
  await page.evaluate(() => [1, 6, 9, 14, 21, 27].forEach(i => window.__d.tiles()[i].click()));
  await check('tap turns a tile over', async () => {
    await settle(400);
    const flipped = (await d('raw')).flips.length;
    assert(flipped === 6, `expected 6 flipped, got ${flipped}`);
    return { flipped };
  });
  await shot('c-wall-flipped');

  // ---------- behaviour shared with A/B ----------
  await check('A/B and C reach identical states over the same eleven steps', async () => {
    await open('/');
    const abLog = await walk();
    await open('/c.html');
    const cLog = await walk();
    const differences = [];
    for (const step of Object.keys(abLog)) {
      for (const key of Object.keys(abLog[step])) {
        if (String(abLog[step][key]) !== String(cLog[step][key])) differences.push(`${step}.${key}`);
      }
    }
    assert(!differences.length, `differences: ${differences.join(', ')}`);
    return { steps: Object.keys(abLog), compared: Object.keys(abLog.start), differences };
  });

  await open('/c.html');
  await check('undo of a Fresh restores the page, and is still offered after a search round trip', async () => {
    await d('next'); await settle(480); await d('next'); await settle(480);
    const before = await d('snap');
    await d('fresh'); await settle(400);
    await d('search', 'a'); await settle();
    await d('clear'); await settle();
    const offered = (await d('raw')).canUndo;
    assert(offered, 'undo is gone after search and clear');
    await d('undo'); await settle(400);
    const after = await d('snap');
    assert(after.ids === before.ids && after.order === before.order && after.index === before.index, 'undo did not restore the arrangement');
    return { offeredAfterSearchRoundTrip: offered, restored: true };
  });

  await open('/c.html');
  await d('search', 'a'); await settle(); await d('filter', 'forgot');
  await shot('c-search-filter');

  await open('/c.html');
  await check('search does not filter on unfinished IME composition text (simulated)', async () => {
    const result = await page.evaluate(async () => {
      const input = document.querySelector('.search input');
      const setValue = v => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
      input.focus();
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      setValue("qing'xi");
      input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: "qing'xi" }));
      await new Promise(r => setTimeout(r, 120));
      const during = { query: window.__d.raw().query, tiles: window.__d.tiles().length, emptyState: !!document.querySelector('.state'), fieldShows: input.value };
      setValue('清晰');
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '清晰' }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromComposition', data: '清晰' }));
      await new Promise(r => setTimeout(r, 120));
      return { during, after: { query: window.__d.raw().query, tiles: window.__d.tiles().length } };
    });
    assert(result.during.query === '' && result.during.tiles === 28 && !result.during.emptyState, JSON.stringify(result.during));
    assert(result.after.query === '清晰' && result.after.tiles === 2, JSON.stringify(result.after));
    return result;
  });

  // ---------- gestures (CDP touch emulation) ----------
  await open('/c.html');
  await check('the wall follows the finger: adjacent pages meet with the tile gap, a drag past a fifth of a page lands on the next, a short one springs back', async () => {
    const read = () => page.evaluate(() => {
      const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.track')).transform);
      const current = document.querySelector('.pane.current').getBoundingClientRect();
      const next = document.querySelector('.pane.next').getBoundingClientRect();
      return { x: Math.round(m.m41), gap: +(next.left - current.right).toFixed(1), nextTiles: document.querySelectorAll('.pane.next .tile').length, opened: document.querySelector('.clip').classList.contains('moving') };
    });
    const rest = await read();
    await touch('touchStart', [{ x: 300, y: 430 }]);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x: 300 - i * 15, y: 430 }]); await page.waitForTimeout(16); }
    const mid = await read();
    const midIndex = (await d('raw')).index;
    await touch('touchEnd', []);
    await settle(600);
    const landed = (await d('raw')).index;
    await stroke([{ x: 300, y: 430 }], [{ x: 262, y: 430 }], { steps: 12 }); // 38px, slowly: not enough
    const afterShort = (await d('raw')).index;
    await stroke([{ x: 90, y: 430 }], [{ x: 300, y: 430 }]);
    const back = (await d('raw')).index;
    await stroke([{ x: 90, y: 430 }], [{ x: 300, y: 430 }]); // already at the first page
    const atEdge = (await d('raw')).index;
    assert(mid.gap === 5 && mid.nextTiles === 28 && mid.opened, `mid-drag: ${JSON.stringify(mid)}`);
    assert(rest.x - mid.x >= 100 && midIndex === 0, `the track did not follow the finger: rest ${rest.x}, mid ${mid.x}`);
    assert(landed === 1 && afterShort === 1 && back === 0 && atEdge === 0, JSON.stringify({ landed, afterShort, back, atEdge }));
    return { followedPx: rest.x - mid.x, gapBetweenPagesPx: mid.gap, landed, afterShortDrag: afterShort, back, atEdge, flips: (await d('raw')).flips.length };
  });
  await open('/c.html');
  await touch('touchStart', [{ x: 300, y: 430 }]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x: 300 - i * 15, y: 430 }]); await page.waitForTimeout(16); }
  await page.screenshot({ path: path.join(shots, 'c-drag.png') });
  results.screenshots.push('screenshots/c-drag.png');
  await touch('touchEnd', []);
  await settle(600);

  await open('/c.html');
  await check('press and hold, slide onto a mark, let go: the word is marked without entering multi-select, saved, and can be undone', async () => {
    const before = await d('raw');
    const tile = await centre('.pane.current .tile:nth-child(3)'); // subtle: forgot
    await touch('touchStart', [tile]);
    await page.waitForTimeout(520);
    const strip = await page.evaluate(() => { const s = document.querySelector('.hold-strip'); return s && { options: [...s.querySelectorAll('[data-hold-option]')].map(o => o.dataset.holdOption), insidePhone: s.getBoundingClientRect().top >= 0 && s.getBoundingClientRect().right <= innerWidth }; });
    const target = await centre('[data-hold-option="clear"]');
    await touch('touchMove', [{ x: (tile.x + target.x) / 2, y: (tile.y + target.y) / 2 }]);
    await touch('touchMove', [target]);
    await page.waitForTimeout(60);
    const hover = await page.evaluate(() => ({ active: document.querySelector('.hold-option.active')?.dataset.holdOption, label: document.querySelector('.hold-label')?.textContent }));
    await page.screenshot({ path: path.join(shots, 'c-hold-strip.png') });
    results.screenshots.push('screenshots/c-hold-strip.png');
    await touch('touchEnd', []);
    await settle(300);
    const after = await d('raw');
    const stored = await page.evaluate(key => localStorage.getItem(key), MARKS);
    const slot = await page.evaluate(() => document.querySelector('.slot').innerText.trim());
    assert(strip && strip.options.join() === 'forgot,partial,clear,group,detail' && strip.insidePhone, JSON.stringify(strip));
    assert(hover.active === 'clear' && hover.label === '记得很清楚', JSON.stringify(hover));
    assert(after.marks['demo-3'] === 'clear' && !after.multi && after.flips.length === 0, JSON.stringify({ marks: after.marks, multi: after.multi }));
    assert(after.counts.forgot === before.counts.forgot - 1 && after.counts.clear === before.counts.clear + 1, JSON.stringify(after.counts));
    assert(stored === '{"demo-3":"clear"}' && slot === '撤销标记', `${stored} / ${slot}`);
    await shot('c-after-mark');
    await stroke([{ x: 130, y: 420 }, { x: 250, y: 420 }], [{ x: 130, y: 520 }, { x: 250, y: 520 }]); // two fingers down
    const undone = await d('raw');
    assert(!('demo-3' in undone.marks) && undone.counts.forgot === before.counts.forgot, `two-finger undo: ${JSON.stringify(undone.marks)}`);
    return { strip, hover, countsBefore: before.counts, countsAfter: after.counts, stored, slot, undoneByTwoFingersDown: true };
  });

  await open('/c.html');
  await check('two fingers up runs Fresh once, two fingers down undoes it; hold and let go starts multi-select; none of them turns a tile', async () => {
    const orderOf = s => s.pages.map(p => p[0]).join(',');
    const start = await d('raw');
    await stroke([{ x: 130, y: 520 }, { x: 250, y: 520 }], [{ x: 130, y: 420 }, { x: 250, y: 420 }]);
    const afterFresh = await d('raw');
    await stroke([{ x: 130, y: 420 }, { x: 250, y: 420 }], [{ x: 130, y: 520 }, { x: 250, y: 520 }]);
    const afterUndo = await d('raw');
    await stroke([{ x: 150, y: 330 }], null, { hold: 620 });
    const afterHold = await d('raw');
    const bars = await page.evaluate(() => ({ rateBar: !!document.querySelector('.rate-bar'), nav: !!document.querySelector('.nav'), rateBarHeight: document.querySelector('.rate-bar')?.getBoundingClientRect().height }));
    assert(orderOf(afterFresh).split(',')[3] === orderOf(start).split(',')[0] && afterFresh.canUndo, 'two fingers up did not run Fresh exactly once');
    assert(orderOf(afterUndo) === orderOf(start), 'two fingers down did not undo the Fresh');
    assert(afterHold.multi && afterHold.selected.length === 1 && bars.rateBar && !bars.nav, JSON.stringify({ multi: afterHold.multi, selected: afterHold.selected.length, bars }));
    assert(afterFresh.flips.length + afterUndo.flips.length + afterHold.flips.length === 0, 'a gesture turned a tile');
    return { freshOnce: true, undone: true, holdSelected: afterHold.selected.length, ...bars };
  });

  await check('multi-select: the grid does not move, marks replace the tabs, marking the selection saves and leaves multi-select', async () => {
    const rect = () => page.evaluate(() => { const r = document.querySelector('.pane.current').getBoundingClientRect(); return { top: r.top, height: r.height }; });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '取消').click());
    await settle();
    const before = await rect();
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '多选').click());
    await settle();
    const during = await rect();
    await page.evaluate(() => [1, 2, 6].forEach(i => window.__d.tiles()[i].click()));
    await shot('c-multi');
    await page.evaluate(() => document.querySelector('[aria-label^="更多操作"]').click());
    await shot('c-sheet');
    const sheetRows = await page.evaluate(() => [...document.querySelectorAll('.sheet-rows .row-name')].map(n => n.childNodes[0].textContent));
    await page.keyboard.press('Escape');
    await settle();
    await page.evaluate(() => document.querySelectorAll('.rate-bar button')[1].click()); // 有一点印象
    await settle(300);
    const after = await d('raw');
    assert(before.top === during.top && before.height === during.height, JSON.stringify({ before, during }));
    assert(sheetRows[0] === 'fresh 本页', `sheet rows: ${sheetRows.join(' | ')}`);
    assert(Object.values(after.marks).filter(v => v === 'partial').length === 3 && !after.multi, JSON.stringify({ marks: after.marks, multi: after.multi }));
    return { gridShift: during.top - before.top, sheetRows, marked: Object.keys(after.marks).length, leftMultiSelect: !after.multi };
  });

  await open('/c.html', { axis: 'y' });
  await check('vertical wall: pages are stacked, a drag up lands on the next page, a drag down returns', async () => {
    const stacked = await page.evaluate(() => { const a = document.querySelector('.pane.current').getBoundingClientRect(); const b = document.querySelector('.pane.next').getBoundingClientRect(); return { below: +(b.top - a.bottom).toFixed(1), sameLeft: Math.abs(a.left - b.left) < 1 }; });
    await touch('touchStart', [{ x: 200, y: 600 }]);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x: 200, y: 600 - i * 22 }]); await page.waitForTimeout(16); }
    await page.screenshot({ path: path.join(shots, 'c-vertical-drag.png') });
    results.screenshots.push('screenshots/c-vertical-drag.png');
    await touch('touchEnd', []);
    await settle(600);
    const up = (await d('raw')).index;
    await stroke([{ x: 200, y: 300 }], [{ x: 200, y: 560 }]);
    const down = (await d('raw')).index;
    await stroke([{ x: 300, y: 430 }], [{ x: 90, y: 430 }]); // sideways does nothing here
    const sideways = (await d('raw')).index;
    // A wheel or trackpad must not be able to scroll the wall away to the stacked pages.
    const boardTop = () => page.evaluate(() => Math.round(document.querySelector('.board').getBoundingClientRect().top));
    const topBefore = await boardTop();
    await page.mouse.move(200, 430);
    await page.mouse.wheel(0, 600);
    await settle(700);
    const wheel = await page.evaluate(() => { const m = document.querySelector('.c-main'); const natural = [m.scrollTop, m.scrollLeft]; m.scrollTop = 400; const pushed = m.scrollTop; m.scrollTop = 0; return { natural, pushed, index: window.candidateQA.snapshot().index }; });
    const topAfter = await boardTop();
    assert(stacked.below === 5 && stacked.sameLeft, JSON.stringify(stacked));
    assert(up === 1 && down === 0 && sideways === 0, JSON.stringify({ up, down, sideways }));
    assert(wheel.natural.join() === '0,0' && wheel.pushed === 0 && topAfter === topBefore, `the wheel scrolled the wall away: ${JSON.stringify({ wheel, topBefore, topAfter })}`);
    return { gapBetweenPagesPx: stacked.below, afterDragUp: up, afterDragDown: down, afterSidewaysDrag: sideways, afterWheel: { screenScrolled: wheel.natural, wallMoved: topAfter - topBefore, pageNow: wheel.index + 1 } };
  });

  // ---------- looks ----------
  await open('/c.html', { look: 'fill' });
  await check('filled tiles: the original three colours are an option, and the legend follows', async () => {
    const colours = await page.evaluate(() => {
      const faces = [...document.querySelectorAll('.pane.current .tile .face.front')];
      const bg = i => getComputedStyle(faces[i]).backgroundColor;
      return { clear: bg(0), partial: bg(1), forgot: bg(2), none: bg(3), pipsOnFronts: document.querySelectorAll('.pane.current .face.front .pip').length, legendSwatches: document.querySelectorAll('.counts .swatch').length };
    });
    assert(colours.clear === 'rgb(207, 232, 216)' && colours.partial === 'rgb(247, 230, 181)' && colours.forgot === 'rgb(241, 209, 201)', JSON.stringify(colours));
    assert(colours.pipsOnFronts === 0 && colours.legendSwatches === 4, JSON.stringify(colours));
    return colours;
  });
  await page.evaluate(() => [1, 6, 21].forEach(i => window.__d.tiles()[i].click()));
  await shot('c-fill');

  await open('/c.html');
  await check('long words and long meanings: nothing overflows, long words break after a vowel with a hyphen', async () => {
    await d('scenario', 'stress');
    await settle(300);
    await shot('c-stress-front');
    const fronts = await page.evaluate(() => window.__d.tiles().map(t => { const w = t.querySelector('.word'); return { text: w.textContent, size: parseFloat(getComputedStyle(w).fontSize), over: w.getBoundingClientRect().width > t.getBoundingClientRect().width - 2 }; }));
    await page.evaluate(() => window.__d.tiles().forEach(t => t.click()));
    await shot('c-stress-back');
    const backs = await page.evaluate(() => window.__d.tiles().map(t => { const m = t.querySelector('.face.back .meaning'); const r = t.getBoundingClientRect(); const b = m.getBoundingClientRect(); return { lines: m.textContent.split('\n').length, over: b.width > r.width - 2 || b.height > r.height - 2, stray: m.textContent.split('\n').some(line => line.length === 1) }; }));
    const broken = fronts.filter(f => f.text.includes('\n')).map(f => f.text.replace('\n', ' / '));
    assert(fronts.every(f => !f.over) && backs.every(b => !b.over && !b.stray), JSON.stringify({ fronts: fronts.filter(f => f.over), backs: backs.filter(b => b.over || b.stray) }));
    return { smallestWordPx: Math.min(...fronts.map(f => f.size)), brokenWords: broken, mostMeaningLines: Math.max(...backs.map(b => b.lines)) };
  });

  // ---------- motion ----------
  await open('/c.html');
  await check('motion: a page turn glides from where the eye was, Fresh deals rows in, reduced motion removes both', async () => {
    const motion = await page.evaluate(async () => {
      const frames = () => document.querySelector('.track').getAnimations().map(a => ({ ms: Math.round(a.effect.getTiming().duration), from: a.effect.getKeyframes()[0].transform, to: a.effect.getKeyframes()[1].transform }));
      window.__d.next(); await Promise.resolve();
      const next = frames();
      await new Promise(r => setTimeout(r, 500));
      await window.__d.fresh(); await Promise.resolve();
      const rows = window.__d.tiles().map(t => t.getAnimations().find(a => String(a.effect.getKeyframes()[0].transform).includes('translateY'))).map(a => a && a.effect.getTiming());
      await new Promise(r => setTimeout(r, 500));
      // A tile has one face at rest and two only while it turns.
      const turnOf = async tile => {
        const facesBefore = tile.querySelectorAll('.face').length;
        tile.click();
        await new Promise(r => requestAnimationFrame(r));
        const turning = { ms: tile.querySelector('.tile-inner').getAnimations().map(a => a.effect.getTiming().duration), faces: tile.querySelectorAll('.face').length };
        await new Promise(r => setTimeout(r, 420));
        return { facesBefore, ...turning, facesAfter: tile.querySelectorAll('.face').length, showsBack: !!tile.querySelector('.face.back') };
      };
      const flip = await turnOf(window.__d.tiles()[0]);
      document.querySelector('.c-panel [aria-label="减少动态效果"]').click();
      await new Promise(r => setTimeout(r, 60));
      const stillFlip = await turnOf(window.__d.tiles()[1]);
      window.__d.next(); await Promise.resolve();
      const reduced = { trackAnimations: frames().length, flipAnimations: stillFlip.ms.length, showsBack: stillFlip.showsBack };
      return { next, fresh: { tiles: rows.filter(Boolean).length, firstRowDelay: rows[0]?.delay, lastRowDelay: rows[27]?.delay, each: rows[0]?.duration }, flip, reduced };
    });
    assert(motion.next.length === 1 && motion.next[0].from.includes('366px'), JSON.stringify(motion.next));
    assert(motion.fresh.tiles === 28 && motion.fresh.lastRowDelay > motion.fresh.firstRowDelay, JSON.stringify(motion.fresh));
    assert(motion.flip.facesBefore === 1 && motion.flip.faces === 2 && motion.flip.ms[0] === 280 && motion.flip.facesAfter === 1 && motion.flip.showsBack, JSON.stringify(motion.flip));
    assert(motion.reduced.trackAnimations === 0 && motion.reduced.flipAnimations === 0 && motion.reduced.showsBack, JSON.stringify(motion.reduced));
    return motion;
  });

  // ---------- review: progress only after a successful write ----------
  await open('/c.html');
  await nav(1);
  await shot('c-review');
  await check('review: a failed write shows no progress; retry after recovery advances and saves', async () => {
    const read = () => page.evaluate(key => ({
      count: document.querySelector('.session-count').innerText,
      bar: document.querySelector('.session .track-bar i').style.width,
      word: document.querySelector('.recall-word').textContent,
      error: document.querySelector('.save-error')?.innerText.replace(/\s+/g, ' ') ?? null,
      stored: JSON.parse(localStorage.getItem(key) || '{}').reviews?.join(','),
    }), STATE);
    const failSwitch = () => page.evaluate(() => document.querySelector('[aria-label="模拟保存失败"]').click());
    const tapRemember = () => page.evaluate(() => [...document.querySelectorAll('.answer button')].find(b => b.textContent === '记得').click());
    await page.evaluate(() => document.querySelector('.primary-action').click());
    await settle(300);
    const before = await read();
    await failSwitch(); await settle();
    await tapRemember(); await settle();
    const failed = await read();
    assert(failed.count === before.count && failed.bar === before.bar && failed.word === before.word, `progress moved on a failed write: ${JSON.stringify(failed)}`);
    assert(failed.error && failed.stored === before.stored, 'no visible error, or storage changed');
    await shot('c-session-unsaved');
    await failSwitch(); await settle();
    await page.evaluate(() => document.querySelector('.save-error .text-btn').click());
    await settle();
    const retried = await read();
    assert(retried.count !== before.count && retried.error === null && retried.stored !== before.stored, JSON.stringify(retried));
    return { before, failed, retried };
  });

  await check('marking refuses to show a mark it could not save', async () => {
    await nav(0); await settle();
    await page.evaluate(() => document.querySelector('[aria-label="模拟保存失败"]').click());
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '多选').click());
    await page.evaluate(() => window.__d.tiles()[3].click());
    await page.evaluate(() => document.querySelectorAll('.rate-bar button')[2].click());
    await settle();
    const failed = await d('raw');
    const notice = await page.evaluate(() => document.querySelector('.slot').innerText.trim());
    await page.evaluate(() => document.querySelector('[aria-label="模拟保存失败"]').click());
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '取消')?.click());
    assert(Object.keys(failed.marks).length === 0 && notice.includes('没有保存'), JSON.stringify({ marks: failed.marks, notice }));
    return { marksAfterFailedWrite: failed.marks, notice };
  });

  await check('review position survives leaving the tab and reloading', async () => {
    await nav(1); await settle();
    const afterTab = (await d('raw')).reviews.join(',');
    await page.reload(); await page.waitForSelector('.review'); await settle();
    const afterReload = (await d('raw')).reviews.join(',');
    assert(afterTab === '8,0,4,0' && afterReload === '8,0,4,0', `${afterTab} / ${afterReload}`);
    return { afterTab, afterReload };
  });

  await page.evaluate(() => document.querySelector('.primary-action').click());
  await settle(300);
  await page.evaluate(() => document.querySelector('.recall').click());
  await shot('c-session');

  await check('closure: after the last round due today the app says today is done and stops pushing the next round', async () => {
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ schema: 1, theme: 'clear', tab: 'review', query: '', searchOrigin: null, filter: 'all', sort: 'demo', scopes: {}, reviews: [19, 16, 4, 0], practiceIndex: 0, drafts: {} })), STATE);
    await page.reload(); await page.waitForSelector('.review'); await settle();
    const list = () => page.evaluate(() => ({ headline: document.querySelector('.headline').textContent, dueDot: !!document.querySelector('.due-dot'), primary: document.querySelector('.primary-action').className.includes('pill') ? 'solid' : 'quiet' }));
    const before = await list();
    await page.evaluate(() => document.querySelector('.primary-action').click());
    await settle(300);
    await page.evaluate(() => [...document.querySelectorAll('.answer button')].find(b => b.textContent === '记得').click());
    await settle(300);
    const finish = await page.evaluate(() => ({ title: document.querySelector('.finish h2').textContent, offersNextRound: !!document.querySelector('.finish .pill') }));
    await shot('c-finish');
    await page.evaluate(() => [...document.querySelectorAll('.finish button')].find(b => b.textContent === '返回复习').click());
    await settle();
    const after = await list();
    assert(before.headline === '今天还有 1 轮' && before.dueDot && before.primary === 'solid', JSON.stringify(before));
    assert(finish.title === '今天的复习做完了' && !finish.offersNextRound, JSON.stringify(finish));
    assert(after.headline === '今天的复习做完了' && !after.dueDot && after.primary === 'quiet', JSON.stringify(after));
    return { before, finish, after };
  });

  await open('/c.html');
  await nav(2); await settle();
  await page.evaluate(() => document.querySelectorAll('.options button')[0].click());
  await shot('c-practice');
  await nav(3);
  await shot('c-settings');

  await open('/c.html', { scheme: 'dark' });
  await page.evaluate(() => [1, 6, 10].forEach(i => window.__d.tiles()[i].click()));
  await shot('c-dark-wall');

  // ---------- sound: measured, not listened to ----------
  await open('/c.html');
  await check('sound: nothing clips, forward actions are about equally loud on a phone speaker, the climb never repeats a step and never gets louder or shriller', async () => {
    const { rows, climb } = await page.evaluate(async () => {
      const rows = [];
      for (const [name, label, forward] of window.candidateQA.soundList) rows.push({ ...(await window.candidateQA.measureSound(name)), label, forward });
      const climb = [];
      for (let step = 0; step < 12; step++) climb.push(await window.candidateQA.measureSound('saved', step));
      return { rows, climb };
    });
    results.sound = rows;
    const forward = rows.filter(r => r.forward && !r.name.startsWith('question') && r.name !== 'complete');
    const loud = forward.map(r => r.phoneLoudDb);
    const spread = +(Math.max(...loud) - Math.min(...loud)).toFixed(1);
    const quiet = rows.filter(r => !r.forward);
    const climbLoud = climb.map(c => c.phoneLoudDb);
    const climbSpread = +(Math.max(...climbLoud) - Math.min(...climbLoud)).toFixed(1);
    assert(rows.every(r => r.peakDb <= -3 && r.phonePeakDb <= -1), `clipping risk: ${rows.filter(r => r.peakDb > -3 || r.phonePeakDb > -1).map(r => r.name)}`);
    assert(spread <= 3, `forward actions differ by ${spread} dB`);
    assert(quiet.every(r => r.phoneLoudDb < Math.min(...loud) - 2), 'a "not this way" sound is as loud as a forward one');
    assert(climbSpread <= 1 && climb.every(c => c.above3kHz < 0.08), `climb: spread ${climbSpread} dB`);
    assert(rows.every(r => r.above3kHz < 0.3), 'a sound is mostly above 3 kHz');
    return { sounds: rows.length, loudestPeakDb: Math.max(...rows.map(r => r.peakDb)), forwardLoudnessSpreadDb: spread, forwardLoudnessDb: [Math.min(...loud), Math.max(...loud)], climbSteps: climb.length, climbLoudnessSpreadDb: climbSpread, brightestShareAbove3kHz: Math.max(...rows.map(r => r.above3kHz)) };
  });

  // ---------- timing proxy, same method for A and C ----------
  await check('click to double-rAF proxy, 20 samples per action, A and C measured the same way', async () => {
    await open('/');
    const a = await sampleTimes();
    await open('/c.html');
    const c = await sampleTimes();
    results.performance = { method: 'performance.now() before the click to the second requestAnimationFrame after it; warm; 20 samples per action; median and nearest-rank P95', a, c };
    return results.performance;
  });

  // ---------- 360 wide ----------
  const narrow = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const small = await narrow.newPage();
  await check('360 wide: four columns, no horizontal overflow, no word overflow on any page', async () => {
    await small.goto(`${base}/c.html`);
    await small.evaluate(([state, prefs, marks]) => { localStorage.removeItem(state); localStorage.removeItem(marks); localStorage.setItem(prefs, JSON.stringify({ hinted: true })); }, [STATE, PREFS, MARKS]);
    await small.reload();
    await small.waitForSelector('.pane.current .tile');
    await small.waitForTimeout(400);
    const pages = [];
    for (let p = 0; p < 6; p++) {
      pages.push(await small.evaluate(() => {
        const tiles = [...document.querySelectorAll('.pane.current .tile')];
        const rect = tiles[0].getBoundingClientRect();
        return {
          tile: `${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`,
          columns: new Set(tiles.map(t => Math.round(t.getBoundingClientRect().left))).size,
          overflow: tiles.filter(t => t.querySelector('.word').getBoundingClientRect().width > rect.width - 4).length,
          smallest: Math.min(...tiles.map(t => parseFloat(getComputedStyle(t.querySelector('.word')).fontSize))),
          broken: tiles.filter(t => t.querySelector('.word.wrap')).length,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      }));
      await small.evaluate(() => document.querySelector('[aria-label="下一页"]').click());
      await small.waitForTimeout(480);
    }
    assert(pages.every(p => p.columns === 4 && p.overflow === 0 && !p.horizontalOverflow), JSON.stringify(pages));
    await small.evaluate(([state]) => localStorage.removeItem(state), [STATE]);
    await small.reload();
    await small.waitForSelector('.pane.current .tile');
    await small.waitForTimeout(600);
    await small.screenshot({ path: path.join(shots, 'c-360-wall.png') });
    results.screenshots.push('screenshots/c-360-wall.png');
    return pages;
  });
  await narrow.close();

  await check('no console errors or page errors during the run', async () => {
    assert(!results.errors.length, JSON.stringify(results.errors.slice(0, 3)));
    return { errors: 0 };
  });
} finally {
  // Leave the shared demo state clean for the next person who opens the prototype.
  try {
    await page.goto(`${base}/c.html`);
    await page.evaluate(([state, prefs, marks]) => { localStorage.removeItem(state); localStorage.removeItem(prefs); localStorage.removeItem(marks); }, [STATE, PREFS, MARKS]);
  } catch { /* the context is discarded anyway */ }
  results.finishedAt = new Date().toISOString();
  results.summary = { pass: results.checks.filter(c => c.status === 'pass').length, fail: results.checks.filter(c => c.status === 'fail').length };
  await flush();
  await browser.close();
  console.log(`\n${results.summary.pass} passed, ${results.summary.fail} failed. Evidence in C-QA.json`);
}
