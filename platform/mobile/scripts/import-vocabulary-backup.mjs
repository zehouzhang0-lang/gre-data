// Explicit phone -> desktop vocabulary fact import. Original IDs, timestamps,
// answers and session snapshots are immutable; no Store.append or Git commands.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readPackage, BACKUP_FORMAT } from '../src/data/packages.mjs';
import { readPracticeBackup } from '../src/practice/packages.mjs';
import { canonical } from '../src/practice/model.mjs';
import { validateData, projectState, VOCAB_EVENT_KINDS } from '../src/data/model.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const eventIdentity = event => canonical({ ...event, recorded_at: new Date(event.recorded_at).toISOString() });
const json = async filename => JSON.parse(await fs.readFile(filename, 'utf8'));
async function files(folder) {
  try { return (await fs.readdir(folder)).filter(name => name.endsWith('.json')).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function readSource(filename) {
  const bytes = await fs.readFile(filename), packet = JSON.parse(bytes.toString('utf8'));
  if (packet.format === 'gre-practice-backup') await readPracticeBackup(bytes.toString('utf8'));
  else if ((await readPackage(bytes.toString('utf8'))).format !== BACKUP_FORMAT) throw Error('归档只接受完整备份，不接受词库种子');
  return { bytes, packet, sha256: hash(bytes), filename: path.basename(filename) };
}
async function archive(root, source) {
  const filename = path.join(root, '.gre-platform/mobile-backups', `${source.sha256}.json`);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try { await fs.writeFile(filename, source.bytes, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST' || !(await fs.readFile(filename)).equals(source.bytes)) throw error; }
}
async function publish(root, filename, value, equal = (a,b) => canonical(a) === canonical(b)) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const staging = path.join(root, '.gre-platform/import-staging');
  await fs.mkdir(staging, { recursive: true });
  const temporary = path.join(staging, `${randomUUID()}.json`), handle = await fs.open(temporary, 'wx');
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
  try {
    try { await fs.link(temporary, filename); }
    catch (error) { if (error.code !== 'EEXIST' || !equal(await json(filename), value)) throw error; }
  } finally { await fs.unlink(temporary); }
}

export async function importVocabularyBackup({ root, backupPath, dryRun = false, archivePaths = [] }) {
  root = path.resolve(root);
  const sources = await Promise.all([backupPath, ...archivePaths].map(readSource)), source = sources[0];
  if (source.packet.format !== BACKUP_FORMAT) throw Error('词汇导入必须使用完整词汇备份');
  const { data } = await readPackage(source.bytes.toString('utf8'));
  const original = source.packet.payload, checked = new Map(data.events.map(event => [event.id,event]));
  // validateData canonicalizes timestamps but must not silently discard a field
  // from an original event. Publish the source object, never its cleaned copy.
  for (const event of original.events) if (eventIdentity(event) !== eventIdentity(checked.get(event.id))) throw Error(`原事件含不兼容字段，未导入：${event.id}`);
  const payloadHash = hash(canonical(original)), local = path.join(root,'.gre-platform'), lockPath = path.join(local,'vocabulary-import.lock');
  let lock;
  if (!dryRun) {
    await fs.mkdir(local, { recursive: true });
    try { lock = await fs.open(lockPath,'wx'); await lock.writeFile(JSON.stringify({pid:process.pid,backup_sha256:source.sha256})); }
    catch (error) { if (error.code === 'EEXIST') throw Error('词汇导入锁已存在，请先检查 .gre-platform/vocabulary-import.lock；未修改学习记录'); throw error; }
  }
  try {
    const eventsDir = path.join(root,'platform/events');
    const existing = await Promise.all((await files(eventsDir)).map(name=>json(path.join(eventsDir,name))));
    const byId = new Map();
    for (const event of existing) {
      if (byId.has(event.id)) throw Error(`桌面事件ID重复，未导入：${event.id}`);
      byId.set(event.id,event);
    }
    const additions = [], conflicts = [], representationOnly = [];
    for (const event of original.events) {
      const old = byId.get(event.id);
      if (!old) additions.push(event);
      else if (eventIdentity(old) !== eventIdentity(event)) conflicts.push(event.id);
      else if (canonical(old) !== canonical(event)) representationOnly.push(event.id);
    }
    if (conflicts.length) throw Error(`同ID不同内容，未导入并保留双方：${conflicts.join(', ')}`);
    // Validate causal references and the full union before publishing any fact.
    // Desktop-only facts remain in place; mobile history is never a replacement.
    const union = [...existing.filter(event=>VOCAB_EVENT_KINDS.has(event.kind)),...additions];
    validateData({...data,events:union});
    const state = projectState(data,new Date(source.packet.created_at));
    const manifest = {
      format:'gre-vocabulary-import',version:1,payload_sha256:payloadHash,
      backup_sha256:source.sha256,source_filename:source.filename,source_created_at:source.packet.created_at,
      dataset_id:original.dataset_id,time_zone:original.time_zone,event_ids:original.events.map(event=>event.id),
      baseline_sha256:hash(canonical(original.baseline)),quickRound:original.quickRound,settings:original.settings,
      session_ids:state.vocabSessions.map(session=>session.session_id),
      archive:`.gre-platform/mobile-backups/${source.sha256}.json`,
    };
    const report = {dryRun,backup_sha256:source.sha256,payload_sha256:payloadHash,newEvents:additions.length,
      duplicateEvents:original.events.length-additions.length,representationOnlyDuplicates:representationOnly.length,
      newEventKinds:Object.fromEntries([...new Set(additions.map(e=>e.kind))].sort().map(kind=>[kind,additions.filter(e=>e.kind===kind).length])),
      source:{dataset_id:data.dataset_id,events:data.events.length,words:state.vocabulary.length,sessions:state.vocabSessions.length,
        reviewTasks:state.reviewTasks.length,reviewRounds:state.reviewRounds.length,customGroups:state.wordGroups.length,
        cardReadingWords:state.cardReadings.length,curationRequests:state.curationRequests.length},
      conflicts:[],manifest:`platform/mobile-imports/vocabulary/${source.sha256}.json`,
      archives:sources.map(s=>({filename:s.filename,sha256:s.sha256,format:s.packet.format})),gitSynced:false};
    if (dryRun) return report;
    for (const saved of sources) await archive(root,saved);
    // Session creation precedes its drills and settlements; retry after an
    // interrupted import fills missing files without replacing earlier facts.
    additions.sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)||a.id.localeCompare(b.id));
    for (const event of additions) await publish(root,path.join(eventsDir,`${event.id}.json`),event,(a,b)=>eventIdentity(a)===eventIdentity(b));
    await publish(root,path.join(root,report.manifest),manifest);
    return report;
  } finally { if (lock) { await lock.close(); await fs.unlink(lockPath); } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = name => { const i=args.indexOf(name); return i<0?undefined:args[i+1]; };
  if (args.includes('--help')) console.log('node import-vocabulary-backup.mjs --backup <完整词汇备份> [--archive <另一个完整备份>] [--root <目录>] [--dry-run]\n按原ID保存词汇事实；不重写手机库，不执行Git。');
  else try {
    if (!arg('--backup')) throw Error('请提供 --backup <完整词汇备份>');
    const archivePaths = args.flatMap((value,index)=>value==='--archive'?[args[index+1]]:[]);
    console.log(JSON.stringify(await importVocabularyBackup({root:arg('--root')||fileURLToPath(new URL('../../../',import.meta.url)),backupPath:arg('--backup'),archivePaths,dryRun:args.includes('--dry-run')}),null,2));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
