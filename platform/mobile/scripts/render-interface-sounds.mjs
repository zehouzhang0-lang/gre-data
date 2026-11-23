import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SAMPLE_RATE, SOUND_ASSETS } from '../src/sound-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const argumentsList = process.argv.slice(2);
function flag(key) {
  const index = argumentsList.indexOf(key);
  if (index === -1) return undefined;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
  return value;
}
const output = path.resolve(flag('--out') || path.join(root, 'android/app/src/main/res/raw'));
const executable = flag('--chrome') || process.env.CHROME_PATH;
const sourceFiles = ['sound-catalog.mjs', 'practice/sound-recipes.mjs', 'sound-recipes.mjs'];
// These local synthesis modules have no external browser dependencies. Install
// them into a blank page so the renderer reads neither app content nor data.
const source = (await Promise.all(sourceFiles.map(file => fs.readFile(path.join(root, 'src', file), 'utf8'))))
  .map(code => code.replace(/^import .+\r?\n/gm, '').replace(/^export /gm, '')).join('\n');

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // signed integer PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function renderClip(spec) {
  const samples = await window.renderInterfaceSound(spec.name, spec.arg, spec.tone, spec.seed);
  const pcm = Int16Array.from(samples, sample => Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)));
  const start = pcm.findIndex(value => value !== 0), end = pcm.findLastIndex(value => value !== 0);
  if (start < 0 || end <= start) throw new Error(`Empty sound ${spec.id}`);
  const bytes = new Uint8Array((end - start + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let offset = 0; offset <= end - start; offset++) view.setInt16(offset * 2, pcm[start + offset], true);
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return { pcm: btoa(parts.join('')), start, clipped: samples.reduce((n, sample) => n + (Math.abs(sample) > 1 ? 1 : 0), 0) };
}

const browser = await chromium.launch({ headless: true, ...(executable ? { executablePath: executable } : { channel: 'chrome' }) });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: `(() => { ${source}\nwindow.renderInterfaceSound = renderSound; })();` });
  await fs.mkdir(output, { recursive: true });
  const summary = [];
  for (const spec of SOUND_ASSETS) {
    const seed = createHash('sha256').update(spec.id).digest().readUInt32LE() % 2147483646 + 1;
    const { pcm: encoded, start, clipped } = await page.evaluate(renderClip, { ...spec, seed });
    const pcm = Buffer.from(encoded, 'base64'), bytes = wav(pcm);
    await fs.writeFile(path.join(output, `ui_${spec.id}.wav`), bytes);
    summary.push({ id: spec.id, frames: pcm.length / 2, leadingFramesRemoved: start, clipped, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const report = { renderer: `Chrome/${browser.version()}`, sampleRate: SAMPLE_RATE, channels: 1, bits: 16,
    bytes: summary.reduce((total, entry) => total + entry.bytes, 0), assets: summary };
  if (flag('--report')) await fs.writeFile(path.resolve(flag('--report')), JSON.stringify(report, null, 2) + '\n');
  console.log(`Rendered ${summary.length} sounds (${report.bytes} bytes) with ${report.renderer}.`);
} finally {
  await browser.close();
}
