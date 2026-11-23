const optionPitches = [660, 720, 785, 855, 930, 1015];
const typePitches = [600, 720, 860, 1030];

function pitchOf(notes, step) {
  return notes[Math.min(notes.length - 1, Math.max(0, Math.floor(Number(step) || 0)))];
}

function struckMode(ac, out, at, length, frequency, end, gain, decay) {
  const oscillator = ac.createOscillator(), amp = ac.createGain();
  oscillator.frequency.setValueAtTime(frequency, at);
  if (end !== frequency) oscillator.frequency.exponentialRampToValueAtTime(end, at + length);
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + .0018);
  amp.gain.exponentialRampToValueAtTime(.0001, at + .0018 + 8 * decay);
  oscillator.connect(amp).connect(out);
  oscillator.start(at);
  oscillator.stop(at + .002 + 8 * decay);
}

function wood(ac, out, at, frequency, level, { decay = .012, end = frequency, length = .028 } = {}) {
  for (const [ratio, gain, tail] of [[1, .62, 1], [2.72, .24, .33], [5.22, .13, .12]]) {
    struckMode(ac, out, at, length, frequency * ratio, end * ratio, level * gain, decay * tail);
  }
}

function two(ac, out, t, first, next, level, gap = .036) {
  wood(ac, out, t, first, level * .86);
  wood(ac, out, t + gap, next, level);
}

export const practiceRecipes = {
  optionPick: (ac, out, t, step, level) => wood(ac, out, t, pitchOf(optionPitches, step), level),
  optionDrop: (ac, out, t, step, level) => {
    const frequency = pitchOf(optionPitches, step) * .88;
    wood(ac, out, t, frequency, level, { end: frequency * .78, length: .018 });
  },
  answerReady: (ac, out, t, _, level) => wood(ac, out, t, 1235, level, { decay: .010 }),
  blankNext: (ac, out, t, _, level) => wood(ac, out, t, 660, level, { end: 1040, decay: .008 }),
  submit: (ac, out, t, _, level) => wood(ac, out, t, 520, level, { decay: .020 }),
  answerSaved: (ac, out, t, _, level) => two(ac, out, t, 730, 788, level, .043),
  enter: (ac, out, t, _, level) => two(ac, out, t, 630, 920, level),
  leave: (ac, out, t, _, level) => two(ac, out, t, 870, 580, level),
  typeSwitch: (ac, out, t, step, level) => wood(ac, out, t, pitchOf(typePitches, step), level, { decay: .010 }),
  sheetOpen: (ac, out, t, _, level) => wood(ac, out, t, 560, level, { end: 880, decay: .014 }),
  sheetClose: (ac, out, t, _, level) => wood(ac, out, t, 850, level, { end: 545, decay: .014 }),
  chip: (ac, out, t, _, level) => wood(ac, out, t, 920, level, { decay: .008 }),
  sizeUp: (ac, out, t, _, level) => wood(ac, out, t, 880, level, { end: 1120, decay: .010 }),
  sizeDown: (ac, out, t, _, level) => wood(ac, out, t, 870, level, { end: 680, decay: .010 }),
  tap: (ac, out, t, _, level) => wood(ac, out, t, 785, level, { decay: .010 }),
};

// The same phone-speaker model as the existing cues measures the loudest
// 100 ms against the -16.2 dB reference, with peak headroom for the accent.
export const practiceSoundGains = {
  optionPick: 1.07, optionDrop: 1.14, answerReady: 1.13, blankNext: 1.26, submit: 1, answerSaved: .80,
  enter: .82, leave: .83, typeSwitch: 1.17, sheetOpen: 1.02, sheetClose: .99, chip: 1.29,
  sizeUp: 1.18, sizeDown: 1.15, tap: 1.15,
};

export const practiceSoundVariants = { optionPick: optionPitches.length, optionDrop: optionPitches.length, typeSwitch: typePitches.length };
export const dryPracticeSounds = new Set(Object.keys(practiceRecipes));
