import { BACKUP_FORMAT, MAX_BYTES, emptyDocument, validateDocument, sha256 } from './model.mjs';

// Used by both the phone import flow and the offline release builder. Neither
// path may discard mobile snapshots or accept a checksum without validation.
export async function readPracticeBackup(json) {
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_BYTES) throw Error('请选择不超过 20 MB 的刷题备份');
  let packet;
  try { packet = JSON.parse(json); } catch { throw Error('刷题备份不是有效 JSON'); }
  if (packet?.format !== BACKUP_FORMAT || packet.version !== 1 || packet.checksum?.algorithm !== 'SHA-256') throw Error('请选择刷题备份；词库备份使用原来的入口');
  if (packet.checksum.value !== await sha256(packet.payload)) throw Error('刷题备份校验失败，当前记录未改动');
  return validateDocument(packet.payload);
}

export function practiceHistoryDocument(history) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) throw Error('历史记录格式不符。');
  // Older bundles contain only events and legacy. New bundles also retain
  // every draft revision required by the mobile submission snapshots.
  const document = validateDocument({
    ...emptyDocument('bundled-history'), events: history.events, legacy: history.legacy,
    drafts: history.drafts === undefined ? [] : history.drafts,
    draft_heads: history.draft_heads === undefined ? {} : history.draft_heads,
  });
  // Keep the release verifier's history constraints at the preflight boundary,
  // before export can replace any already-published asset.
  for (const event of document.events) {
    const items = event.kind === 'attempt' ? [event.payload] : event.payload.items;
    if (!items.length || items.some(item => !item.answer.trim())) throw Error('原始作答内容为空。');
  }
  if (document.legacy.some(record => 'id' in record)) throw Error('旧训练引用无效或被伪造为新事件。');
  return document;
}
