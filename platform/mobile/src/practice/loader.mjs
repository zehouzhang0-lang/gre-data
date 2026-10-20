import { PRACTICE_TYPES, questionKey, sha256 } from './model.mjs';

function localPath(path) {
  if (typeof path !== 'string' || !/^(?:questions\/|images\/)?[A-Za-z0-9._/-]+$/.test(path) || path.split('/').includes('..') || path.startsWith('/')) throw Error('安装包题目路径无效');
  return path;
}
export function validateBank(bank) {
  if (!bank || bank.format !== 'gre-practice-bank' || bank.version !== 1 || typeof bank.revision !== 'string' || !bank.catalog) throw Error('安装包题库格式不兼容');
  const keys = new Set();
  for (const type of PRACTICE_TYPES) {
    if (!Array.isArray(bank.catalog[type]?.questions)) throw Error('安装包题型目录缺失');
    for (const item of bank.catalog[type].questions) {
      if (item.type !== type || questionKey(item) !== item.key || keys.has(item.key) || !item.content_id) throw Error('安装包题目定位不一致');
      localPath(item.detail); keys.add(item.key);
    }
  }
  localPath(bank.history);
  return bank;
}
export async function loadPracticeBank(fetcher = fetch) {
  const read = async path => {
    const response = await fetcher(`./practice/${localPath(path)}`);
    if (!response.ok) throw Error('安装包题库读取失败，请保留应用并安装完整更新包');
    return response.text();
  };
  let bank;
  try { bank = validateBank(JSON.parse(await read('manifest.json'))); }
  catch (error) { throw Error(`离线题库未能打开：${error.message}`); }
  const assets = new Map((bank.assets || []).map(asset => [asset.path, asset]));
  async function readJson(path) {
    const raw = await read(path), asset = assets.get(path);
    if (!asset || await sha256(raw) !== asset.sha256 || new TextEncoder().encode(raw).length !== asset.bytes) throw Error('安装包题目校验失败，请安装完整更新包；原作答记录保留');
    return JSON.parse(raw);
  }
  return { bank, history: await readJson(bank.history), loadQuestion: async meta => {
    const detail = await readJson(meta.detail);
    if (detail.key !== meta.key || detail.content_id !== meta.content_id || questionKey(detail) !== meta.key) throw Error('题目来源与目录不一致，已停止作答');
    return detail;
  } };
}
