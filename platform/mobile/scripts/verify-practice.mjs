import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadImage } from '@napi-rs/canvas';
import { practiceHistoryDocument } from '../src/practice/packages.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const types = ['se', 'tc', 'rc', 'quant'];
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
// PDF label extraction can omit table cells or accidentally include labels
// from a diagram. Preserve the source metadata, but never restrict the user
// to an evidently incomplete set of choices.
export function requiresTextAnswer(detail) {
  if (detail.native !== false || ['entry', 'sentence'].includes(detail.mode)) return false;
  const letters = detail.letters || [], joined = letters.join('');
  if (detail.mode === 'single') return joined !== 'ABCDE';
  if (detail.mode === 'comparison') return joined !== 'ABCD';
  if (detail.mode === 'pair') return joined !== 'ABCDEF';
  if (detail.mode === 'multiple') return !letters.length || joined !== 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, letters.length);
  if (detail.mode === 'blanks') {
    if (![6, 9].includes(letters.length) || joined !== 'ABCDEFGHI'.slice(0, letters.length)) return true;
    const groups = Array.from({ length: letters.length / 3 }, (_, i) => letters.slice(i * 3, i * 3 + 3));
    return JSON.stringify(detail.groups) !== JSON.stringify(groups);
  }
  return false;
}
export function safeAssetPath(relative) {
  if (typeof relative !== 'string' || !relative || relative.startsWith('/') || relative.includes('\\')
    || relative.split('/').some(part => ['', '.', '..'].includes(part)) || /[:?#]/.test(relative)) throw new Error(`资源路径无效：${relative}`);
  return relative;
}

export async function verifyPractice(output, { manifest, expectedCounts = { se: 1001, tc: 1001, rc: 893, quant: 847 }, decodeImages = true } = {}) {
  manifest ||= JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'gre-practice-bank' || manifest.version !== 1 || !isHash(manifest.revision)
    || !Number.isFinite(Date.parse(manifest.created_at))) throw new Error('题库版本信息不完整。');
  if (!Array.isArray(manifest.assets) || !Array.isArray(manifest.sources)) throw new Error('题库缺少资源与出处清单。');
  const revision = sha256(Buffer.from(JSON.stringify({
    sources: manifest.sources, catalog: manifest.catalog, assets: manifest.assets, renderSettings: manifest.render_settings,
  })));
  if (revision !== manifest.revision) throw new Error('题库目录校验不符。');
  const sources = new Map(manifest.sources.map(source => [source.id, source]));
  if (sources.size !== manifest.sources.length) throw new Error('题库出处重复。');
  for (const source of sources.values()) {
    if (!isHash(source.sha256) || !Number.isSafeInteger(source.pages) || source.pages < 1
      || !Number.isSafeInteger(source.bytes) || source.bytes < 1 || !source.repo_path) throw new Error('原始 PDF 出处无效。');
  }
  const files = new Map(), assetByPath = new Map();
  let bytes = 0, images = 0;
  for (const asset of manifest.assets) {
    const relative = safeAssetPath(asset.path);
    if (assetByPath.has(relative)) throw new Error(`重复资源：${relative}`);
    if (!isHash(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1) throw new Error(`资源校验信息无效：${relative}`);
    const buffer = await fs.readFile(path.join(output, relative));
    if (buffer.length !== asset.bytes || sha256(buffer) !== asset.sha256) throw new Error(`资源损坏：${relative}`);
    assetByPath.set(relative, asset);
    if (relative.endsWith('.json')) files.set(relative, JSON.parse(buffer.toString('utf8')));
    else if (relative.endsWith('.webp')) {
      const source = sources.get(asset.source);
      if (!source || source.sha256 !== asset.source_sha256 || asset.media_type !== 'image/webp') throw new Error(`图像出处不匹配：${relative}`);
      if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WEBP') throw new Error(`不是 WebP：${relative}`);
      if (decodeImages) {
        const decoded = await loadImage(buffer);
        if (decoded.width !== asset.width || decoded.height !== asset.height || decoded.width < 1 || decoded.height < 1) throw new Error(`图像尺寸不符：${relative}`);
      }
      images++;
    } else throw new Error(`非预期题库资源：${relative}`);
    bytes += buffer.length;
  }
  const references = new Set([safeAssetPath(manifest.history)]), keys = new Set();
  let questions = 0, withAnswers = 0;
  for (const type of types) {
    const bank = manifest.catalog?.[type];
    if (!Array.isArray(bank?.questions) || bank.questions.length !== expectedCounts[type]) throw new Error(`${type} 目录数量不符。`);
    for (const q of bank.questions) {
      const relative = safeAssetPath(q.detail), detail = files.get(relative);
      references.add(relative);
      if (keys.has(q.key) || q.type !== type || !isHash(q.content_id)) throw new Error(`题目目录身份无效：${q.key}`);
      keys.add(q.key);
      if (!detail || detail.key !== q.key || detail.type !== type || detail.content_id !== q.content_id
        || JSON.stringify([q.material, q.unit, String(q.question)]) !== q.key
        || detail.material !== q.material || detail.unit !== q.unit || String(detail.question) !== String(q.question)) throw new Error(`题目文件身份不符：${q.key}`);
      if ('history' in detail) throw new Error(`详情不应固化学习历史：${q.key}`);
      if (requiresTextAnswer(detail) && detail.answerInput !== 'text') throw new Error(`原 PDF 选项提取不完整，必须允许原文作答：${q.key}`);
      if (detail.answerInput !== undefined && detail.answerInput !== 'text') throw new Error(`未知作答输入方式：${q.key}`);
      if (!detail.prompt && !detail.images?.length) throw new Error(`缺题干：${q.key}`);
      if (type === 'rc' && !detail.paragraphs?.length && !detail.passageImages?.length) throw new Error(`缺阅读原文：${q.key}`);
      const source = sources.get(detail.provenance?.material);
      if (!source || source.sha256 !== detail.provenance.source_sha256
        || !detail.provenance.pdf_pages.every(page => Number.isSafeInteger(page) && page >= 1 && page <= source.pages)) throw new Error(`题目出处不符：${q.key}`);
      for (const image of [...detail.images, ...detail.passageImages]) {
        if (!image.url.startsWith('./practice/')) throw new Error(`图像依赖网络：${q.key}`);
        const imagePath = safeAssetPath(image.url.slice('./practice/'.length));
        references.add(imagePath);
        if (!assetByPath.has(imagePath) || !imagePath.endsWith('.webp') || !(image.width > 0 && image.height > 0)) throw new Error(`缺原题图像：${q.key}`);
      }
      if (detail.answerKey) {
        if (typeof detail.answerKey.answer !== 'string' || !detail.answerKey.answer.trim()
          || typeof detail.answerKey.answer_source !== 'string' || !detail.answerKey.event_id) throw new Error(`参考答案缺少来源：${q.key}`);
        withAnswers++;
      }
      questions++;
    }
    if (bank.recommended !== null && !bank.questions.some(q => q.key === bank.recommended)) throw new Error(`${type} 推荐题目不存在。`);
  }
  for (const relative of references) if (!assetByPath.has(relative)) throw new Error(`引用资源不存在：${relative}`);
  for (const relative of assetByPath.keys()) if (!references.has(relative)) throw new Error(`清单存在未使用资源：${relative}`);
  const history = files.get(manifest.history);
  if (!Array.isArray(history?.events) || !Array.isArray(history?.legacy)) throw new Error('历史记录格式不符。');
  const document = practiceHistoryDocument(history);
  const eventIds = new Set();
  let attempts = 0;
  for (const event of history.events) {
    if (!event.id || eventIds.has(event.id) || !['attempt', 'attempts_import'].includes(event.kind)
      || !Number.isFinite(Date.parse(event.recorded_at))) throw new Error('原始作答事件身份无效。');
    eventIds.add(event.id);
    const items = event.kind === 'attempt' ? [event.payload] : event.payload.items;
    if (!Array.isArray(items) || !items.length) throw new Error('作答事件内容为空。');
    for (const item of items) {
      if (!types.includes(item.type) || !item.material || !item.unit || !String(item.question)
        || typeof item.answer !== 'string' || !item.answer.trim()) throw new Error('原始作答字段不完整。');
      attempts++;
    }
  }
  for (const record of history.legacy) if (!record.record || !types.includes(record.type)
    || !Number.isFinite(Date.parse(record.recorded_at)) || 'id' in record) throw new Error('旧训练引用无效或被伪造为新事件。');
  return { questions, images, bytes, withAnswers, events: eventIds.size, attempts, legacy: history.legacy.length, drafts: document.drafts.length, revision: manifest.revision };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = fileURLToPath(new URL('../public/practice/', import.meta.url));
  verifyPractice(output).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
