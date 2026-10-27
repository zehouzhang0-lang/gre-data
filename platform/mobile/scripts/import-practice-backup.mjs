// Explicit, lossless phone -> desktop fact ingestion. Never calls Store.append,
// generates replacement IDs/times, marks drafts complete, or runs Git commands.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readPracticeBackup } from '../src/practice/packages.mjs';
import { canonical, validateDocument, emptyDocument, mergeRecords } from '../src/practice/model.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const json = async filename => JSON.parse(await fs.readFile(filename, 'utf8'));
async function files(folder) {
  try { return (await fs.readdir(folder)).filter(name => name.endsWith('.json')).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function readFacts(root, kind) {
  const folder = path.join(root, 'platform/mobile-imports', kind);
  return Promise.all((await files(folder)).map(name => json(path.join(folder, name))));
}

// Also used by the APK exporter: imported mobile events must always travel with
// their original draft revisions, even when no new backup was passed to export.
export async function readImportedPracticeReferences(root) {
  const [drafts, legacy, ai_reviews] = await Promise.all([readFacts(root, 'drafts'), readFacts(root, 'legacy'), readFacts(root, 'ai-reviews')]);
  return { drafts, legacy, ai_reviews };
}

function validateDesktopFacts(document) {
  for (const event of document.events) {
    if (event.schema_version !== 1 || !uuid(event.id)) throw Error(`事件 ID/版本无效：${event.id}`);
    const items = event.kind === 'attempt' ? [event.payload] : event.payload.items;
    if (!items.length || items.length > 200) throw Error(`作答条数无效：${event.id}`);
    for (const item of items) {
      if (!item.answer.trim() || item.material.length > 200 || item.unit.length > 200 || String(item.question).length > 100
        || item.note != null && (typeof item.note !== 'string' || item.note.length > 10000)
        || item.duration_seconds != null && (!Number.isFinite(item.duration_seconds) || item.duration_seconds < 0 || item.duration_seconds > 86400)) throw Error(`作答字段无效：${event.id}`);
    }
  }
}

async function exclusiveJson(root, filename, data) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const staging = path.join(root, '.gre-platform/import-staging');
  await fs.mkdir(staging, { recursive: true });
  const temporary = path.join(staging, `${randomUUID()}.json`);
  const handle = await fs.open(temporary, 'wx');
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
  try {
    // Hard-link publication is atomic and refuses an existing destination,
    // unlike rename-on-Windows. A crash leaves only an ignored staging file.
    try { await fs.link(temporary, filename); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (canonical(await json(filename)) !== canonical(data)) throw Error(`同路径不同内容，保留双方：${filename}`);
    }
  } finally {
    await fs.unlink(temporary);
  }
}

export async function importPracticeBackup({ root, backupPath, dryRun = false }) {
  root = path.resolve(root);
  const bytes = await fs.readFile(backupPath), rawHash = hash(bytes);
  const incoming = await readPracticeBackup(bytes.toString('utf8'));
  validateDesktopFacts(incoming);
  const payloadHash = hash(canonical(incoming));
  const local = path.join(root, '.gre-platform'), lockPath = path.join(local, 'practice-import.lock');
  let lock;
  if (!dryRun) {
    await fs.mkdir(local, { recursive: true });
    try { lock = await fs.open(lockPath, 'wx'); await lock.writeFile(JSON.stringify({ pid: process.pid, backup_sha256: rawHash })); }
    catch (error) { if (error.code === 'EEXIST') throw Error('另一刷题导入正在运行，或上次中断留下锁；请先检查 .gre-platform/practice-import.lock。'); throw error; }
  }
  try {
    const eventsDir = path.join(root, 'platform/events');
    const [allEvents, references] = await Promise.all([
      Promise.all((await files(eventsDir)).map(name => json(path.join(eventsDir, name)))),
      readImportedPracticeReferences(root),
    ]);
    const existingById = new Map(allEvents.map(event => [event.id, event]));
    const collisions = incoming.events.filter(event => existingById.has(event.id) && canonical(existingById.get(event.id)) !== canonical(event));
    if (collisions.length) throw Error(`同 ID 不同内容，未导入：${collisions.map(event => event.id).join(', ')}`);
    const current = { ...emptyDocument('desktop-import'), events: allEvents.filter(event => ['attempt', 'attempts_import'].includes(event.kind)), ...references };
    const plan = mergeRecords(current, incoming);
    if (plan.preview.conflicts.length) throw Error(`原始事实冲突，未导入：${plan.preview.conflicts.map(item => `${item.kind}:${item.id}`).join(', ')}`);
    // Validate the union, including submissions imported on an earlier run.
    validateDocument(plan.next, { maxBytes: Infinity });
    validateDesktopFacts(plan.next);
    const manifest = {
      format: 'gre-practice-import', version: 1, payload_sha256: payloadHash,
      dataset_id: incoming.dataset_id, seed_revisions: incoming.seed_revisions,
      event_ids: incoming.events.map(event => event.id),
      drafts: incoming.drafts.map(draft => ({ id: draft.id, path: `drafts/${hash(draft.id)}.json` })),
      legacy: incoming.legacy.map(record => `legacy/${hash(canonical(record))}.json`),
      ai_reviews: (incoming.ai_reviews || []).map(review => ({ id: review.id, path: `ai-reviews/${review.id}.json` })),
      draft_heads: incoming.draft_heads || {},
    };
    const report = { dryRun, backup_sha256: rawHash, payload_sha256: payloadHash, newEvents: plan.preview.newEvents,
      newAttempts: incoming.events.filter(event => !existingById.has(event.id)).reduce((sum, event) => sum + (event.kind === 'attempt' ? 1 : event.payload.items.length), 0),
      duplicateEvents: incoming.events.length - plan.preview.newEvents, newDrafts: plan.preview.newDrafts, newLegacy: plan.preview.newLegacy, newAiReviews: plan.preview.newAiReviews,
      conflicts: [], manifest: `platform/mobile-imports/imports/${payloadHash}.json`, gitSynced: false };
    if (dryRun) return report;
    // References first: interruption can leave unreferenced facts but never a
    // committed submission without its draft. Retry safely completes the set.
    const archive = path.join(local, 'mobile-backups', `${rawHash}.json`);
    await fs.mkdir(path.dirname(archive), { recursive: true });
    try { await fs.writeFile(archive, bytes, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || !(await fs.readFile(archive)).equals(bytes)) throw error; }
    for (const draft of incoming.drafts) await exclusiveJson(root, path.join(root, 'platform/mobile-imports/drafts', `${hash(draft.id)}.json`), draft);
    for (const record of incoming.legacy) await exclusiveJson(root, path.join(root, 'platform/mobile-imports/legacy', `${hash(canonical(record))}.json`), record);
    for (const event of incoming.events) if (!existingById.has(event.id)) await exclusiveJson(root, path.join(eventsDir, `${event.id}.json`), event);
    for (const review of incoming.ai_reviews || []) await exclusiveJson(root, path.join(root, 'platform/mobile-imports/ai-reviews', `${review.id}.json`), review);
    await exclusiveJson(root, path.join(root, report.manifest), manifest);
    return report;
  } finally { if (lock) { await lock.close(); await fs.unlink(lockPath); } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), readArg = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--help')) console.log('node platform/mobile/scripts/import-practice-backup.mjs --backup <JSON> [--root <GRE仓库>] [--dry-run]\n校验后保留原ID导入；不执行Git同步。');
  else {
    const backupPath = readArg('--backup'), root = readArg('--root') || fileURLToPath(new URL('../../../', import.meta.url));
    if (!backupPath) { console.error('请提供 --backup <刷题备份JSON>'); process.exitCode = 1; }
    else try { console.log(JSON.stringify(await importPracticeBackup({ root, backupPath, dryRun: args.includes('--dry-run') }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
