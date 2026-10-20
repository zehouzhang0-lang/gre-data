// Build a read-only, self-contained practice bank from this repository's actual
// PDF indexes and records. This never calls the server or writes learning data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Store, keyOf } from '../../server/store.mjs';
import { readLegacyQuestions } from '../../server/legacy-review.mjs';
import { readPracticeSnapshot, questionDetail, repositoryRoot, practiceTypes } from '../preview/practice-data.mjs';
import { requiresTextAnswer, verifyPractice } from './verify-practice.mjs';

export const practiceSourceFiles = {
  text_completion_2000: 'materials/files/张巍GRE填空机经2000题.pdf',
  reading_440: 'materials/files/张巍GRE阅读机经440篇.pdf',
  quant_900: 'materials/files/张巍GRE最新数学机经900题 .pdf',
};
const expectedCounts = { se: 1001, tc: 1001, rc: 893, quant: 847 };
const renderSettings = { version: 1, scale: 2, format: 'webp', quality: 92, quant: 'whole-page' };
const hash = data => createHash('sha256').update(data).digest('hex');
const jsonBytes = data => Buffer.from(JSON.stringify(data));
const exists = filename => fs.access(filename).then(() => true, () => false);

export function regionIdentity(sourceSha, region, settings = renderSettings) {
  // The highlight identifies a question within a shared page, not new pixels.
  const { page, left, top, right, bottom } = region;
  return hash(JSON.stringify([sourceSha, { page, left, top, right, bottom }, settings]));
}

export function validateRegion(region, pageWidth, pageHeight) {
  const finite = ['left', 'top', 'right', 'bottom'].every(field => Number.isFinite(region?.[field]));
  if (!Number.isSafeInteger(region?.page) || region.page < 1 || !finite
    || region.left < 0 || region.top < 0 || region.right <= region.left || region.bottom <= region.top
    || region.right > pageWidth + 0.5 || region.bottom > pageHeight + 0.5) {
    throw new Error(`无效原始 PDF 区域：${JSON.stringify(region)}`);
  }
}

async function atomicWrite(filename, bytes) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  if (await exists(filename) && (await fs.readFile(filename)).equals(bytes)) return;
  const temporary = `${filename}.${process.pid}.tmp`;
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, filename);
}

async function pruneGeneratedAssets(output, assets) {
  const root = path.resolve(output), keep = new Set(assets.map(asset => asset.path));
  for (const directory of ['questions', 'images']) {
    const folder = path.resolve(root, directory);
    if (path.dirname(folder) !== root) throw new Error('清理目录超出题库输出范围。');
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.(json|webp)$/.test(entry.name)) continue;
      const relative = `${directory}/${entry.name}`, filename = path.resolve(folder, entry.name);
      if (path.dirname(filename) !== folder) throw new Error('清理文件超出题库输出范围。');
      if (!keep.has(relative)) await fs.unlink(filename);
    }
  }
}

export async function exportPractice({ root = repositoryRoot, output = path.join(root, 'platform/mobile/public/practice'), log = console.log } = {}) {
  const started = Date.now();
  const [snapshot, events, legacy] = await Promise.all([
    readPracticeSnapshot(root), new Store(root).events(), readLegacyQuestions(new Store(root)),
  ]);
  for (const type of practiceTypes) {
    if (snapshot.catalog[type].questions.length !== expectedCounts[type]) {
      throw new Error(`${type} 题库数量改变：${snapshot.catalog[type].questions.length}；请核对来源后更新预期，不发布残缺题库。`);
    }
  }
  const answerKeys = new Map();
  for (const event of events) {
    if (!['questions_import', 'keys_import'].includes(event.kind)) continue;
    for (const q of event.payload.items) if (q.answer) answerKeys.set(keyOf(q), {
      answer: q.answer, answer_source: q.answer_source || 'user_provided',
      source_ref: q.source_ref || null, answer_format: q.answer_format || null, event_id: event.id,
    });
  }
  const sources = [], sourceById = new Map(), documents = new Map(), pages = new Map();
  const assets = new Map(), catalog = {}, rendered = new Map();
  let newImages = 0, cachedImages = 0;
  await fs.mkdir(output, { recursive: true });
  const recordAsset = async (relative, bytes, metadata = {}) => {
    if (!assets.has(relative)) assets.set(relative, { path: relative, sha256: hash(bytes), bytes: bytes.length, ...metadata });
  };
  const writeJson = async (relative, data) => {
    const bytes = jsonBytes(data);
    await atomicWrite(path.join(output, relative), bytes);
    await recordAsset(relative, bytes);
  };
  try {
    for (const [id, repo_path] of Object.entries(practiceSourceFiles)) {
      const filename = path.join(root, repo_path);
      const [bytes, stat, indexBytes] = await Promise.all([
        fs.readFile(filename), fs.stat(filename),
        fs.readFile(path.join(root, '.gre-platform', `questions-${id}.json`)),
      ]);
      const index = JSON.parse(indexBytes.toString('utf8'));
      if (index.signature !== `6-${stat.size}-${stat.mtimeMs}`) {
        throw new Error(`题目索引与原 PDF 不匹配：${id}；先通过桌面题库重新核对索引。`);
      }
      const document = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
      documents.set(id, document);
      const pdf = await document.promise;
      const source = {
        id, repo_path, sha256: hash(bytes), bytes: bytes.length, pages: pdf.numPages,
        index_signature: index.signature, index_sha256: hash(indexBytes),
      };
      sourceById.set(id, source);
      sources.push(source);
    }
    const pageFor = async (material, pageNumber) => {
      const key = `${material}:${pageNumber}`;
      if (!pages.has(key)) {
        const pdf = await documents.get(material).promise;
        if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new Error(`原 PDF 页码不存在：${key}`);
        pages.set(key, await pdf.getPage(pageNumber));
      }
      return pages.get(key);
    };
    const imageFor = async (q, input) => {
      const source = sourceById.get(q.material);
      if (!source) throw new Error(`未登记题目来源：${q.material}`);
      const page = await pageFor(q.material, input.page);
      const viewport = page.getViewport({ scale: 1 });
      validateRegion(input, viewport.width, viewport.height);
      const region = q.type === 'quant'
        ? { ...input, left: 0, top: 0, right: viewport.width, bottom: viewport.height }
        : input;
      const identity = regionIdentity(source.sha256, region);
      const relative = `images/${identity}.webp`;
      const width = region.right - region.left, height = region.bottom - region.top;
      const pixelWidth = Math.ceil(width * renderSettings.scale), pixelHeight = Math.ceil(height * renderSettings.scale);
      if (!rendered.has(identity)) {
        const filename = path.join(output, relative);
        let bytes;
        if (await exists(filename)) {
          try {
            bytes = await fs.readFile(filename);
            const image = await loadImage(bytes);
            if (image.width !== pixelWidth || image.height !== pixelHeight) bytes = null;
          } catch { bytes = null; }
        }
        if (bytes) cachedImages++;
        else {
          const canvas = createCanvas(pixelWidth, pixelHeight);
          await page.render({
            canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: renderSettings.scale }),
            transform: [1, 0, 0, 1, -region.left * renderSettings.scale, -region.top * renderSettings.scale],
            background: 'rgb(255,255,255)',
          }).promise;
          bytes = await canvas.encode('webp', renderSettings.quality);
          await atomicWrite(filename, bytes);
          page.cleanup();
          newImages++;
        }
        await recordAsset(relative, bytes, {
          media_type: 'image/webp', width: pixelWidth, height: pixelHeight,
          source: q.material, source_sha256: source.sha256,
          region: { page: region.page, left: region.left, top: region.top, right: region.right, bottom: region.bottom },
        });
        rendered.set(identity, true);
        if ((newImages + cachedImages) % 40 === 0) log(`原题图像 ${newImages + cachedImages}（本次渲染 ${newImages}，缓存 ${cachedImages}）`);
      }
      return {
        url: `./practice/${relative}`, page: region.page, width, height,
        ...(Number.isFinite(input.focusTop) ? {
          focusTop: Math.max(0, (input.focusTop - region.top) / height * 100),
          focusHeight: Math.max(2, (input.focusBottom - input.focusTop) / height * 100),
        } : {}),
      };
    };
    let count = 0;
    for (const type of practiceTypes) {
      catalog[type] = { recommended: snapshot.catalog[type].recommended, questions: [] };
      for (const meta of snapshot.catalog[type].questions) {
        const q = snapshot.questions.get(meta.key), source = sourceById.get(q.material);
        if (!source || !/^[a-f0-9]{64}$/.test(q.content_id)) throw new Error(`原题身份不完整：${meta.key}`);
        const detail = questionDetail(snapshot, meta.key);
        delete detail.history;
        detail.material = q.material;
        detail.unit = q.unit;
        detail.question = q.question;
        detail.content_id = q.content_id;
        if (requiresTextAnswer(detail)) detail.answerInput = 'text';
        detail.answerKey = answerKeys.get(meta.key) || null;
        detail.provenance = {
          material: q.material, source_sha256: source.sha256,
          pdf_pages: [...new Set([...(q.regions || []), ...(q.passageRegions || [])].map(r => r.page))],
          regions: q.regions || [], passage_regions: q.passageRegions || [],
        };
        if (!detail.native) {
          detail.images = [];
          detail.passageImages = [];
          for (const region of q.regions || []) detail.images.push(await imageFor(q, region));
          for (const region of q.passageRegions || []) detail.passageImages.push(await imageFor(q, region));
        }
        if (!detail.prompt && !detail.images.length) throw new Error(`题干缺失：${meta.key}`);
        if (type === 'rc' && !detail.paragraphs.length && !detail.passageImages.length) throw new Error(`阅读原文缺失：${meta.key}`);
        const relative = `questions/${hash(jsonBytes(detail))}.json`;
        await writeJson(relative, detail);
        catalog[type].questions.push({ ...meta, content_id: q.content_id, detail: relative });
        count++;
      }
      log(`${type}: ${catalog[type].questions.length} 题已导出`);
    }
    // Preserve whole event payloads, including batch identity. Legacy source
    // references remain references, never synthetic platform attempts.
    await writeJson('history.json', { events: events.filter(e => ['attempt', 'attempts_import'].includes(e.kind)), legacy });
    const assetList = [...assets.values()].sort((a, b) => a.path.localeCompare(b.path));
    const revision = hash(jsonBytes({ sources, catalog, assets: assetList, renderSettings }));
    const manifest = {
      format: 'gre-practice-bank', version: 1, revision, created_at: new Date().toISOString(),
      catalog, history: 'history.json', sources, assets: assetList, render_settings: renderSettings,
    };
    // The manifest becomes publishable only after every reference has passed.
    await verifyPractice(output, { manifest, expectedCounts, decodeImages: true });
    await atomicWrite(path.join(output, 'manifest.json'), jsonBytes(manifest));
    // Only obsolete, content-addressed generated files are removed, after the
    // replacement is complete; unknown local files are never deleted.
    await pruneGeneratedAssets(output, assetList);
    const result = {
      questions: count, images: rendered.size, newImages, cachedImages,
      assets: assetList.length, bytes: assetList.reduce((sum, asset) => sum + asset.bytes, jsonBytes(manifest).length),
      revision, seconds: Math.round((Date.now() - started) / 1000), output,
    };
    log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    for (const document of documents.values()) await document.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportPractice().catch(error => { console.error(error); process.exitCode = 1; });
}
