// Candidate C for the GRE word wall prototype.
//
// Same synthetic words, the same Fresh function (freshPages) and the same localStorage
// key and state shape as the A/B prototype in ../main.jsx, so paging, search, filter, sort
// and review progress can be compared across the three. Nothing here reads the real
// vocabulary, SQLite, backups or accounts.
//
// What candidate C adds on top of that shared state, each under its own storage key:
//   - marking a word (ring / half / full), by gesture or from multi-select;
//   - display preferences: pips or the original filled tiles, wall direction, sound.
import React, { memo, startTransition, useState, useRef, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Check, MoreHorizontal } from 'lucide-react';
import { words, byId, labels, freshPages, storageKey } from '../data.mjs';
import { stressById, stressPage } from './stress.mjs';
import { useWallGestures } from './wall-gestures.mjs';
import { play, haptic, configureFeedback, measureSound, recipes, SOUND_LIST, PAGE_TONES } from './sound.mjs';
import './c.css';

const initial = { schema: 1, theme: 'clear', tab: 'wall', query: '', searchOrigin: null, filter: 'all', sort: 'demo', scopes: {}, reviews: [7, 0, 4, 0], practiceIndex: 0, drafts: {} };
const prefsKey = 'gre-ui-candidate-c-prefs-v1';
const marksKey = 'gre-ui-candidate-c-marks-v1';
const groupsKey = 'gre-ui-candidate-c-groups-v1';
const defaultPrefs = { scheme: 'light', sound: true, haptics: false, reduce: false, look: 'pip', axis: 'x', hinted: false, seed: 1, pageTone: 'kalimba' };

// Kept identical to ../main.jsx.
const rounds = [
  { name: '温和与坚定', hint: '英文认义', total: 20, due: '已到期' },
  { name: '表达与判断', hint: '英文认义', total: 16, due: '今日复习' },
  { name: '容易混淆的近义词', hint: '英文认义', total: 12, due: '继续上次' },
  { name: '阅读中的新朋友', hint: '英文认义', total: 10, due: '待开始' },
];
const exercises = [
  { text: 'The instructions were so clear that everyone could follow them.', translation: '说明十分清晰，每个人都能照着操作。', options: ['clear', 'confusing', 'incomplete'] },
  { text: 'The team chose a modest design with very little decoration.', translation: '团队选择了一种简朴的设计，几乎没有装饰。', options: ['modest', 'ornate', 'fragile'] },
  { text: 'She checked each detail before sharing the report.', translation: '她在分享报告之前检查了每个细节。', options: ['meticulous', 'careless', 'hasty'] },
];

const STATUS_ORDER = ['forgot', 'partial', 'clear', 'none'];
const RATINGS = ['forgot', 'partial', 'clear'];
const MARK_SOUND = { forgot: 'markForgot', partial: 'markPartial', clear: 'markClear' };
const TABS = [['wall', '词库'], ['review', '复习'], ['practice', '刷题'], ['settings', '设置']];
const DUE_TODAY = new Set(['已到期', '今日复习']);
const GRID_GAP = 5; // keep in step with .track and .grid in c.css
const GESTURES = [
  ['轻触', '翻面'],
  ['沿词墙方向拖动', '翻页'],
  ['按住一个词', '选中，开始多选'],
  ['按住后滑到圆点上再松手', '直接标记这个词'],
  ['双指上滑', 'fresh 本页'],
  ['双指下滑', '撤销上一步'],
];

const cx = (...parts) => parts.filter(Boolean).join(' ');
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const entryOf = id => stressById[id] ?? byId[id];

// The same rules as createPages in ../data.mjs, with this candidate's marks on top, plus
// the two sorts the production wall has and the A/B prototype lacks (Z–A and random; the
// random order is the production one: a hash of seed and word).
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function pagesFor(query, filter, sort, statusOf, seed = 0) {
  const q = query.trim().toLocaleLowerCase();
  let items = words.filter(w => (filter === 'all' || statusOf(w.id) === filter) && w.searchText.includes(q));
  if (sort === 'az') items = [...items].sort((a, b) => a.word.localeCompare(b.word, 'en'));
  else if (sort === 'za') items = [...items].sort((a, b) => b.word.localeCompare(a.word, 'en'));
  else if (sort === 'random') {
    const keys = new Map(items.map(w => [w, hash(`${seed}:${w.word}`)]));
    items = [...items].sort((a, b) => keys.get(a) - keys.get(b));
  }
  const pages = [];
  for (let i = 0; i < items.length; i += 28) pages.push(items.slice(i, i + 28).map(w => w.id));
  return pages;
}

// Width of a word in px at a given size, measured in the word typeface and remembered.
// It is measured at the size itself, not scaled from one measurement: the typeface has
// optical sizes, so small text is set wider than large text.
const wordWidth = (() => {
  let cache = new Map();
  let ctx = null;
  let family = '';
  const measure = (text, size) => {
    const key = `${size}:${text}`;
    if (!cache.has(key)) {
      if (!ctx) {
        ctx = document.createElement('canvas').getContext('2d');
        family = getComputedStyle(document.documentElement).getPropertyValue('--font-word');
      }
      ctx.font = `500 ${size}px ${family}`;
      cache.set(key, ctx.measureText(text).width);
    }
    return cache.get(key);
  };
  measure.reset = () => { cache = new Map(); ctx = null; };
  return measure;
})();

// A word takes the largest size on this scale at which it fits its tile on one line.
// Most words share the top size; long ones step down a little at a time. A word that
// fits at no size is set on two lines: a phrase breaks at its space; a single word is
// hyphenated near its middle, between two consonants that sit between vowels if there
// is such a place (irrecon-cilable, pusil-lanimous), otherwise after a vowel
// (incontro-vertible). A rule of thumb, not a dictionary: good enough to keep the two
// halves pronounceable.
const WORD_SIZES = [15, 14, 13, 12];
const isVowel = c => /[aeiouy]/i.test(c || '');
function breakWord(text) {
  if (/[\s-]/.test(text)) return text.replace(/([\s-])/, '$1\n').replace(/ \n/, '\n');
  const middle = Math.round(text.length / 2);
  const nearest = (reach, test) => {
    for (let away = 0; away <= reach; away++) {
      for (const i of [middle - away, middle + away]) if (i > 2 && i < text.length - 2 && test(i)) return i;
    }
    return 0;
  };
  const at =
    nearest(2, i => isVowel(text[i - 2]) && !isVowel(text[i - 1]) && !isVowel(text[i]) && isVowel(text[i + 1])) ||
    nearest(middle, i => isVowel(text[i - 1]) && !isVowel(text[i]) && isVowel(text[i + 1])) ||
    middle;
  return `${text.slice(0, at)}-\n${text.slice(at)}`;
}
function fitWord(text, tileWidth) {
  const size = WORD_SIZES.find(s => wordWidth(text, s) <= tileWidth - 10);
  if (size) return { size, text };
  const broken = breakWord(text);
  const widest = s => Math.max(...broken.split('\n').map(line => wordWidth(line, s)));
  return { size: [14, 13, 12].find(s => widest(s) <= tileWidth - 10) ?? 11.5, text: broken, wrap: true };
}

// A meaning shows one sense per line, at the largest size where that works. A sense too
// long for one line is split into lines of even length, so no line ends up holding one
// stray character. What still does not fit the tile is cut with an ellipsis, as the
// production wall does (there the full entry is one tap away in the word detail sheet).
function evenLines(sense, perLine) {
  if (sense.length <= perLine) return [sense];
  const count = Math.ceil(sense.length / perLine);
  const each = Math.ceil(sense.length / count);
  const lines = [];
  for (let i = 0; i < sense.length; i += each) lines.push(sense.slice(i, i + each));
  return lines;
}
function fitMeaning(text, tile) {
  const senses = text.split('；');
  for (const size of [13, 12, 11]) {
    const lines = senses.flatMap(sense => evenLines(sense, Math.floor((tile.width - 10) / size)));
    const room = Math.max(2, Math.floor((tile.height - (lines.length > 3 ? 24 : 12)) / (size * 1.4)));
    const oneLineEach = lines.length === senses.length;
    if ((oneLineEach && lines.length <= room) || size === 11) {
      const shown = lines.length > room ? [...lines.slice(0, room - 1), `${lines[room - 1].slice(0, -1)}…`] : lines;
      return { size, text: shown.join('\n'), tall: shown.length > 3 };
    }
  }
  return { size: 11, text, tall: false };
}

function load(key, fallback, check = () => true) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && check(value) ? { ...fallback, ...value } : fallback;
  } catch {
    return fallback;
  }
}

// Memory state as "how much is filled": ring, half, full. Hue and fill both carry the
// level, so it survives greyscale and colour blindness. `swatch` draws the filled-tile
// look instead, for the legend when tiles are filled.
function Mark({ status, swatch = false }) {
  if (swatch) return <span className={`mark swatch ${status}`} aria-hidden="true" />;
  if (status === 'clear') {
    return <svg className="mark pip clear" width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><circle cx="4.5" cy="4.5" r="4.5" fill="currentColor" /></svg>;
  }
  return (
    <svg className={`mark pip ${status}`} width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
      <circle cx="4.5" cy="4.5" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={status === 'none' ? '1.6 1.6' : undefined} />
      {status === 'partial' && <path d="M4.5 0A4.5 4.5 0 0 0 4.5 9Z" fill="currentColor" />}
    </svg>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}

function Seg({ label, value, options, onChange }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
    </div>
  );
}

// Search commits while typing, but never on unfinished IME composition text:
// pinyin letters would otherwise filter the wall down to "no results" mid-word.
// The box keeps its own text, so a keystroke shows at once; the wall catches up as a
// transition, which React may drop when the next key arrives. Fast typing never waits.
function SearchField({ value, total, onCommit }) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  const sent = useRef([]);
  const input = useRef(null);
  // A query this box sent comes back as an echo and is ignored; anything else is a change
  // from outside (search cleared, state reset) and replaces what the box shows.
  useEffect(() => {
    const echo = sent.current.lastIndexOf(value);
    if (echo >= 0) { sent.current.splice(0, echo + 1); return; }
    sent.current = [];
    if (!composing.current) setDraft(value);
  }, [value]);
  const search = text => { sent.current.push(text); startTransition(() => onCommit(text)); };
  return (
    <div className="search">
      <Search size={16} strokeWidth={1.8} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label="搜索单词、释义或笔记"
        placeholder="搜索"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={draft}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={e => { composing.current = false; setDraft(e.currentTarget.value); search(e.currentTarget.value); }}
        onChange={e => {
          setDraft(e.target.value);
          if (!composing.current && !e.nativeEvent.isComposing) search(e.target.value);
        }}
      />
      {draft && (
        <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => { composing.current = false; setDraft(''); onCommit(''); input.current?.focus(); }}>
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// A bottom sheet. Closes on the backdrop and on Escape, and hands focus back.
function Sheet({ title, onClose, children }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.({ preventScroll: true }); };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={panel} className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="sheet-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}><X size={20} strokeWidth={1.6} aria-hidden="true" /></button></header>
        {children}
      </section>
    </div>
  );
}

function GestureList() {
  return (
    <dl className="gestures">
      {GESTURES.map(([gesture, result]) => <div key={gesture}><dt>{gesture}</dt><dd>{result}</dd></div>)}
    </dl>
  );
}

function App() {
  const [state, setState] = useState(() => load(storageKey, initial, s => s.schema === 1));
  const [prefs, setPrefs] = useState(() => load(prefsKey, defaultPrefs));
  const [marks, setMarks] = useState(() => load(marksKey, {}));
  const [saved, setSaved] = useState(true);
  const [width, setWidth] = useState(390);
  const [scenario, setScenario] = useState('normal');
  const [failWrites, setFailWrites] = useState(false);
  const [speaker, setSpeaker] = useState('flat');
  const [flips, setFlips] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Set());
  const [multi, setMulti] = useState(false);
  const [undo, setUndo] = useState(null);
  const [lastMark, setLastMark] = useState(null);
  const [recent, setRecent] = useState(null);
  const [notice, setNotice] = useState(null);
  const [motion, setMotion] = useState({ type: '', id: 0 });
  const [popped, setPopped] = useState(null);
  const [sheet, setSheet] = useState(false); // false | 'more' | 'group' | 'detail'
  const [groupDraft, setGroupDraft] = useState({ ids: [], kind: 'topic', name: '' });
  const [detail, setDetail] = useState(null);
  const [round, setRound] = useState(null);
  const [showMeaning, setShowMeaning] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [epoch, setEpoch] = useState(0);
  const gridRef = useRef(null);
  const carry = useRef(null);
  const cameFrom = useRef(null);
  const streak = useRef(0);
  const failRef = useRef(false);
  failRef.current = failWrites;
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const reduce = prefs.reduce;
  const stress = scenario === 'stress';
  const live = scenario === 'normal' || stress;
  const statusOf = id => marks[id] ?? entryOf(id).status;
  const scope = JSON.stringify([state.filter, state.sort, state.query.trim().toLowerCase()]);
  // As in the production wall, marking a word does not reshuffle what is on screen: the
  // browse list is rebuilt only when the search, filter or sort changes.
  const basePages = useMemo(
    () => pagesFor(state.query, state.filter, state.sort, id => marksRef.current[id] ?? byId[id].status, prefs.seed),
    [state.query, state.filter, state.sort, epoch, prefs.seed],
  );
  const pages = stress ? [stressPage] : state.scopes[scope]?.pages ?? basePages;
  const index = stress ? 0 : Math.max(0, Math.min(state.scopes[scope]?.index ?? 0, pages.length - 1));
  const empty = scenario === 'empty' || !pages.length;
  const current = empty ? [] : pages[index];
  const currentRef = useRef(current);
  currentRef.current = current;
  const total = empty ? 0 : pages.reduce((n, p) => n + p.length, 0);
  // Counts follow the search text but not the filter, so the strip stays a stable legend.
  const counts = useMemo(() => {
    const q = state.query.trim().toLocaleLowerCase();
    const c = { forgot: 0, partial: 0, clear: 0, none: 0 };
    for (const w of words) if (w.searchText.includes(q)) c[marks[w.id] ?? w.status]++;
    return c;
  }, [state.query, marks]);
  const activeRounds = rounds.map((r, i) => ({ ...r, i })).filter(r => state.reviews[r.i] < r.total);
  const doneRounds = rounds.map((r, i) => ({ ...r, i })).filter(r => state.reviews[r.i] >= r.total);
  const dueToday = activeRounds.filter(r => DUE_TODAY.has(r.due)).length;
  // Undo of a Fresh stays offered for as long as the arrangement it produced is on screen,
  // including after a search round trip. It goes away with the next Fresh or a reload.
  const canUndo = !stress && !!undo && undo.scope === scope && undo.index === index && state.scopes[scope]?.pages === undo.result;
  const canFresh = live && !empty && index < pages.length - 1;

  // Write first, then show. A `critical` change (review progress) is not shown at all
  // unless the write succeeded; browsing position is shown either way and flagged if unsaved.
  const write = (key, value) => {
    try {
      if (failRef.current) throw new Error('simulated write failure');
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const commit = (next, { critical = false } = {}) => {
    const ok = write(storageKey, next);
    if (critical && !ok) { setSaved(false); return false; }
    setState(next);
    setSaved(ok);
    return ok;
  };
  const say = (text, sticky = false) => setNotice({ text, sticky, id: performance.now() });
  const move = type => setMotion(m => ({ type, id: m.id + 1 }));
  const updatePrefs = patch => setPrefs(p => ({ ...p, ...patch }));

  useEffect(() => {
    configureFeedback({ sound: prefs.sound, haptics: prefs.haptics, speaker, pageTone: prefs.pageTone });
    try { localStorage.setItem(prefsKey, JSON.stringify(prefs)); } catch { /* preferences are not critical */ }
  }, [prefs, speaker]);

  // Follow changes made in an A/B tab on the same origin, for side-by-side comparison.
  useEffect(() => {
    const onStorage = e => {
      if (e.key !== storageKey || !e.newValue) return;
      try {
        const s = JSON.parse(e.newValue);
        if (s?.schema === 1) { setState({ ...initial, ...s }); setUndo(null); }
      } catch { /* ignore foreign values */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!notice || notice.sticky) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice?.id]);

  // The word typeface is a bundled web font: fit the words again once it has arrived.
  useEffect(() => {
    document.fonts?.load('500 15px "Source Serif 4"').then(() => { wordWidth.reset(); setEpoch(n => n + 1); }).catch(() => {});
  }, []);

  // One line, once, until the hold gesture has been used: it cannot be discovered by looking.
  useEffect(() => {
    if (!prefs.hinted && state.tab === 'wall') say('按住一个词，可以直接标记', true);
  }, []);

  // Fresh deals the new page in row by row; undo settles it back the other way. The
  // content is already committed, and a new action cancels the motion.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !motion.type || reduce || prefersReducedMotion()) return;
    const rising = motion.type === 'fresh';
    const animations = [...grid.children].map((tile, i) => {
      const row = Math.floor(i / 4);
      return tile.animate(
        [{ transform: `translateY(${rising ? 14 : -14}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 240, delay: (rising ? row : 6 - row) * 20, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
      );
    });
    return () => animations.forEach(a => a.cancel());
  }, [motion.id, reduce]);

  // Console object for verification only.
  useEffect(() => {
    window.candidateQA = {
      snapshot: () => ({ index, pages, ids: current, total, filter: state.filter, sort: state.sort, query: state.query, reviews: state.reviews, selected: [...selected], flips: [...flips], marks: { ...marks }, counts, saved, scope, canUndo, multi, tab: state.tab, look: prefs.look, axis: prefs.axis }),
      sounds: Object.keys(recipes),
      soundList: SOUND_LIST,
      measureSound,
    };
  });

  // ---- word wall ----
  const edge = () => play('edge');
  const setPage = (next, { carry: offset = null } = {}) => {
    if (!live || next === index) return false;
    if (next < 0 || next >= pages.length) { edge(); return false; }
    carry.current = offset;
    cameFrom.current = current[0];
    commit({ ...state, scopes: { ...state.scopes, [scope]: { pages, index: next } } });
    setNotice(null); setRecent(null);
    play(next > index ? 'pageNext' : 'pagePrev', next); // each page has its own note
    return true;
  };
  // Tiles of the page that just left stay as they were while it slides away.
  const pageSettled = () => {
    cameFrom.current = null;
    setFlips(old => (old.size ? new Set([...old].filter(id => currentRef.current.includes(id))) : old));
  };
  const exitMulti = () => { setMulti(false); setSelected(new Set()); };
  const fresh = () => {
    if (!live) return;
    setSheet(false);
    const next = stress ? null : freshPages(pages, index);
    if (!next) { say('已是最后一页'); edge(); return; }
    exitMulti();
    move('fresh');
    setUndo({ scope, pages, index, result: next.pages });
    commit({ ...state, scopes: { ...state.scopes, [scope]: { pages: next.pages, index } } });
    setFlips(new Set()); setNotice(null); setRecent('fresh');
    setAnnouncement(`本页 ${current.length} 词已后移 ${next.distance} 页${state.query.trim() ? '，仅调整本次搜索结果的顺序' : ''}。可以撤销。`);
    play('fresh'); haptic('fresh');
  };
  const undoFresh = () => {
    if (!canUndo) return;
    setSheet(false);
    move('undo');
    commit({ ...state, scopes: { ...state.scopes, [scope]: { pages: undo.pages, index: undo.index } } });
    setUndo(null); setFlips(new Set()); setRecent(null);
    say('已恢复这一页');
    play('undo');
  };
  const saveMarks = next => {
    if (!write(marksKey, next)) return false;
    marksRef.current = next;
    setMarks(next);
    return true;
  };
  // Marking writes first. Marked tiles turn back to their front: flip, judge, done.
  const applyMark = (ids, status) => {
    if (!ids.length) return false;
    const before = Object.fromEntries(ids.map(id => [id, statusOf(id)]));
    const next = { ...marks };
    for (const id of ids) next[id] = status;
    const unmarkedBefore = current.filter(id => statusOf(id) === 'none').length;
    if (!saveMarks(next)) { say('没有保存，标记没有改变'); play('error'); haptic('error'); return false; }
    const pageDone = unmarkedBefore > 0 && current.every(id => (next[id] ?? entryOf(id).status) !== 'none');
    setLastMark({ before, count: ids.length, status });
    setRecent('mark');
    setFlips(old => { const kept = new Set(old); ids.forEach(id => kept.delete(id)); return kept; });
    setPopped({ ids, key: performance.now() });
    setSheet(false);
    play(MARK_SOUND[status]); haptic('mark');
    if (pageDone) { play('pageDone', undefined, { at: 0.36 }); say('这一页都标过了'); } else setNotice(null);
    setAnnouncement(`已标记 ${ids.length} 词：${labels[status]}${pageDone ? '。这一页都标过了' : ''}`);
    return true;
  };
  const undoMark = () => {
    if (!lastMark) return;
    const next = { ...marks };
    for (const [id, status] of Object.entries(lastMark.before)) {
      if (status === entryOf(id).status) delete next[id]; else next[id] = status;
    }
    if (!saveMarks(next)) { say('没有保存，标记没有改变'); play('error'); return; }
    setSheet(false);
    setLastMark(null); setRecent(null);
    say('已撤销标记');
    play('undo');
  };
  const undoLast = () => {
    if (recent === 'mark' && lastMark) undoMark();
    else if (canUndo) undoFresh();
    else if (lastMark) undoMark();
    else { say('没有可撤销的操作'); edge(); }
  };
  const rateSelected = status => { if (applyMark([...selected], status)) exitMulti(); };
  const query = value => {
    const next = { ...state, query: value };
    if (value.trim()) next.searchOrigin = state.searchOrigin || { filter: state.filter, sort: state.sort };
    else if (state.searchOrigin) { next.filter = state.searchOrigin.filter; next.sort = state.searchOrigin.sort; next.searchOrigin = null; }
    commit(next);
    exitMulti(); setFlips(new Set()); setNotice(null);
    if (scenario !== 'normal') setScenario('normal');
  };
  const clearSearchAndFilter = () => {
    commit({ ...state, query: '', filter: 'all', sort: state.searchOrigin?.sort ?? state.sort, searchOrigin: null });
    exitMulti(); setFlips(new Set()); setScenario('normal'); setNotice(null);
  };
  const setFilter = key => {
    commit({ ...state, filter: state.filter === key ? 'all' : key });
    setSelected(new Set()); setNotice(null);
  };
  // As in the production wall, choosing a sort starts a new random order and goes back to
  // the first page of that order.
  const setSort = sort => {
    const scopes = { ...state.scopes };
    delete scopes[JSON.stringify([state.filter, sort, state.query.trim().toLowerCase()])];
    if (sort === 'random') updatePrefs({ seed: prefs.seed + 1 });
    commit({ ...state, sort, scopes });
    setNotice(null);
  };
  const toggleTile = id => {
    const [set, setter, on, off] = multi ? [selected, setSelected, 'select', 'deselect'] : [flips, setFlips, 'flip', 'flipBack'];
    const had = set.has(id);
    setter(old => { const next = new Set(old); had ? next.delete(id) : next.add(id); return next; });
    if (notice?.sticky) setNotice(null);
    play(had ? off : on);
    haptic(multi ? 'select' : 'flip');
  };
  const startMulti = id => {
    setMulti(true);
    if (id) setSelected(old => new Set([...old, id]));
    setNotice(null);
    play('select'); haptic('select');
  };
  // Grouping: the production form (kind and name). Groups made here are kept with this
  // demo only; showing and filtering by them is the production wall's grouped view.
  const group = ids => { setGroupDraft({ ids, kind: 'topic', name: '' }); setSheet('group'); };
  const createGroup = () => {
    const { ids, kind, name } = groupDraft;
    if (!name.trim() || !ids.length) return;
    const saved = load(groupsKey, { list: [] }).list;
    if (!write(groupsKey, { list: [...saved, { kind, name: name.trim(), words: ids.map(id => entryOf(id).word) }] })) { say('没有保存，分组没有创建'); play('error'); return; }
    setSheet(false); exitMulti();
    say(`已创建${kind === 'topic' ? '语义主题' : '关系'}“${name.trim()}”，${ids.length} 词`);
    play('markPartial');
  };
  const openDetail = id => { setDetail(id); setSheet('detail'); };
  const selectAllResults = () => { setSelected(new Set(pages.flat())); setSheet(false); say(`已选中全部 ${total} 词`); play('select'); };
  // Production actions this prototype has no data or flow for. They keep their place in
  // the sheet, and say so when tapped.
  const later = label => { setSheet(false); say(`${label}沿用正式 App 的流程，原型不包含`); };

  // ---- review ----
  const openRound = i => { setRound(i); setShowMeaning(false); setSaveError(false); streak.current = 0; };
  const answer = () => {
    const reviews = [...state.reviews];
    reviews[round]++;
    if (!commit({ ...state, reviews }, { critical: true })) {
      setSaveError(true);
      play('error'); haptic('error');
      return;
    }
    setSaveError(false); setShowMeaning(false);
    if (reviews[round] >= rounds[round].total) { play('complete'); haptic('complete'); }
    else { play('saved', streak.current); haptic('saved'); }
    streak.current++;
  };
  const again = () => { setShowMeaning(true); streak.current = 0; play('again'); };

  // ---- shell ----
  const changeTab = tab => { commit({ ...state, tab }); setRound(null); setNotice(null); setSheet(false); exitMulti(); if (scenario !== 'stress') setScenario('normal'); };
  const reset = () => {
    commit(initial);
    saveMarks({});
    setEpoch(n => n + 1);
    setScenario('normal'); setNotice(null); setUndo(null); setLastMark(null); setRecent(null); setFlips(new Set());
    exitMulti(); setSheet(false); setRound(null); setShowMeaning(false); setSaveError(false); setAnnouncement('');
  };
  const chooseScenario = value => { commit({ ...state, tab: 'wall' }); setRound(null); setNotice(null); exitMulti(); setFlips(new Set()); setScenario(value); };

  const wall = {
    state, scenario, live, multi, selected, flips, pages, index, current, counts, total, empty, canUndo, canFresh, lastMark, recent, notice, scope,
    look: prefs.look, axis: prefs.axis, reduce, statusOf, gridRef, carry, cameFrom, popped, sheet,
    setPage, pageSettled, edge, fresh, undoFresh, undoMark, undoLast, applyMark, group, openDetail, query, clearSearchAndFilter, setFilter, setSort, toggleTile, startMulti, exitMulti,
    selectPage: () => setSelected(old => new Set([...old, ...current])),
    openSheet: () => setSheet('more'),
    showLoaded: () => setScenario('normal'),
    holdUsed: () => { if (!prefs.hinted) updatePrefs({ hinted: true }); if (notice?.sticky) setNotice(null); },
  };
  const review = {
    reviews: state.reviews, active: activeRounds, done: doneRounds, dueToday, round, showMeaning, saveError,
    open: openRound, close: () => setRound(null), reveal: () => setShowMeaning(true), answer, again, say,
    notice,
  };
  const selecting = multi && state.tab === 'wall';

  return (
    <div className="c-workbench">
      <aside className="c-panel">
        <h1>候选 C</h1>
        <p>首页只有词墙。轻触翻面；按住一个词，滑到圆点上松手就是标记。</p>
        <p>与 A、B 共用同一份演示状态。<a href="/">打开 A / B</a></p>
        <div className="c-control"><span>宽度</span><Seg label="宽度" value={width} options={[[360, '360'], [390, '390']]} onChange={setWidth} /></div>
        <div className="c-control"><span>外观</span><Seg label="外观" value={prefs.scheme} options={[['light', '浅色'], ['dark', '深色']]} onChange={v => updatePrefs({ scheme: v })} /></div>
        <div className="c-control"><span>记忆状态</span><Seg label="记忆状态" value={prefs.look} options={[['pip', '圆点'], ['fill', '填色']]} onChange={v => updatePrefs({ look: v })} /></div>
        <div className="c-control"><span>词墙方向</span><Seg label="词墙方向" value={prefs.axis} options={[['x', '左右'], ['y', '上下']]} onChange={v => updatePrefs({ axis: v })} /></div>
        <div className="c-control"><span>音效</span><Switch label="音效" checked={prefs.sound} onChange={v => updatePrefs({ sound: v })} /></div>
        <div className="c-control"><span>减少动态效果</span><Switch label="减少动态效果" checked={prefs.reduce} onChange={v => updatePrefs({ reduce: v })} /></div>
        <div className="c-control">
          <label htmlFor="c-scenario">演示状态</label>
          <select id="c-scenario" value={scenario} onChange={e => chooseScenario(e.target.value)}>
            <option value="normal">正常</option><option value="stress">长词与长释义</option><option value="loading">载入中</option><option value="empty">无结果</option><option value="error">载入失败</option>
          </select>
        </div>
        <div className="c-control"><span>模拟保存失败</span><Switch label="模拟保存失败" checked={failWrites} onChange={setFailWrites} /></div>
        <details className="c-audition">
          <summary>试听全部声音</summary>
          <div className="c-control"><span>听感</span><Seg label="听感" value={speaker} options={[['flat', '直出'], ['phone', '模拟手机扬声器']]} onChange={setSpeaker} /></div>
          {/* The instrument for page turns and Fresh: pick one here, then turn pages to hear it in use. */}
          <div className="c-control">
            <label htmlFor="c-tone">翻页音色</label>
            <select id="c-tone" value={prefs.pageTone} onChange={e => { updatePrefs({ pageTone: e.target.value }); }}>
              {Object.entries(PAGE_TONES).map(([key, tone]) => <option key={key} value={key}>{tone.label}</option>)}
            </select>
          </div>
          <div className="c-sounds">
            {SOUND_LIST.map(([name, text]) => <button key={name} type="button" onClick={() => play(name, undefined, { force: true })}>{text}</button>)}
            <button type="button" onClick={() => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach(i => play('saved', i, { force: true, at: i * 0.42 }))}>复习 连续 12 次</button>
            <button type="button" onClick={() => [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2].forEach((p, i) => play('pageNext', p, { force: true, at: i * 0.38 }))}>翻页 往后 6 页再往回</button>
          </div>
        </details>
        <button type="button" className="c-reset" onClick={reset}>重置演示</button>
        <p className="c-fine">合成词条与演示进度。不读取词库，不产生学习记录。桌面上用鼠标也能拖动翻页、按住标记；双指手势需要触屏。</p>
      </aside>

      <div className={cx('c-phone', prefs.scheme === 'dark' && 'dark', prefs.look === 'fill' && 'fill', reduce && 'reduce')} style={{ '--phone-width': `${width}px` }}>
        <main className="c-main">
          {state.tab === 'wall' && <Wall w={wall} />}
          {state.tab === 'review' && (round == null ? <ReviewList r={review} /> : <ReviewSession r={review} />)}
          {state.tab === 'practice' && <Practice state={state} saved={saved} commit={commit} />}
          {state.tab === 'settings' && <Settings prefs={prefs} updatePrefs={updatePrefs} saved={saved} reset={reset} />}
        </main>
        <p className="sr" role="status" aria-live="polite">{announcement}</p>

        {/* While selecting, the marks take the place of the tabs: same height, same thumb. */}
        {selecting ? (
          <div className="rate-bar" role="group" aria-label="把所选的词标记为">
            {RATINGS.map(key => (
              <button key={key} type="button" disabled={!selected.size} onClick={() => rateSelected(key)}>
                <Mark status={key} swatch={prefs.look === 'fill'} />{labels[key]}
              </button>
            ))}
          </div>
        ) : (
          <nav className="nav" aria-label="主导航">
            {TABS.map(([id, title]) => (
              <button key={id} type="button" className={state.tab === id ? 'active' : ''} aria-current={state.tab === id ? 'page' : undefined} onClick={() => changeTab(id)}>
                {title}
                {id === 'review' && dueToday > 0 && <i className="due-dot" role="img" aria-label={`今天还有 ${dueToday} 轮`} />}
              </button>
            ))}
          </nav>
        )}

        {/* The same actions, in the same order, as 词库操作 in the production wall. */}
        {sheet === 'more' && state.tab === 'wall' && (
          <Sheet title="词库操作" onClose={() => setSheet(false)}>
            <ul className="rows sheet-rows">
              <li><button type="button" disabled={!canFresh} onClick={fresh}><span className="row-name">fresh 本页<small>把这一页后移，换一页词</small></span></button></li>
              {canUndo && <li><button type="button" onClick={undoFresh}><span className="row-name">撤销后移</span></button></li>}
              <li><button type="button" onClick={() => later('记录本轮卡片状态')}><span className="row-name">记录本轮卡片状态</span></button></li>
              <li><button type="button" disabled={!selected.size} onClick={() => later('补充整理')}><span className="row-name">补充整理</span></button></li>
              <li><button type="button" onClick={selectAllResults}><span className="row-name">选全部结果</span><span className="row-count">{total} 词</span></button></li>
              <li><button type="button" disabled={!selected.size} onClick={() => { setSelected(new Set()); setSheet(false); }}><span className="row-name">清空选择</span></button></li>
              <li><button type="button" disabled={selected.size !== 1} onClick={() => openDetail([...selected][0])}><span className="row-name">查看所选词详情</span></button></li>
              <li><button type="button" disabled={!selected.size} onClick={() => group([...selected])}><span className="row-name">为当前多选单词分组</span><span className="row-count">{selected.size} 词</span></button></li>
              <li><button type="button" disabled={!selected.size} onClick={() => later('设置复习轮')}><span className="row-name">为当前选中单词设置复习轮</span></button></li>
              <li><button type="button" disabled={!total} onClick={() => later('背诵筛选词')}><span className="row-name">背诵筛选词</span><span className="row-count">{total} 词</span></button></li>
              <li><button type="button" disabled={!lastMark} onClick={undoMark}><span className="row-name">撤销上次标记</span>{lastMark && <span className="row-count">{lastMark.count} 词</span>}</button></li>
            </ul>
            <h3 className="sheet-sub">不进多选也能做</h3>
            <GestureList />
          </Sheet>
        )}

        {sheet === 'group' && (
          <Sheet title="为当前多选单词分组" onClose={() => setSheet(false)}>
            <p className="sheet-note">已选 {groupDraft.ids.length} 词</p>
            <label className="field">分组归属
              <select value={groupDraft.kind} onChange={e => setGroupDraft(d => ({ ...d, kind: e.target.value }))}>
                <option value="topic">语义主题</option><option value="relation">关系</option>
              </select>
            </label>
            <label className="field">分组名称
              <input value={groupDraft.name} maxLength={80} onChange={e => setGroupDraft(d => ({ ...d, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) createGroup(); }} />
            </label>
            <button type="button" className="pill wide" disabled={!groupDraft.name.trim()} onClick={createGroup}>创建</button>
          </Sheet>
        )}

        {sheet === 'detail' && detail && (
          <Sheet title="词条" onClose={() => setSheet(false)}>
            <p className="detail-word" lang="en">{entryOf(detail).word}</p>
            <ul className="detail-senses">{entryOf(detail).meaning.split('；').map(sense => <li key={sense}>{sense}</li>)}</ul>
            <p className="detail-status"><Mark status={statusOf(detail)} />{labels[statusOf(detail)]}</p>
            <div className="rate-bar in-sheet" role="group" aria-label="把这个词标记为">
              {RATINGS.map(key => <button key={key} type="button" onClick={() => applyMark([detail], key)}><Mark status={key} />{labels[key]}</button>)}
            </div>
          </Sheet>
        )}
      </div>
    </div>
  );
}

// A tile at rest is one face: the word, or the meaning. Its other face exists only for
// the quarter second it takes to turn over, so a page of tiles stays as light as a page
// of plain buttons, and unchanged tiles are not rendered again.
const Tile = memo(function Tile({ id, status, look, flipped, selected, held, multi, width, height, still, onToggle }) {
  const entry = entryOf(id);
  const inner = useRef(null);
  const [resting, setResting] = useState(flipped); // the face shown before the current turn
  const turning = !still && resting !== flipped;

  useLayoutEffect(() => {
    if (!turning) { if (resting !== flipped) setResting(flipped); return; }
    const animation = inner.current.animate(
      [{ transform: `rotateY(${flipped ? 0 : 180}deg)` }, { transform: `rotateY(${flipped ? 180 : 0}deg)` }],
      { duration: 280, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)', fill: 'forwards' },
    );
    animation.onfinish = () => setResting(flipped);
    return () => animation.cancel();
  }, [flipped, turning]);

  const front = () => {
    const fit = fitWord(entry.word, width);
    return (
      <span className={cx('face front', look === 'fill' && status !== 'none' && `fill-${status}`)}>
        {look === 'pip' && status !== 'none' && <Mark status={status} />}
        <span className={cx('word', fit.wrap && 'wrap')} style={{ fontSize: fit.size }} lang="en">{fit.text}</span>
      </span>
    );
  };
  const back = () => {
    const meaning = fitMeaning(entry.meaning, { width, height });
    return (
      <span className={cx('face back', meaning.tall && 'tall')}>
        {status !== 'none' && <Mark status={status} />}
        <span className="meaning" style={{ fontSize: meaning.size }}>{meaning.text}</span>
      </span>
    );
  };
  return (
    <button
      type="button"
      data-word-id={id}
      className={cx('tile', turning && 'turning', selected && 'selected', held && 'held')}
      aria-label={`${entry.word}，${entry.meaning}，${labels[status]}`}
      aria-pressed={multi ? selected : flipped}
      onClick={() => onToggle(id)}
    >
      <span className="tile-inner" ref={inner}>
        {(turning || !flipped) && front()}
        {(turning || flipped) && back()}
      </span>
      {selected && <span className="tick"><Check size={11} strokeWidth={3} aria-hidden="true" /></span>}
    </button>
  );
});

function Wall({ w }) {
  const { state, scenario, live, multi, selected, flips, pages, index, current, counts, total, empty, canUndo, lastMark, recent, notice, look, axis, reduce } = w;
  const atEnd = index >= pages.length - 1;
  const trackRef = useRef(null);
  const pan = useRef({ x: 0, start: 0, animation: null });
  const wheel = useRef({ sum: 0, lockedUntil: 0 });
  const [size, setSize] = useState({ width: 88, height: 86 });
  const [hold, setHold] = useState(null);
  const [strip, setStrip] = useState(null);
  const still = reduce || prefersReducedMotion();

  // The wall is one strip of pages. At rest the track sits one page in, so the previous
  // and the next page lie just outside the view and move in with the finger.
  const transformFor = x => (axis === 'y'
    ? `translate3d(0, calc(-100% - ${GRID_GAP}px + ${x}px), 0)`
    : `translate3d(calc(-100% - ${GRID_GAP}px + ${x}px), 0, 0)`);
  const moving = on => trackRef.current?.parentElement.classList.toggle('moving', on);
  const place = x => {
    pan.current.x = x;
    if (!trackRef.current) return;
    trackRef.current.style.transform = transformFor(x);
    moving(x !== 0 || !!pan.current.animation);
  };
  const stop = () => { pan.current.animation?.cancel(); pan.current.animation = null; };
  const pageLength = () => {
    const board = gesture.ref.current;
    return (axis === 'y' ? board.clientHeight : board.clientWidth) + GRID_GAP;
  };
  // Where the track is right now, in px away from rest, even in the middle of a glide.
  const visualX = () => {
    if (!pan.current.animation || !trackRef.current) return pan.current.x;
    const m = new DOMMatrixReadOnly(getComputedStyle(trackRef.current).transform);
    return (axis === 'y' ? m.m42 : m.m41) + pageLength();
  };
  const settle = (from, done) => {
    stop();
    if (!trackRef.current || still || Math.abs(from) < 0.5) { place(0); done?.(); return; }
    place(0);
    const animation = trackRef.current.animate(
      [{ transform: transformFor(from) }, { transform: transformFor(0) }],
      { duration: Math.min(420, 220 + Math.abs(from) * 0.45), easing: 'cubic-bezier(0.22, 0.9, 0.24, 1)' },
    );
    pan.current.animation = animation;
    moving(true);
    animation.onfinish = () => {
      if (pan.current.animation !== animation) return;
      pan.current.animation = null;
      moving(false);
      done?.();
    };
    animation.oncancel = () => done?.();
  };
  const go = dir => {
    const target = index + dir;
    if (target < 0 || target >= pages.length) { w.edge(); return; }
    // The page changes now; what the eye sees is carried over and glides to rest.
    w.setPage(target, { carry: dir * pageLength() + visualX() });
  };

  // The pages on either side are only needed once the wall moves. They are rendered a
  // moment after the current page has settled, so typing in the search box or turning a
  // page never waits for them. The page just left is kept until its glide has finished.
  const paneKey = `${w.scope}|${index}|${current[0] ?? ''}|${axis}|${scenario}`;
  const [warm, setWarm] = useState(null);
  useEffect(() => {
    if (warm === paneKey) return;
    // After a pause, and then only when the browser has nothing better to do.
    let idle = 0;
    const timer = setTimeout(() => {
      if (window.requestIdleCallback) idle = requestIdleCallback(() => setWarm(paneKey), { timeout: 600 });
      else setWarm(paneKey);
    }, 180);
    return () => { clearTimeout(timer); if (idle) cancelIdleCallback(idle); };
  }, [paneKey]);
  const toggle = useRef(w.toggleTile);
  toggle.current = w.toggleTile;
  const onToggle = useCallback(id => toggle.current(id), []);

  const gesture = useWallGestures({
    enabled: live && !w.sheet,
    multi,
    axis,
    onPanStart: () => {
      if (warm !== paneKey) flushSync(() => setWarm(paneKey)); // a drag begun at once still finds its neighbours
      const x = visualX(); stop(); pan.current.start = x; place(x);
    },
    onPan: delta => {
      let x = pan.current.start + delta;
      if ((x > 0 && index === 0) || (x < 0 && atEnd)) x *= 0.28; // nothing that way: the wall resists
      place(x);
    },
    onPanEnd: (delta, velocity) => {
      const x = pan.current.x;
      const length = pageLength();
      let dir = 0;
      if (x < -length * 0.2 || (velocity < -0.4 && x < 0)) dir = 1;
      else if (x > length * 0.2 || (velocity > 0.4 && x > 0)) dir = -1;
      const target = index + dir;
      if (dir && target >= 0 && target < pages.length && w.setPage(target, { carry: x + dir * length })) return;
      if (dir) w.edge();
      settle(x);
    },
    onFresh: w.fresh,
    onUndo: w.undoLast,
    onHoldOpen: id => { setHold({ id, option: null }); w.holdUsed(); play('holdOpen'); haptic('hold'); },
    onHoldHover: option => { setHold(h => h && { ...h, option }); if (option) play('holdHover'); },
    onHoldChoose: (id, option) => {
      setHold(null);
      if (option === 'group') w.group([id]);
      else if (option === 'detail') w.openDetail(id);
      else w.applyMark([id], option);
    },
    onHoldRelease: id => { setHold(null); w.startMulti(id); },
    onHoldCancel: () => setHold(null),
  });

  // Tile size, for fitting words and meanings: four columns, seven rows.
  useLayoutEffect(() => {
    const board = gesture.ref.current;
    if (!board) return;
    const measure = () => setSize({ width: (board.clientWidth - GRID_GAP * 3) / 4, height: (board.clientHeight - GRID_GAP * 6) / 7 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  // After a page change, start from where the eye was and glide to rest.
  useLayoutEffect(() => {
    const offset = w.carry.current;
    w.carry.current = null;
    if (offset == null) { stop(); place(0); return; }
    settle(offset, w.pageSettled);
  }, [index, w.scope, axis, scenario]);

  // The mark strip sits just above the word being held, kept inside the wall.
  useLayoutEffect(() => {
    if (!hold) { setStrip(null); return; }
    const board = gesture.ref.current;
    const tile = board?.querySelector(`.pane.current [data-word-id="${hold.id}"]`);
    if (!tile) return;
    const b = board.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    const stripWidth = 260;
    setStrip({
      left: Math.max(0, Math.min(b.width - stripWidth, t.left - b.left + t.width / 2 - stripWidth / 2)),
      top: t.top - b.top - 60,
    });
  }, [hold?.id]);

  // A freshly marked word shows it: the pip lands with a small bounce, or the fill washes in.
  useLayoutEffect(() => {
    const grid = w.gridRef.current;
    if (!w.popped || !grid || still) return;
    for (const id of w.popped.ids) {
      const front = grid.querySelector(`[data-word-id="${id}"] .face.front`);
      const mark = front?.querySelector('.mark');
      (mark || front)?.animate(
        mark
          ? [{ transform: 'scale(0.2)' }, { transform: 'scale(1.9)', offset: 0.45 }, { transform: 'scale(1)' }]
          : [{ filter: 'brightness(0.86)' }, { filter: 'none' }],
        { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      );
    }
    // ...and the count it joined ticks up where the eye can catch it.
    gesture.ref.current?.parentElement
      ?.querySelector(`.count[data-status="${lastMark?.status}"] .count-n`)
      ?.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
  }, [w.popped?.key]);

  const onWheel = e => {
    const along = axis === 'y' ? e.deltaY : Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    const now = performance.now();
    if (!along || multi || !live || now < wheel.current.lockedUntil) return;
    wheel.current.sum += along;
    if (Math.abs(wheel.current.sum) > 40) {
      const dir = Math.sign(wheel.current.sum);
      wheel.current = { sum: 0, lockedUntil: now + 420 };
      go(dir);
    }
  };

  const pane = (ids, role) => {
    const shown = ids && (role === 'current' || warm === paneKey || ids[0] === w.cameFrom.current);
    if (!shown) return <div key={role} className={cx('pane', role)} />;
    return (
      <div
        key={ids[0]}
        className={cx('pane grid', role)}
        ref={role === 'current' ? w.gridRef : undefined}
        aria-hidden={role === 'current' ? undefined : true}
        inert={role !== 'current'}
      >
        {ids.map(id => (
          <Tile
            key={id}
            id={id}
            status={w.statusOf(id)}
            look={look}
            width={size.width}
            height={size.height}
            flipped={flips.has(id)}
            selected={selected.has(id)}
            held={hold?.id === id}
            multi={multi}
            still={still}
            onToggle={onToggle}
          />
        ))}
      </div>
    );
  };
  const stressed = scenario === 'stress';

  return (
    <section className="wall">
      {multi ? (
        <div className="bar select-bar" role="toolbar" aria-label="多选">
          <button type="button" className="text-btn strong" onClick={w.exitMulti}>取消</button>
          <span>已选 {selected.size} 词</span>
          <button type="button" className="text-btn" onClick={w.selectPage}>全选本页</button>
          <button type="button" className="icon-btn" aria-label="更多操作：fresh、分组、撤销" onClick={w.openSheet}><MoreHorizontal size={20} strokeWidth={1.6} aria-hidden="true" /></button>
        </div>
      ) : (
        <div className="bar">
          <SearchField value={state.query} total={total} onCommit={w.query} />
          <button type="button" className="text-btn" onClick={() => w.startMulti()}>多选</button>
        </div>
      )}

      <div className="bar filters">
        <div className="counts" role="group" aria-label="按记忆状态筛选">
          {STATUS_ORDER.map(key => (
            <button
              key={key}
              type="button"
              className={cx('count', state.filter !== 'all' && state.filter !== key && 'dim')}
              data-status={key}
              aria-pressed={state.filter === key}
              aria-label={`${labels[key]}，${counts[key]} 词`}
              onClick={() => w.setFilter(key)}
            >
              <Mark status={key} swatch={look === 'fill'} />
              {state.filter === key && <span className="count-label">{labels[key]}</span>}
              <span className="count-n">{counts[key]}</span>
            </button>
          ))}
          {/* With one state filtered, its own count is the total. */}
          {state.filter === 'all' && <span className="page-total">{total} 词</span>}
        </div>
        <select className="sort" aria-label="排序" value={state.sort} onChange={e => w.setSort(e.target.value)}>
          <option value="demo">演示顺序</option>
          <option value="az">A–Z</option>
          <option value="za">Z–A</option>
          <option value="random">随机</option>
        </select>
      </div>

      <div className={cx('board', axis === 'y' ? 'vertical' : 'horizontal')} ref={gesture.ref} onClickCapture={gesture.suppressClick} onWheel={onWheel}>
        {scenario === 'loading' ? (
          <div className="grid skeleton" role="status" aria-label="正在读取词库">
            {Array.from({ length: 28 }, (_, i) => <i key={i} />)}
          </div>
        ) : scenario === 'error' ? (
          <div className="state">
            <h2>没能载入词库</h2>
            <p>你的位置还在，重新载入后从这里继续。</p>
            <button type="button" className="pill" onClick={w.showLoaded}>重新载入</button>
          </div>
        ) : empty ? (
          <div className="state">
            <h2>没有匹配的词</h2>
            <p>换一个更短的词形，或用中文释义搜索。</p>
            <button type="button" className="ghost" onClick={w.clearSearchAndFilter}>清空搜索与筛选</button>
          </div>
        ) : (
          <div className="clip">
            <div className="track" ref={trackRef}>
              {pane(stressed ? null : pages[index - 1], 'previous')}
              {pane(current, 'current')}
              {pane(stressed ? null : pages[index + 1], 'next')}
            </div>
          </div>
        )}

        {hold && strip && (
          <div className="hold-strip" style={{ left: strip.left, top: strip.top }} aria-hidden="true">
            {hold.option && <span className="hold-label">{{ group: '分组', detail: '查看详情' }[hold.option] ?? labels[hold.option]}</span>}
            {RATINGS.map(key => (
              <span key={key} data-hold-option={key} className={cx('hold-option', hold.option === key && 'active')}><Mark status={key} /></span>
            ))}
            <span data-hold-option="group" className={cx('hold-option text', hold.option === 'group' && 'active')}>分组</span>
            <span data-hold-option="detail" className={cx('hold-option text', hold.option === 'detail' && 'active')}>详情</span>
          </div>
        )}
      </div>

      <div className="bar actions">
        {/* Pages are turned by dragging the wall, so no buttons are shown. The two below
            are for screen readers and keyboards only, which cannot drag. */}
        <div className="pager">
          <button type="button" className="sr" aria-label="上一页" disabled={!live || empty || index === 0} onClick={() => go(-1)} />
          <span className="page-no" aria-label={empty ? '没有页' : `第 ${index + 1} 页，共 ${pages.length} 页`}>{empty ? 0 : index + 1}<i>/</i>{empty ? 0 : pages.length}</span>
          <button type="button" className="sr" aria-label="下一页" disabled={!live || empty || atEnd} onClick={() => go(1)} />
        </div>
        <div className="slot">
          {notice ? <span className="notice" role="status">{notice.text}</span>
            : recent === 'mark' && lastMark ? <button type="button" className="text-btn" onClick={w.undoMark}>撤销标记</button>
            : canUndo ? <button type="button" className="text-btn" onClick={w.undoFresh}>撤销后移</button>
            : null}
        </div>
      </div>
    </section>
  );
}

function ReviewList({ r }) {
  const [showDone, setShowDone] = useState(false);
  const next = r.active[0];
  const headline = r.dueToday ? `今天还有 ${r.dueToday} 轮` : r.active.length ? '今天的复习做完了' : '所有轮次都完成了';
  // The demo keeps one finished round so the finished list is never empty, as A/B does.
  const done = [{ name: '简明与清晰', total: 12, i: -1 }, ...r.done];
  return (
    <section className="review">
      <h1 className="headline">{headline}</h1>

      {/* Every unfinished round is one row. The rule under a row is its progress. */}
      {r.active.length > 0 && (
        <ul className="rows rounds">
          {r.active.map(x => {
            const count = r.reviews[x.i];
            return (
              <li key={x.name} style={{ '--progress': `${count / x.total * 100}%` }}>
                <button type="button" aria-label={`${x.name}，${x.due}，已练 ${count} 词，共 ${x.total} 词`} onClick={() => r.open(x.i)}>
                  <span className="row-name">{x.name}</span>
                  {DUE_TODAY.has(x.due) && <span className={cx('row-due', x.due === '已到期' && 'overdue')}>{x.due}</span>}
                  <span className="row-count">{count}<i>/</i>{x.total}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ul className="rows quiet">
        <li>
          <button type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
            <span className="row-name">已完成</span>
            <span className="row-count">{done.length} 轮</span>
          </button>
          {showDone && (
            <ul className="done-list">
              {done.map(x => <li key={x.name}><span>{x.name}</span><span className="row-count">{x.total}<i>/</i>{x.total}</span></li>)}
            </ul>
          )}
        </li>
        <li>
          <button type="button" onClick={() => r.say('任务设置沿用正式 App 的创建流程，原型不包含。')}>
            <span className="row-name">设置复习任务</span>
          </button>
        </li>
      </ul>
      {r.notice && <p className="inline-note" role="status">{r.notice.text}</p>}

      {/* The one primary action sits where the thumb already is, as on every other screen.
          Once nothing is due today it steps back to a quiet button: today has an end. */}
      {next && (
        <button type="button" className={cx(r.dueToday ? 'pill' : 'ghost', 'wide primary-action')} onClick={() => r.open(next.i)}>
          {r.dueToday ? (r.reviews[next.i] ? '继续' : '开始') : '再练一轮'}<span>{next.name}</span>
        </button>
      )}
    </section>
  );
}

function ReviewSession({ r }) {
  const info = rounds[r.round];
  const count = Math.min(r.reviews[r.round], info.total);
  const finished = count >= info.total;
  const word = words[(r.round * 28 + r.reviews[r.round]) % words.length];
  // After a round: offer the next one only while something is still due today.
  const nextDue = r.active.find(x => x.i !== r.round && DUE_TODAY.has(x.due));
  return (
    <section className="session">
      <header className="session-top">
        <button type="button" className="icon-btn" aria-label="返回复习" onClick={r.close}><ChevronLeft size={20} strokeWidth={1.6} aria-hidden="true" /></button>
        <div className="session-title"><strong>{info.name}</strong><span>{info.hint}</span></div>
        <span className="session-count" aria-label={`已练 ${count} 词，共 ${info.total} 词`}><b key={count}>{count}</b><i>/</i>{info.total}</span>
      </header>
      <div className="track-bar"><i style={{ width: `${count / info.total * 100}%` }} /></div>

      {finished ? (
        <div className="finish">
          <h2>{nextDue ? '这一轮完成了' : '今天的复习做完了'}</h2>
          <p>{info.name}，{info.total} 词都已保存。</p>
          {nextDue && <button type="button" className="pill wide" onClick={() => r.open(nextDue.i)}>下一轮：{nextDue.name}</button>}
          <button type="button" className="ghost wide" onClick={r.close}>返回复习</button>
        </div>
      ) : (
        <>
          <button type="button" className="recall" onClick={r.reveal} aria-label={r.showMeaning ? `${word.word}，${word.meaning}` : `${word.word}，轻触查看释义`}>
            <span className="recall-word" key={word.id}>{word.word}</span>
            <span className={cx('recall-meaning', r.showMeaning && 'shown')}>{r.showMeaning ? word.meaning : '轻触查看释义'}</span>
          </button>
          {r.saveError && (
            <p className="save-error" role="alert">这一词没有保存，进度没有前进。<button type="button" className="text-btn" onClick={r.answer}>重试</button></p>
          )}
          <div className="answer">
            <button type="button" className="ghost" onClick={r.again}>再想想</button>
            <button type="button" className="pill" onClick={r.answer}>记得</button>
          </div>
        </>
      )}
    </section>
  );
}

function Practice({ state, saved, commit }) {
  const i = state.practiceIndex;
  const ex = exercises[i];
  const [showTranslation, setShowTranslation] = useState(false);
  useEffect(() => setShowTranslation(false), [i]);
  const go = n => {
    if (n < 0 || n >= exercises.length) return;
    commit({ ...state, practiceIndex: n });
    play(n > i ? 'questionNext' : 'questionPrev');
  };
  const choose = j => { commit({ ...state, drafts: { ...state.drafts, [i]: j } }); play('select'); };
  return (
    <section className="practice">
      <p className="practice-meta"><span>词义辨认</span><span>{i + 1}<i>/</i>{exercises.length}</span></p>
      <p className="sentence" key={i}>{ex.text}</p>
      <p className="instruction">选择与例句表达相符的词。</p>
      <div className="options" role="group" aria-label="选项">
        {ex.options.map((option, j) => (
          <button key={option} type="button" aria-pressed={state.drafts[i] === j} onClick={() => choose(j)}>
            <span className="letter">{'ABC'[j]}</span>{option}
          </button>
        ))}
      </div>
      {state.drafts[i] != null && !saved && <p className="save-error" role="alert">草稿还没有保存。</p>}
      <button type="button" className="text-btn translation" aria-expanded={showTranslation} onClick={() => setShowTranslation(!showTranslation)}>{showTranslation ? ex.translation : '查看例句中文'}</button>
      <div className="answer">
        <button type="button" className="ghost" disabled={!i} onClick={() => go(i - 1)}>上一题</button>
        <button type="button" className="pill" disabled={i >= exercises.length - 1} onClick={() => go(i + 1)}>下一题</button>
      </div>
      <p className="fine">原创例句，只演示切题与草稿，不计分。</p>
    </section>
  );
}

function Settings({ prefs, updatePrefs, saved, reset }) {
  return (
    <section className="settings">
      <ul className="rows">
        <li className="row-static"><span className="row-name">外观</span><Seg label="外观" value={prefs.scheme} options={[['light', '浅色'], ['dark', '深色']]} onChange={v => updatePrefs({ scheme: v })} /></li>
        <li className="row-static"><span className="row-name">记忆状态<small>圆点更安静；填色是原来的整块颜色</small></span><Seg label="记忆状态" value={prefs.look} options={[['pip', '圆点'], ['fill', '填色']]} onChange={v => updatePrefs({ look: v })} /></li>
        <li className="row-static"><span className="row-name">词墙方向</span><Seg label="词墙方向" value={prefs.axis} options={[['x', '左右'], ['y', '上下']]} onChange={v => updatePrefs({ axis: v })} /></li>
        <li className="row-static"><span className="row-name">音效</span><Switch label="音效" checked={prefs.sound} onChange={v => updatePrefs({ sound: v })} /></li>
        {/* Every instrument in PAGE_TONES (sound.mjs) is listed; adding one there adds it here. */}
        <li className="row-static">
          <span className="row-name">翻页音色<small>翻页、fresh 和撤销用的乐器</small></span>
          <select className="row-select" aria-label="翻页音色" value={prefs.pageTone} onChange={e => { updatePrefs({ pageTone: e.target.value }); play('pageNext', 3, { at: 0.3 }); }}>
            {Object.entries(PAGE_TONES).map(([key, tone]) => <option key={key} value={key}>{tone.label}</option>)}
          </select>
        </li>
        <li className="row-static"><span className="row-name">触感<small>浏览器原型用简单振动代替，真机需另测</small></span><Switch label="触感" checked={prefs.haptics} onChange={v => updatePrefs({ haptics: v })} /></li>
        <li className="row-static"><span className="row-name">减少动态效果</span><Switch label="减少动态效果" checked={prefs.reduce} onChange={v => updatePrefs({ reduce: v })} /></li>
      </ul>
      <h2 className="section-label">词墙手势</h2>
      <GestureList />
      <ul className="rows">
        <li className="row-static"><span className="row-name">演示状态</span><span className={cx('row-count', !saved && 'overdue')}>{saved ? '已保存在本机' : '没有保存'}</span></li>
        <li><button type="button" onClick={reset}><span className="row-name">重置这份演示</span></button></li>
      </ul>
      <p className="fine">这里是合成词条和演示进度，不会导入、覆盖或同步你的学习记录。</p>
    </section>
  );
}

// Reuse the root across hot reloads of this module.
const container = document.getElementById('root');
const root = (container.candidateRoot ??= createRoot(container));
root.render(<App />);
