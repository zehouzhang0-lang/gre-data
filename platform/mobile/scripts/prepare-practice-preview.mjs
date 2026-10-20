// Read-only samples for UI review. No answer keys or learning events are copied.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, 'platform/mobile/preview/samples.local.json');
const read = async name => JSON.parse(await fs.readFile(path.join(root, `.gre-platform/questions-${name}.json`), 'utf8')).questions;
const [verbal, reading, quant] = await Promise.all([
  read('text_completion_2000'), read('reading_440'), read('quant_900'),
]);
const clean = q => ({
  key: q.key, type: q.type, mode: q.mode, prompt: q.prompt || '',
  options: q.options || [], letters: q.letters, groups: q.groups,
  paragraphs: q.paragraphs || [],
  source: `${({ text_completion_2000: '填空 2000', reading_440: '阅读 440', quant_900: '数学 900' })[q.material]} · ${q.unit.replace(/^test(\d+)_section(\d+)_easy$/, 'Test $1 / Section $2').replace(/^section(\d+)_easy$/, 'Section $1').replace(/^passage(\d+)$/, 'Passage $1')} · 第 ${q.question} 题`,
});
const samples = {
  se: verbal.filter(q => q.type === 'se' && q.native && q.options?.length === 6).slice(0, 3).map(clean),
  tc: [
    verbal.find(q => q.type === 'tc' && q.native && q.mode === 'single'),
    verbal.find(q => q.native && q.groups?.length === 2),
    verbal.find(q => q.native && q.groups?.length === 3),
  ].filter(Boolean).map(clean),
  rc: reading.filter(q => q.native && q.mode === 'single' && q.paragraphs?.length && q.options?.length).slice(0, 3).map(clean),
  quant: [],
};
// The first comparison questions have compact source regions, including their
// quantity columns. Keep their actual typesetting instead of inventing maths.
const selectedMaths = quant.filter(q => q.mode === 'comparison' && q.regions?.length === 1).slice(0, 3);
const task = getDocument({
  data: new Uint8Array(await fs.readFile(path.join(root, 'materials/files/张巍GRE最新数学机经900题 .pdf'))),
  verbosity: 0,
});
try {
  const pdf = await task.promise;
  for (const q of selectedMaths) {
    const area = q.regions[0], page = await pdf.getPage(area.page), scale = 2;
    const following = quant[quant.indexOf(q) + 1]?.regions?.[0];
    const top = area.focusTop, bottom = Math.min(area.focusBottom + 8,
      following?.page === area.page ? following.focusTop - 4 : area.bottom);
    const canvas = createCanvas(Math.ceil((area.right - area.left) * scale), Math.ceil((bottom - top) * scale));
    await page.render({
      canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale }),
      transform: [1, 0, 0, 1, -area.left * scale, -top * scale],
    }).promise;
    // Trim empty right-hand paper without altering the mathematical content.
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let right = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (pixels[offset + 3] > 100 && pixels[offset] < 180 && pixels[offset + 1] < 180 && pixels[offset + 2] < 180) right = Math.max(right, x);
    }
    const trimmed = createCanvas(Math.min(canvas.width, right + 24), canvas.height);
    trimmed.getContext('2d').drawImage(canvas, 0, 0);
    samples.quant.push({
      ...clean(q), image: `data:image/png;base64,${trimmed.toBuffer('image/png').toString('base64')}`,
      options: ['Quantity A is greater.', 'Quantity B is greater.', 'The two quantities are equal.', 'The relationship cannot be determined from the information given.'],
    });
  }
} finally { await task.destroy(); }
if (Object.values(samples).some(items => items.length < 1)) throw new Error('缺少真实题目样本，不生成替代题。');
await fs.writeFile(output, JSON.stringify(samples));
console.log('Prepared local UI samples:', Object.fromEntries(Object.entries(samples).map(([type, items]) => [type, items.length])));
