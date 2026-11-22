// Candidate C · interface sound and haptics.
//
// Everything is synthesised with the Web Audio API: no audio files, no dependencies.
// The sounds are modelled on struck wood rather than on oscillator blips:
//
//   - a note is a marimba bar: partials at 1 : 3.99 : 10.65 of the fundamental (the tuning
//     of a real bar, as used in the STK ModalBar model), each dying away exponentially,
//     the upper ones much faster than the fundamental; the mallet is soft, so the attack
//     takes a few milliseconds and carries a low thump instead of a click;
//   - a tick is a small wood block: partials at 1 : 2.777 : 7.378, gone in a few
//     hundredths of a second;
//   - a page turn is brushed paper: broad filtered noise, not a swept whistle;
//   - everything passes through a very short room, and no two strikes are identical
//     (a few cents of pitch and a little level vary each time).
//
// Rules:
//   - every action the user starts on purpose and that moves them forward has a sound of
//     its own, and they are all about equally loud (see LEVEL, set by measurement);
//   - "not this way" sounds (edge, error, think again) are softer and fall in pitch;
//   - pitched notes mean something was saved;
//   - sound never blocks or delays an interaction, and failing to play is silent.

const MASTER = 0.9;
const C4 = 261.63;
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]; // C D E G A
const NOTE = { A4: 440, C5: 523.25, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G4: 392 };

// Relative levels. Calibrated with measureSound so that, through the phone-speaker model,
// every forward action lands within about 1.5 dB of the others; the "not this way" group
// sits 5 to 7 dB lower.
const LEVEL = {
  flip: 1, flipBack: 0.95, select: 1, deselect: 1,
  pageNext: 1, pagePrev: 1, fresh: 1, undo: 1, // set per instrument, see AUTO
  holdOpen: 1, holdHover: 1,
  markForgot: 0.6, markPartial: 0.6, markClear: 0.65, pageDone: 0.56,
  saved: 0.7, complete: 0.58, questionNext: 3.2, questionPrev: 2.9,
  again: 0.55, edge: 1, error: 0.78,
};
// The streak scale: small trims so that every step of the climb is equally loud.
const STEP_TRIM = [1.06, 0.87, 0.84, 1.08, 1.16];

// Name, label, and whether it is a forward action (loud) or not.
export const SOUND_LIST = [
  ['flip', '翻面', true], ['flipBack', '翻回', true], ['select', '选中', true], ['deselect', '取消选中', true],
  ['pageNext', '词墙 下一页', true], ['pagePrev', '词墙 上一页', true], ['fresh', 'fresh', true], ['undo', '撤销', true],
  ['holdOpen', '按住', true], ['holdHover', '滑过选项', false],
  ['markForgot', '标记 完全忘记', true], ['markPartial', '标记 有一点印象', true], ['markClear', '标记 记得很清楚', true], ['pageDone', '本页标完', true],
  ['saved', '复习 已保存', true], ['complete', '一轮完成', true],
  ['questionNext', '刷题 下一题', true], ['questionPrev', '刷题 上一题', true],
  ['again', '再想想', false], ['edge', '到头', false], ['error', '没保存', false],
];

// ---- randomness: live strikes vary a little, offline measurements are repeatable ----
let random = Math.random;
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
const vary = amount => 1 + (random() * 2 - 1) * amount;
const cents = c => 2 ** ((random() * 2 - 1) * c / 1200);

const noiseCache = new WeakMap();
function noiseFor(ac) {
  let buffer = noiseCache.get(ac);
  if (!buffer) {
    buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
    const data = buffer.getChannelData(0);
    const next = seeded(22222);
    for (let i = 0; i < data.length; i++) data[i] = next() * 2 - 1;
    noiseCache.set(ac, buffer);
  }
  return buffer;
}

function filter(ac, type, frequency, Q = 0.71, gain = 0) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  f.gain.value = gain;
  return f;
}

// One mode of a struck object: a sine that swells in over `attack` and then dies away
// exponentially with time constant `tau`, the way a resonance does.
function mode(ac, out, t, freq, peak, tau, attack) {
  if (freq > 11000 || peak <= 0) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.setTargetAtTime(0, t + attack, tau);
  osc.connect(amp).connect(out);
  osc.start(t);
  osc.stop(t + attack + tau * 8);
}

// A short burst of filtered noise: the contact of a mallet, a fingertip, or paper.
function burst(ac, out, t, { type = 'bandpass', freq, q = 0.8, peak, attack, tau, glideTo }) {
  const src = ac.createBufferSource();
  src.buffer = noiseFor(ac);
  const shape = filter(ac, type, freq, q);
  if (glideTo) shape.frequency.linearRampToValueAtTime(glideTo, t + attack + tau * 3);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.setTargetAtTime(0, t + attack, tau);
  src.connect(shape).connect(amp).connect(out);
  src.start(t, random() * 0.1);
  src.stop(t + attack + tau * 8);
}

// A marimba bar struck with a soft mallet. `ring` scales how long it sounds.
function bar(ac, out, t, freq, level, ring = 1) {
  const f = freq * cents(4);
  const tau = 0.075 * ring * (NOTE.C5 / f) ** 0.5; // higher bars die sooner
  const attack = 0.006;
  mode(ac, out, t, f, 0.5 * level * vary(0.05), tau, attack);
  mode(ac, out, t, f * 3.99, 0.085 * level * vary(0.12), tau * 0.26, attack * 0.6);
  mode(ac, out, t, f * 10.65, 0.018 * level * vary(0.2), tau * 0.09, attack * 0.4);
  burst(ac, out, t, { type: 'lowpass', freq: 1100, peak: 0.07 * level, attack: 0.003, tau: 0.007 });
}

// A small wood block tapped with a fingertip.
function tick(ac, out, t, freq, level, tau = 0.011) {
  const f = freq * cents(9);
  mode(ac, out, t, f, 0.5 * level * vary(0.06), tau, 0.0025);
  mode(ac, out, t, f * 2.777, 0.2 * level * vary(0.12), tau * 0.55, 0.0015);
  mode(ac, out, t, f * 7.378, 0.03 * level * vary(0.2), tau * 0.25, 0.001);
  burst(ac, out, t, { type: 'bandpass', freq: 1500, q: 0.6, peak: 0.07 * level, attack: 0.002, tau: 0.004 });
}

// The instruments the page note can be played on. Which one is used is a preference
// (setPageTone), so they can be compared by ear while turning pages. Each is a struck bar
// or tine, described by its partials [ratio to the fundamental, level, how long it rings
// compared with the fundamental], how soft the strike is, and the register it suits.
export const PAGE_TONES = {
  kalimba: { label: '卡林巴', centre: 700, ring: 0.11, attack: 0.004, thump: 0.05, partials: [[1, 1, 1], [5.9, 0.1, 0.25], [16.3, 0.02, 0.1]] },
  marimba: { label: '马林巴', centre: 740, ring: 0.08, attack: 0.006, thump: 0.07, partials: [[1, 1, 1], [3.99, 0.17, 0.26], [10.65, 0.035, 0.09]] },
  vibes: { label: '颤音琴', centre: 760, ring: 0.17, attack: 0.007, thump: 0.02, partials: [[1, 1, 1], [4, 0.1, 0.4], [10, 0.02, 0.15]] },
  glock: { label: '钟琴', centre: 1500, ring: 0.14, attack: 0.002, thump: 0.01, partials: [[1, 1, 1], [2.76, 0.3, 0.5], [5.4, 0.12, 0.3], [8.93, 0.04, 0.15]] },
  musicbox: { label: '音乐盒', centre: 1300, ring: 0.14, attack: 0.002, thump: 0.015, partials: [[1, 1, 1], [6.27, 0.14, 0.3], [17.55, 0.02, 0.1]] },
};
let pageTone = 'kalimba';

function voice(ac, out, t, tone, freq, level) {
  const f = freq * cents(4);
  const tau = tone.ring * (tone.centre / f) ** 0.5; // higher notes die sooner
  for (const [ratio, gain, life] of tone.partials) mode(ac, out, t, f * ratio, 0.5 * gain * level * vary(0.08), tau * life, tone.attack * (ratio === 1 ? 1 : 0.6));
  if (tone.thump) burst(ac, out, t, { type: 'lowpass', freq: 1200, peak: tone.thump * level, attack: 0.003, tau: 0.006 });
}

// Levels for the sounds that depend on the chosen instrument are not written down by
// hand: when an instrument is chosen each of them is rendered once, offline, and set to
// the loudness of the other forward sounds (and kept clear of clipping).
const AUTO = {};
const auto = (name, arg = '') => AUTO[`${pageTone}:${name}:${arg}`] ?? 1;

// Each page of the wall has its own note, one step above the page before. Like the
// review scale it is built from octaves under a fixed loudness curve, so the pages can go
// on for ever without the notes running out or turning shrill.
function pageNote(ac, out, t, page, level) {
  const tone = PAGE_TONES[pageTone];
  const degree = ((page % 5) + 5) % 5;
  const centre = Math.log2(tone.centre);
  const voices = [];
  for (let octave = -1; octave < 5; octave++) {
    const f = C4 * PENTATONIC[degree] * 2 ** octave;
    const distance = Math.abs(Math.log2(f) - centre) / 1.25;
    if (distance < 1) voices.push([f, 0.5 * (1 + Math.cos(Math.PI * distance))]);
  }
  const total = Math.hypot(...voices.map(v => v[1]));
  for (const [f, weight] of voices) voice(ac, out, t, tone, f, level * auto('page', degree) * weight / total);
}
// A run of notes on the same instrument, around its own register: up for Fresh, down for undo.
function run(ac, out, t, steps, gap, level) {
  const tone = PAGE_TONES[pageTone];
  const base = C4 * 2 ** Math.round(Math.log2(tone.centre / C4));
  steps.forEach((ratio, i) => voice(ac, out, t + i * gap, tone, base * ratio, level * (0.7 + 0.3 * i / (steps.length - 1))));
}

// The quick, hard "shwip" of flicking to the next question. Kept exactly as it was first
// built (a narrow band of noise swept fast), because that crispness suits drilling.
function shwip(ac, out, t, forward, level) {
  const src = ac.createBufferSource();
  src.buffer = noiseFor(ac);
  const band = filter(ac, 'bandpass', forward ? 700 : 2100, 0.9);
  band.frequency.setValueAtTime(forward ? 700 : 2100, t);
  band.frequency.exponentialRampToValueAtTime(forward ? 2100 : 700, t + 0.13);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime((forward ? 0.5 : 0.42) * level, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  src.connect(band).connect(amp).connect(out.dry ?? out); // dry: no room, it should stay hard
  src.start(t);
  src.stop(t + 0.15);
}

// The streak note: always one step higher than the last, forever. Each note is the same
// pitch class sounded in several octaves under a fixed bell-shaped loudness curve (a
// Shepard tone), so the scale keeps climbing without ever getting shrill or repeating.
function climbing(ac, out, t, step, level) {
  const degree = ((step % 5) + 5) % 5;
  const ratio = PENTATONIC[degree];
  level *= STEP_TRIM[degree];
  const centre = Math.log2(660);
  const voices = [];
  for (let octave = 0; octave < 4; octave++) {
    const f = C4 * ratio * 2 ** octave;
    const distance = Math.abs(Math.log2(f) - centre) / 1.35; // 0 at the centre, 1 at the edge
    if (distance < 1) voices.push([f, 0.5 * (1 + Math.cos(Math.PI * distance))]);
  }
  const total = Math.hypot(...voices.map(v => v[1]));
  for (const [f, weight] of voices) bar(ac, out, t, f, level * weight / total, 1);
}

export const recipes = {
  // The wall. Each of these is a deliberate step forward, so each is clearly audible.
  flip: (ac, out, t, _, l) => tick(ac, out, t, 760, l, 0.024),
  flipBack: (ac, out, t, _, l) => tick(ac, out, t, 600, l, 0.026),
  select: (ac, out, t, _, l) => { tick(ac, out, t, 980, l * 0.8, 0.012); tick(ac, out, t + 0.045, 1240, l, 0.012); },
  deselect: (ac, out, t, _, l) => { tick(ac, out, t, 1100, l * 0.8, 0.012); tick(ac, out, t + 0.045, 860, l, 0.012); },
  // Turning a page sounds that page's note: one instrument, one sound. Going forward the
  // notes climb, going back they come down again.
  pageNext: (ac, out, t, page = 1, l) => pageNote(ac, out, t, page, l),
  pagePrev: (ac, out, t, page = 0, l) => pageNote(ac, out, t, page, l),
  // Drilling questions is brisk, so its sound is short, hard and fast.
  questionNext: (ac, out, t, _, l) => shwip(ac, out, t, true, l),
  questionPrev: (ac, out, t, _, l) => shwip(ac, out, t, false, l),
  // Fresh deals a new page: one run up the same instrument. Undo comes back down.
  fresh: (ac, out, t, _, l) => run(ac, out, t, [0.75, 1, 1.25, 1.5, 2], 0.042, l * auto('fresh')),
  undo: (ac, out, t, _, l) => run(ac, out, t, [1.5, 1.25, 1, 0.75], 0.048, l * auto('undo')),
  // Press and hold: a soft knock as the strip opens, a faint tick as the finger crosses an option.
  holdOpen: (ac, out, t, _, l) => { tick(ac, out, t, 430, l, 0.02); tick(ac, out, t + 0.05, 640, l * 0.9, 0.016); },
  holdHover: (ac, out, t, _, l) => tick(ac, out, t, 1300, l, 0.006),
  // Marking a word: one, two or three bars upwards, like the ring, the half and the full pip.
  markForgot: (ac, out, t, _, l) => bar(ac, out, t, NOTE.E5, l, 1),
  markPartial: (ac, out, t, _, l) => { bar(ac, out, t, NOTE.E5, l * 0.85, 0.8); bar(ac, out, t + 0.085, NOTE.A5, l, 1); },
  markClear: (ac, out, t, _, l) => { bar(ac, out, t, NOTE.E5, l * 0.75, 0.7); bar(ac, out, t + 0.075, NOTE.A5, l * 0.85, 0.8); bar(ac, out, t + 0.15, NOTE.E6, l, 1.1); },
  pageDone: (ac, out, t, _, l) => { bar(ac, out, t, NOTE.C5, l * 0.8, 1); bar(ac, out, t + 0.1, NOTE.G5, l * 0.9, 1); bar(ac, out, t + 0.2, NOTE.C6, l * 0.75, 1.5); bar(ac, out, t + 0.2, NOTE.E6, l * 0.75, 1.5); },
  // Review. Played only after the answer was written.
  saved: (ac, out, t, step = 0, l) => climbing(ac, out, t, step, l),
  complete: (ac, out, t, _, l) => {
    [[0, NOTE.C5], [0.1, NOTE.E5], [0.2, NOTE.G5]].forEach(([d, f]) => bar(ac, out, t + d, f, l * 0.8, 1));
    bar(ac, out, t + 0.32, NOTE.C6, l * 0.8, 2); bar(ac, out, t + 0.32, NOTE.E6, l * 0.6, 2); bar(ac, out, t + 0.32, NOTE.C5, l * 0.6, 2);
  },
  // Not this way: softer, and falling.
  again: (ac, out, t, _, l) => bar(ac, out, t, NOTE.A4, l, 0.8),
  edge: (ac, out, t, _, l) => tick(ac, out, t, 440, l, 0.02),
  error: (ac, out, t, _, l) => { bar(ac, out, t, NOTE.A4, l, 0.6); bar(ac, out, t + 0.13, NOTE.F5 / 2, l, 0.8); },
};

// A very short room: a quarter second of decaying, softened noise.
const roomCache = new WeakMap();
function roomFor(ac) {
  let buffer = roomCache.get(ac);
  if (!buffer) {
    const length = Math.floor(ac.sampleRate * 0.26);
    buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    const next = seeded(4242);
    let low = 0;
    let energy = 0;
    for (let i = 0; i < length; i++) {
      const time = i / ac.sampleRate;
      low += ((next() * 2 - 1) - low) * 0.35; // soften the tail
      data[i] = low * Math.exp(-time / 0.05) * (time < 0.004 ? time / 0.004 : 1);
      energy += data[i] * data[i];
    }
    // Unit energy: the room returns as much as it is sent, and `wet` alone sets its level.
    const scale = 1 / Math.sqrt(energy);
    for (let i = 0; i < length; i++) data[i] *= scale;
    roomCache.set(ac, buffer);
  }
  return buffer;
}

// A rough model of a phone loudspeaker: almost nothing below 500 Hz, a presence bump near
// 3 kHz. Used for measurement, and for listening on headphones the way a phone would play it.
function phoneSpeaker(ac, input) {
  return input
    .connect(filter(ac, 'highpass', 560))
    .connect(filter(ac, 'highpass', 380))
    .connect(filter(ac, 'peaking', 3000, 1, 4))
    .connect(filter(ac, 'lowpass', 9000));
}

function bus(ac, speaker) {
  const input = ac.createGain();
  input.gain.value = MASTER;
  const mix = ac.createGain();
  input.connect(mix);
  const room = ac.createConvolver();
  room.normalize = false;
  room.buffer = roomFor(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.2;
  input.connect(room).connect(wet).connect(mix);
  // A second way in that skips the room, for the one sound that is meant to be hard.
  input.dry = ac.createGain();
  input.dry.gain.value = MASTER;
  input.dry.connect(mix);
  const tail = speaker === 'phone' ? phoneSpeaker(ac, mix) : mix;
  tail.connect(filter(ac, 'lowpass', 7000)).connect(ac.destination);
  return input;
}

let live = null;
let soundOn = true;
let hapticsOn = false;
let speaker = 'flat';

export function configureFeedback({ sound = soundOn, haptics = hapticsOn, speaker: nextSpeaker = speaker, pageTone: nextTone = pageTone } = {}) {
  soundOn = sound;
  hapticsOn = haptics;
  if (PAGE_TONES[nextTone] && (nextTone !== pageTone || !calibrated)) { pageTone = nextTone; calibrated = calibrate(nextTone); }
  if (nextSpeaker !== speaker) {
    speaker = nextSpeaker;
    if (live) { live.ac.close().catch(() => {}); live = null; }
  }
}

function liveContext() {
  if (!live) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ac = new AC();
    live = { ac, out: bus(ac, speaker) };
  }
  if (live.ac.state === 'suspended') live.ac.resume();
  return live;
}

// `force` plays even with sound switched off (the audition list); `at` delays in seconds.
export function play(name, arg, { force = false, at = 0 } = {}) {
  if ((!soundOn && !force) || !recipes[name]) return;
  try {
    const ctx = liveContext();
    if (ctx) recipes[name](ctx.ac, ctx.out, ctx.ac.currentTime + 0.005 + at, arg, LEVEL[name]);
  } catch {
    // Sound is never allowed to break an interaction.
  }
}

// Placeholder patterns for the browser prototype only. navigator.vibrate is a one-shot
// motor pulse and feels buzzy on many phones; production should use the platform's
// clear haptic effects through a native plugin, and stay silent where those are missing.
const HAPTICS = { flip: 8, select: 12, hold: 14, mark: [10, 30, 14], fresh: [8, 36, 8], saved: 10, complete: [10, 50, 18], error: [18, 70, 18] };

export function haptic(name) {
  if (!hapticsOn || !navigator.vibrate || !HAPTICS[name]) return;
  try { navigator.vibrate(HAPTICS[name]); } catch { /* ignore */ }
}

// ---- levels for the chosen instrument, and verification ----

let calibrated = null;
async function calibrate(tone) {
  const target = -16.2; // dB: where the other forward sounds sit, through the phone-speaker model
  const jobs = [...[0, 1, 2, 3, 4].map(degree => ['pageNext', degree, `${tone}:page:${degree}`]), ['fresh', undefined, `${tone}:fresh:`], ['undo', undefined, `${tone}:undo:`]];
  for (const [name, arg, key] of jobs) {
    AUTO[key] = 1;
    if (pageTone !== tone) return; // another instrument was chosen meanwhile
    const flat = await renderOffline(name, arg, 'flat', 1);
    const phone = await renderOffline(name, arg, 'phone', 1);
    const gainDb = Math.min(target - phone.loudDb, -3.5 - flat.peakDb, -1.5 - phone.peakDb);
    AUTO[key] = 10 ** (gainDb / 20);
  }
}

async function renderOffline(name, arg, through, level) {
  const rate = 44100;
  const lead = 0.01;
  const ac = new OfflineAudioContext(1, Math.floor(rate * 2), rate);
  const previous = random;
  random = seeded(977);
  try { recipes[name](ac, bus(ac, through), lead, arg, level); } finally { random = previous; }
  const data = (await ac.startRendering()).getChannelData(0);
  let peak = 0;
  let lastAudible = 0;
  let firstLoud = -1;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    if (a > 0.001) lastAudible = i; // -60 dBFS
  }
  // Attack: time from the start until the signal first reaches half its peak.
  for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) >= peak * 0.5) { firstLoud = i; break; }
  // Heard loudness: energy of the loudest 100 ms, about the ear's integration time.
  const win = Math.round(rate * 0.1);
  const hop = Math.round(rate * 0.005);
  let loudest = 0;
  for (let start = 0; start + win <= data.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + win; i++) sum += data[i] * data[i];
    if (sum > loudest) loudest = sum;
  }
  // Brightness: share of the energy above 3 kHz, by a one-pole split.
  let high = 0;
  let all = 0;
  let lp = 0;
  const k = 1 - Math.exp(-2 * Math.PI * 3000 / rate);
  for (let i = 0; i < data.length; i++) {
    lp += (data[i] - lp) * k;
    const hp = data[i] - lp;
    high += hp * hp;
    all += data[i] * data[i];
  }
  return {
    peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1),
    loudDb: +(10 * Math.log10(loudest / win || 1e-12)).toFixed(1),
    durationMs: Math.max(0, Math.round((lastAudible / rate - lead) * 1000)),
    attackMs: +(Math.max(0, firstLoud / rate - lead) * 1000).toFixed(1),
    above3kHz: +(all ? high / all : 0).toFixed(3),
  };
}

// Level, length, attack, brightness and heard loudness of one sound, flat and through
// the phone-speaker model. `level` overrides the calibrated level (used to calibrate).
export async function measureSound(name, arg, level = LEVEL[name]) {
  await calibrated;
  const flat = await renderOffline(name, arg, 'flat', level);
  const phone = await renderOffline(name, arg, 'phone', level);
  return { name, peakDb: flat.peakDb, durationMs: flat.durationMs, attackMs: flat.attackMs, above3kHz: flat.above3kHz, loudDb: flat.loudDb, phoneLoudDb: phone.loudDb, phonePeakDb: phone.peakDb };
}
