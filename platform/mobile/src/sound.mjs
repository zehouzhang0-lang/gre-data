// Candidate C interface sounds, synthesised with Web Audio.
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
//   - a page turn uses the selected struck bar or tine;
//   - everything passes through a very short room, and no two strikes are identical
//     (a few cents of pitch and a little level vary each time).
//
// Rules:
//   - every action the user starts on purpose and that moves them forward has a sound of
//     its own, and they are all about equally loud (see LEVEL, set by measurement);
//   - "not this way" sounds (edge, error, think again) are softer and fall in pitch;
//   - the review confirmation is played once an answer is saved;
//   - sound never blocks or delays an interaction, and failing to play is silent.

const MASTER = 0.9;
const C4 = 261.63;
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]; // C D E G A
const NOTE = { A4: 440, C5: 523.25, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G4: 392 };

// Relative levels calibrated with the prototype's phone-speaker model so
// every forward action lands within about 1.5 dB of the others; the "not this way" group
// sits 5 to 7 dB lower.
const LEVEL = {
  flip: 1, flipBack: 0.95, select: 1, deselect: 1,
  pageNext: 1, pagePrev: 1, fresh: 1, undo: 1, // see INSTRUMENT_GAIN
  holdOpen: 1, holdHover: 1,
  markForgot: 0.6, markPartial: 0.6, markClear: 0.65, pageDone: 0.56,
  saved: 0.7, complete: 0.58, questionNext: 3.2, questionPrev: 2.9,
  again: 0.55, edge: 1, error: 0.78,
};
// The streak scale: small trims so that every step of the climb is equally loud.
const STEP_TRIM = [1.06, 0.87, 0.84, 1.08, 1.16];

const random = Math.random;
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

// These instruments can be compared by ear while turning pages. Each is a struck bar
// or tine, described by its partials [ratio to the fundamental, level, how long it rings
// compared with the fundamental], how soft the strike is, and the register it suits.
export const PAGE_TONES = {
  kalimba: { label: '卡林巴', centre: 700, ring: 0.11, attack: 0.004, thump: 0.05, partials: [[1, 1, 1], [5.9, 0.1, 0.25], [16.3, 0.02, 0.1]] },
  marimba: { label: '马林巴', centre: 740, ring: 0.08, attack: 0.006, thump: 0.07, partials: [[1, 1, 1], [3.99, 0.17, 0.26], [10.65, 0.035, 0.09]] },
  vibes: { label: '颤音琴', centre: 760, ring: 0.17, attack: 0.007, thump: 0.02, partials: [[1, 1, 1], [4, 0.1, 0.4], [10, 0.02, 0.15]] },
  glock: { label: '钟琴', centre: 1500, ring: 0.14, attack: 0.002, thump: 0.01, partials: [[1, 1, 1], [2.76, 0.3, 0.5], [5.4, 0.12, 0.3], [8.93, 0.04, 0.15]] },
  musicbox: { label: '音乐盒', centre: 1300, ring: 0.14, attack: 0.002, thump: 0.015, partials: [[1, 1, 1], [6.27, 0.14, 0.3], [17.55, 0.02, 0.1]] },
};
export const DEFAULT_PAGE_TONE = 'vibes';
let pageTone = DEFAULT_PAGE_TONE;

function voice(ac, out, t, tone, freq, level) {
  const f = freq * cents(4);
  const tau = tone.ring * (tone.centre / f) ** 0.5; // higher notes die sooner
  for (const [ratio, gain, life] of tone.partials) mode(ac, out, t, f * ratio, 0.5 * gain * level * vary(0.08), tau * life, tone.attack * (ratio === 1 ? 1 : 0.6));
  if (tone.thump) burst(ac, out, t, { type: 'lowpass', freq: 1200, peak: tone.thump * level, attack: 0.003, tau: 0.006 });
}

// The prototype's 44.1 kHz offline calibration for each instrument: page degrees 0–4,
// then Fresh and undo. Precomputed so the first turn already uses the final level.
const INSTRUMENT_GAIN = {
  kalimba: [0.53088, 0.44157, 0.42658, 0.53703, 0.57544, 0.31989, 0.43652],
  marimba: [0.55590, 0.50119, 0.46774, 0.57544, 0.59566, 0.35075, 0.47315],
  vibes: [0.44157, 0.39811, 0.38019, 0.46774, 0.48978, 0.30903, 0.30549],
  glock: [0.41687, 0.36308, 0.44157, 0.48978, 0.42658, 0.24266, 0.31989],
  musicbox: [0.36728, 0.35892, 0.44668, 0.47315, 0.41210, 0.30549, 0.30549],
};

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
  for (const [f, weight] of voices) voice(ac, out, t, tone, f, level * INSTRUMENT_GAIN[pageTone][degree] * weight / total);
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

const recipes = {
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
  fresh: (ac, out, t, _, l) => run(ac, out, t, [0.75, 1, 1.25, 1.5, 2], 0.042, l * INSTRUMENT_GAIN[pageTone][5]),
  undo: (ac, out, t, _, l) => run(ac, out, t, [1.5, 1.25, 1, 0.75], 0.048, l * INSTRUMENT_GAIN[pageTone][6]),
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

function makeBus(ac) {
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
  // Question transitions use the same output, bypassing the room.
  input.dry = ac.createGain();
  input.dry.gain.value = MASTER;
  input.dry.connect(mix);
  const output = mix.connect(filter(ac, 'lowpass', 7000));
  output.connect(ac.destination);
  return { input, output };
}

let live = null;
let soundOn = true;

export function configureSound({ sound = soundOn, pageTone: tone = pageTone } = {}) {
  soundOn = sound !== false;
  if (Object.hasOwn(PAGE_TONES, tone)) pageTone = tone;
  if (soundOn || !live?.bus) return;
  const { output } = live.bus;
  // Disconnect scheduled notes and room tails. A later unmute uses a fresh bus.
  live.bus = null;
  output.disconnect();
}

export function unlockSound() {
  if (!soundOn || globalThis.document?.visibilityState === 'hidden') return false;
  if (globalThis.navigator?.userActivation?.hasBeenActive === false) return false;
  try {
    if (!live || live.ac.state === 'closed') {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return false;
      live = { ac: new AudioContext(), bus: null };
    }
    if (live.ac.state !== 'running') Promise.resolve(live.ac.resume()).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function play(name, arg, { at = 0 } = {}) {
  if (!Object.hasOwn(recipes, name) || !unlockSound()) return;
  try {
    const { ac } = live;
    const bus = live.bus ??= makeBus(ac);
    const delay = Number.isFinite(at) ? Math.max(0, at) : 0;
    recipes[name](ac, bus.input, ac.currentTime + 0.005 + delay, arg, LEVEL[name]);
  } catch {
    // Audio availability never blocks the interaction.
  }
}

