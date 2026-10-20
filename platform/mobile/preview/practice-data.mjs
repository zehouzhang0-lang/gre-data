import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { Store, keyOf } from '../../server/store.mjs';
import { readLegacyQuestions } from '../../server/legacy-review.mjs';
import { buildPracticeBank } from '../../server/practice-bank.mjs';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const sourceFiles = {
  text_completion_2000: ['填空 2000', '张巍GRE填空机经2000题.pdf'],
  reading_440: ['阅读 440', '张巍GRE阅读机经440篇.pdf'],
  quant_900: ['数学 900', '张巍GRE最新数学机经900题 .pdf'],
};
export const practiceTypes = ['se', 'tc', 'rc', 'quant'];
export function unitLabel(unit) {
  return unit.replace(/^test(\d+)_section(\d+)_(.+)$/, 'Test $1 · Section $2 · $3')
    .replace(/^section(\d+)_(.+)$/, 'Section $1 · $2')
    .replace(/^passage(\d+)$/, 'Passage $1').replace(/^set_p(\d+)$/, '补充套题 · PDF $1 页');
}

// Only read existing source caches and original records; never append events or
// call QuestionBank.load, which can regenerate its indexes.
export async function readPracticeSnapshot(root = repositoryRoot) {
  const store = new Store(root);
  const [caches, events, legacy] = await Promise.all([
    Promise.all(Object.keys(sourceFiles).map(async material => {
      const filename = path.join(root, '.gre-platform', `questions-${material}.json`);
      const cache = JSON.parse(await fs.readFile(filename, 'utf8'));
      if (!Array.isArray(cache.questions)) throw new Error(`题目索引无效：${material}`);
      return cache.questions;
    })),
    store.events(), readLegacyQuestions(store),
  ]);
  const indexed = caches.flat();
  const imported = new Map(), attempts = [];
  for (const event of events) {
    if (event.kind === 'questions_import') for (const q of event.payload.items) imported.set(keyOf(q), q);
    if (event.kind === 'attempt') attempts.push({ ...event.payload, recorded_at: event.recorded_at });
    if (event.kind === 'attempts_import') for (const q of event.payload.items) attempts.push({ ...q, recorded_at: event.recorded_at });
  }
  attempts.reverse();
  attempts.sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
  legacy.sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
  const latest = new Map(), counts = new Map();
  for (const record of attempts) counts.set(keyOf(record), (counts.get(keyOf(record)) || 0) + 1);
  for (const record of [...attempts, ...legacy].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))) {
    const key = keyOf(record);
    if (!latest.has(key)) latest.set(key, {
      recorded_at: record.recorded_at, answer: record.answer ?? null,
      origin: record.record ? 'legacy' : 'platform',
    });
  }
  const questions = new Map(), catalog = {};
  for (const type of practiceTypes) {
    const bank = buildPracticeBank({ indexed, imported: [...imported.values()], attempts, legacy, type });
    const completed = new Set(bank.completed), contentDone = new Set(bank.completedContentIds);
    catalog[type] = {
      recommended: bank.recommended,
      questions: bank.questions.map(q => {
        questions.set(q.key, q);
        return {
          key: q.key, type, material: q.material, unit: q.unit, question: q.question,
          unitLabel: unitLabel(q.unit), materialLabel: sourceFiles[q.material]?.[0] || q.material,
          submitted: completed.has(q.key), sameContentDone: !completed.has(q.key) && contentDone.has(q.content_id),
        };
      }),
    };
  }
  return { questions, latest, counts, catalog, loadedAt: new Date().toISOString() };
}

export function questionDetail(snapshot, key) {
  const q = snapshot.questions.get(key);
  if (!q) return null;
  const native = q.native !== false && q.type !== 'quant' && !!q.prompt;
  const letters = q.letters || (q.options || []).map((_, i) => String.fromCharCode(65 + i));
  const mode = q.mode || (q.type === 'se' ? 'pair' : q.type === 'tc' && letters.length > 5 ? 'blanks' : 'single');
  const images = (regions, kind) => (regions || []).map((region, i) => ({
    url: `/preview-api/image?key=${encodeURIComponent(key)}&kind=${kind}&part=${i}`, page: region.page,
    width: region.right - region.left, height: region.bottom - region.top,
    ...(Number.isFinite(region.focusTop) ? {
      focusTop: Math.max(0, (region.focusTop - region.top) / (region.bottom - region.top) * 100),
      focusHeight: Math.max(2, (region.focusBottom - region.focusTop) / (region.bottom - region.top) * 100),
    } : {}),
  }));
  const history = snapshot.latest.get(key);
  return {
    key, type: q.type, mode, native, letters,
    groups: q.groups || (mode === 'blanks' ? Array.from({ length: letters.length / 3 }, (_, i) => letters.slice(i * 3, i * 3 + 3)) : []),
    prompt: native ? q.prompt : '', options: native ? q.options || [] : [],
    paragraphs: q.paragraphs || [], sentences: q.sentences || [],
    images: native ? [] : images(q.regions, 'question'),
    passageImages: native ? [] : images(q.passageRegions, 'passage'),
    source: `${sourceFiles[q.material]?.[0] || q.material} · ${unitLabel(q.unit)} · 第 ${q.question} 题`,
    history: history ? { ...history, count: snapshot.counts.get(key) || null } : null,
  };
}

export function createPracticeData(root = repositoryRoot) {
  let current, expires = 0, pending, imageQueue = Promise.resolve();
  const documents = new Map(), imageCache = new Map();
  const snapshot = async (refresh = false) => {
    if (refresh || !current || Date.now() > expires) {
      if (!pending) pending = readPracticeSnapshot(root).then(value => {
        current = value; expires = Date.now() + 5000; return value;
      }).finally(() => { pending = null; });
      return pending;
    }
    return current;
  };
  const renderImage = async (key, kind, part) => {
    const data = await snapshot(), q = data.questions.get(key);
    const regions = kind === 'passage' ? q?.passageRegions : q?.regions;
    const region = regions?.[part], source = sourceFiles[q?.material];
    if (!source || !region || !Number.isSafeInteger(part) || part < 0) return null;
    const cacheKey = JSON.stringify([q.material, region]);
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
    // Serialize rendering and keep at most 24 crops; fast navigation must not
    // decode hundreds of pages in parallel.
    const result = imageQueue.then(async () => {
      if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
      if (!documents.has(q.material)) {
        const loading = getDocument({
          data: new Uint8Array(await fs.readFile(path.join(root, 'materials/files', source[1]))),
          useSystemFonts: true, verbosity: 0,
        });
        documents.set(q.material, loading);
      }
      const pdf = await documents.get(q.material).promise, page = await pdf.getPage(region.page), scale = 1.7;
      // Quant keeps the original full page: figures can extend beyond detected
      // text bounds. Do not silently crop away mathematical content.
      const canvas = createCanvas(Math.ceil((region.right - region.left) * scale), Math.ceil((region.bottom - region.top) * scale));
      await page.render({
        canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale }),
        transform: [1, 0, 0, 1, -region.left * scale, -region.top * scale],
      }).promise;
      const buffer = canvas.toBuffer('image/png');
      imageCache.set(cacheKey, buffer);
      if (imageCache.size > 24) imageCache.delete(imageCache.keys().next().value);
      page.cleanup();
      return buffer;
    });
    imageQueue = result.catch(() => {});
    return result;
  };
  return { snapshot, renderImage, async close() {
    await imageQueue;
    for (const document of documents.values()) await document.destroy();
  } };
}

export function practiceDataPlugin() {
  const data = createPracticeData();
  const configure = server => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!url.pathname.startsWith('/preview-api/')) return next();
      const json = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'GET') return json(405, { error: '预览只读，不保存作答。' });
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)
        || (req.headers.origin && req.headers.origin !== `http://${host}`)
        || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: '仅限本机同源预览。' });
      try {
        if (url.pathname === '/preview-api/catalog') {
          const snapshot = await data.snapshot(url.searchParams.get('refresh') === '1');
          return json(200, { catalog: snapshot.catalog, loadedAt: snapshot.loadedAt });
        }
        const key = url.searchParams.get('key');
        if (url.pathname === '/preview-api/question') {
          const q = questionDetail(await data.snapshot(), key);
          return json(q ? 200 : 404, q || { error: '未找到该原题位。' });
        }
        if (url.pathname === '/preview-api/image') {
          const kind = url.searchParams.get('kind'), partText = url.searchParams.get('part');
          if (!['question', 'passage'].includes(kind) || !/^\d+$/.test(partText || '')) return json(400, { error: '无效原题区域。' });
          const image = await data.renderImage(key, kind, Number(partText));
          if (!image) return json(404, { error: '该题缺少可追溯原题区域。' });
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' });
          return res.end(image);
        }
        return json(404, { error: '不存在的预览入口。' });
      } catch (error) {
        console.error('Practice preview:', error.message);
        return json(503, { error: '本地题库或原始记录未能读取，请先检查电脑题库索引。' });
      }
    });
    server.httpServer?.once('close', () => data.close().catch(console.error));
  };
  return { name: 'read-only-practice-preview', configureServer: configure, configurePreviewServer: configure };
}
