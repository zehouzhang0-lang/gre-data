import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { PAGE_TONES, SAMPLE_RATE, SOUND_ASSETS, playbackRate, soundAsset } from '../src/sound-catalog.mjs';
import { practiceRecipes, practiceSoundVariants } from '../src/practice/sound-recipes.mjs';

test('sound IDs map every page tone, streak degree, and practice variant to a single clip', () => {
  const ids = new Set(SOUND_ASSETS.map(({ id }) => id));
  assert.equal(ids.size, SOUND_ASSETS.length);
  for (const tone of Object.keys(PAGE_TONES)) {
    for (let degree = 0; degree < 5; degree++) {
      const id = soundAsset('pageNext', degree, tone);
      assert.ok(ids.has(id));
      assert.equal(id, soundAsset('pagePrev', degree, tone));
      assert.equal(id, soundAsset('pageNext', degree + 5, tone));
    }
  }
  for (const name of Object.keys(practiceRecipes)) {
    for (let degree = 0; degree < (practiceSoundVariants[name] || 1); degree++) {
      assert.ok(ids.has(soundAsset(name, degree)));
    }
  }
  assert.equal(soundAsset('saved', 8), soundAsset('saved', 3));
  assert.equal(soundAsset('unknown-cue'), null);
  assert.equal(playbackRate('select', () => 0), 0.998);
  assert.equal(playbackRate('select', () => 1), 1.002);
  assert.equal(playbackRate('marqueeGrow', () => 0), 1);
  assert.equal(playbackRate('marqueeGrow', () => 1), 1);
});

test('every native and web asset is a short, unpadded 48 kHz mono PCM WAV', async () => {
  const raw = new URL('../android/app/src/main/res/raw/', import.meta.url);
  const expected = SOUND_ASSETS.map(({ id }) => `ui_${id}.wav`).sort();
  assert.deepEqual((await readdir(raw)).filter(name => /^ui_.*\.wav$/.test(name)).sort(), expected);
  for (const file of expected) {
    const buffer = await readFile(new URL(file, raw));
    assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', file);
    assert.equal(buffer.toString('ascii', 8, 16), 'WAVEfmt ', file);
    assert.equal(buffer.readUInt16LE(20), 1, file);
    assert.equal(buffer.readUInt16LE(22), 1, file);
    assert.equal(buffer.readUInt32LE(24), SAMPLE_RATE, file);
    assert.equal(buffer.readUInt16LE(34), 16, file);
    assert.equal(buffer.readUInt32LE(40), buffer.length - 44, file);
    assert.notEqual(buffer.readInt16LE(44), 0, file);
    assert.notEqual(buffer.readInt16LE(buffer.length - 2), 0, file);
    assert.ok(buffer.length - 44 < SAMPLE_RATE * 2 * 3, file);
  }
});
