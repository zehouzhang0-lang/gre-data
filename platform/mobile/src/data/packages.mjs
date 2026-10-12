import { MAX_FILE_BYTES, validateData } from './model.mjs';

export const BACKUP_FORMAT = 'gre-vocabulary-backup';
export const SEED_FORMAT = 'gre-vocabulary-seed';
export async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function createPackage(data, format = BACKUP_FORMAT, now = new Date()) {
  if (![BACKUP_FORMAT, SEED_FORMAT].includes(format)) throw Error('不支持的数据包类型');
  const payload = validateData(data);
  const result = JSON.stringify({ format, version: 1, created_at: new Date(now).toISOString(), checksum: { algorithm: 'SHA-256', value: await digest(payload) }, payload });
  if (new TextEncoder().encode(result).length > MAX_FILE_BYTES) throw Error('备份超过 20 MB 文件上限，原数据仍保留');
  return result;
}
export async function readPackage(json) {
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_FILE_BYTES) throw Error('请选择不超过 20 MB 的词库 JSON 文件');
  let packet;
  try { packet = JSON.parse(json); } catch { throw Error('JSON 文件损坏或不是有效词库文件'); }
  if (!packet || ![BACKUP_FORMAT, SEED_FORMAT].includes(packet.format) || packet.version !== 1 || packet.checksum?.algorithm !== 'SHA-256') throw Error('不是兼容的完整备份或手机词库包');
  if (packet.checksum.value !== await digest(packet.payload)) throw Error('文件校验失败，内容可能不完整；当前数据未改动');
  return { format: packet.format, data: validateData(packet.payload) };
}
