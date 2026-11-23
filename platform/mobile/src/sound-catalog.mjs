export const SAMPLE_RATE = 48_000;
export const DEFAULT_PAGE_TONE = 'vibes';
export const PAGE_TONES = {
  kalimba: { label: '卡林巴', centre: 700, ring: 0.11, attack: 0.004, thump: 0.05, partials: [[1, 1, 1], [5.9, 0.1, 0.25], [16.3, 0.02, 0.1]] },
  marimba: { label: '马林巴', centre: 740, ring: 0.08, attack: 0.006, thump: 0.07, partials: [[1, 1, 1], [3.99, 0.17, 0.26], [10.65, 0.035, 0.09]] },
  vibes: { label: '颤音琴', centre: 760, ring: 0.17, attack: 0.007, thump: 0.02, partials: [[1, 1, 1], [4, 0.1, 0.4], [10, 0.02, 0.15]] },
  glock: { label: '钟琴', centre: 1500, ring: 0.14, attack: 0.002, thump: 0.01, partials: [[1, 1, 1], [2.76, 0.3, 0.5], [5.4, 0.12, 0.3], [8.93, 0.04, 0.15]] },
  musicbox: { label: '音乐盒', centre: 1300, ring: 0.14, attack: 0.002, thump: 0.015, partials: [[1, 1, 1], [6.27, 0.14, 0.3], [17.55, 0.02, 0.1]] },
};

const simpleSounds = new Set([
  'flip', 'flipBack', 'select', 'deselect', 'marqueeGrow', 'questionNext', 'questionPrev',
  'holdOpen', 'holdHover', 'markForgot', 'markPartial', 'markClear', 'wordAdded', 'pageDone',
  'complete', 'again', 'edge', 'error', 'answerReady', 'blankNext', 'submit', 'answerSaved',
  'enter', 'leave', 'sheetOpen', 'sheetClose', 'chip', 'sizeUp', 'sizeDown', 'tap',
]);
const variants = { optionPick: 6, optionDrop: 6, typeSwitch: 4 };
const snake = name => name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const scaleDegree = value => ((value % 5) + 5) % 5;
const index = (value, fallback = 0) => Number.isFinite(value) ? Math.trunc(value) : fallback;

export function soundAsset(name, arg, tone = DEFAULT_PAGE_TONE) {
  if (!Object.hasOwn(PAGE_TONES, tone)) tone = DEFAULT_PAGE_TONE;
  switch (name) {
    case 'pageNext': return `page_${tone}_${scaleDegree(index(arg, 1))}`;
    case 'pagePrev': return `page_${tone}_${scaleDegree(index(arg))}`;
    case 'fresh':
    case 'undo': return `${name}_${tone}`;
    case 'saved': return `saved_${scaleDegree(index(arg))}`;
    default:
      if (Object.hasOwn(variants, name)) return `${snake(name)}_${Math.max(0, Math.min(variants[name] - 1, index(arg)))}`;
      return simpleSounds.has(name) ? snake(name) : null;
  }
}

function onScale(factory) { return Array.from({ length: 5 }, (_, arg) => factory(arg)); }
export const SOUND_ASSETS = [
  ...Array.from(simpleSounds, name => ({ name })),
  ...Object.entries(variants).flatMap(([name, count]) => Array.from({ length: count }, (_, arg) => ({ name, arg }))),
  ...Object.keys(PAGE_TONES).flatMap(tone => [...onScale(arg => ({ name: 'pageNext', arg, tone })), { name: 'fresh', tone }, { name: 'undo', tone }]),
  ...onScale(arg => ({ name: 'saved', arg })),
].map(spec => ({ ...spec, id: soundAsset(spec.name, spec.arg, spec.tone) }));

export function playbackRate(name, random = Math.random) {
  return name === 'marqueeGrow' ? 1 : 1 + (random() * 2 - 1) * 0.002;
}
