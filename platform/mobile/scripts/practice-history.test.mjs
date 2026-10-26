import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emptyDocument, validateDocument, questionKey, sha256, BACKUP_FORMAT } from '../src/practice/model.mjs';
import { readPracticeBackup, practiceHistoryDocument } from '../src/practice/packages.mjs';
import { mergePracticeHistory, loadPracticeHistoryBackup } from './practice-history.mjs';
import { exportPractice, parseExportPracticeArgs } from './export-practice.mjs';

function fixture() {
  const old = {id:'desktop-original',kind:'attempt',recorded_at:'2026-10-20T23:00:00+08:00',payload:{material:'fixture',unit:'se',question:'1',type:'se',answer:'AC'}};
  const legacy = {material:'fixture',unit:'tc',question:'1',type:'tc',record:'verbal/submissions/fixture.md',recorded_at:'2026-10-19T12:00:00+08:00'};
  const key = questionKey({material:'fixture',unit:'quant',question:'2'}), activeKey = questionKey({material:'fixture',unit:'quant',question:'3'});
  const draft = {id:'draft-v2',session_id:'submitted-session',key,answer:['17'],redo:false,updated_at:'2026-10-26T15:00:00.000Z'};
  const event = {schema_version:1,id:'mobile-submit',kind:'attempt',recorded_at:'2026-10-26T15:00:01.000Z',payload:{material:'fixture',unit:'quant',question:'2',type:'quant',answer:'17',duration_seconds:null,note:''},
    practice:{draft_session_id:draft.session_id,draft_id:draft.id,bank_revision:'original-bank',content_id:'original-content',question_snapshot:{key,mode:'entry',source:'Isolated fixture'},selected:['17'],answerKey:null,result:null}};
  const backup = validateDocument({...emptyDocument('phone-device'),events:[old,event],legacy:[legacy],drafts:[
    {...draft,id:'draft-v1',answer:['1'],updated_at:'2026-10-26T14:59:00.000Z'},draft,
    {id:'active-draft',session_id:'active-session',key:activeKey,answer:['23'],redo:false,updated_at:'2026-10-26T15:01:00.000Z'},
  ],draft_heads:{[activeKey]:'active-draft'},preferences:{split:70,type:'quant',readingSize:20}});
  return {history:{events:[old],legacy:[legacy]},backup,event};
}

async function packet(payload) {
  return JSON.stringify({format:BACKUP_FORMAT,version:1,created_at:'2026-10-26T15:05:00.000Z',checksum:{algorithm:'SHA-256',value:await sha256(payload)},payload});
}

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'gre-practice-history-'));
  t.after(async()=>{
    const absolute = path.resolve(directory);
    assert.equal(path.dirname(absolute),path.resolve(os.tmpdir()));
    assert.ok(path.basename(absolute).startsWith('gre-practice-history-'));
    await fs.rm(absolute,{recursive:true,force:true});
  });
  return directory;
}

test('build history merges raw phone submissions and every draft version without republishing device preferences or duplicating evidence',async()=>{
  const f = fixture(), original = structuredClone(f);
  const backup = await readPracticeBackup(await packet(f.backup));
  const history = mergePracticeHistory(f.history,backup);
  assert.deepEqual(history.events,f.backup.events);
  assert.deepEqual(history.events.find(e=>e.id==='mobile-submit').practice,f.event.practice);
  assert.deepEqual(history.drafts,f.backup.drafts);
  assert.deepEqual(history.draft_heads,f.backup.draft_heads);
  assert.deepEqual(history.legacy,f.history.legacy);
  assert.deepEqual(Object.keys(history).sort(),['draft_heads','drafts','events','legacy']);
  assert.deepEqual(practiceHistoryDocument(history).preferences,{});
  assert.deepEqual(mergePracticeHistory(history,backup),history);
  assert.deepEqual(f,original);
  history.events[0].payload.answer='independent copy';
  assert.equal(f.backup.events[0].payload.answer,'AC');
  const oldHistory = mergePracticeHistory(f.history);
  assert.deepEqual(oldHistory,{...f.history,drafts:[],draft_heads:{}});
});

test('backup checksum and original draft references use the same strict parser as the phone import flow',async()=>{
  const {backup} = fixture(), sealed = JSON.parse(await packet(backup));
  sealed.payload.events[0].payload.answer='changed';
  await assert.rejects(readPracticeBackup(JSON.stringify(sealed)),/校验失败/);
  await assert.rejects(readPracticeBackup('{broken'),/有效 JSON/);
  const missing = structuredClone(backup); missing.drafts=missing.drafts.filter(d=>d.id!=='draft-v2');
  await assert.rejects(readPracticeBackup(await packet(missing)),/原始草稿/);
  const wrongHead = structuredClone(backup); wrongHead.draft_heads[Object.keys(wrongHead.draft_heads)[0]]='missing';
  await assert.rejects(readPracticeBackup(await packet(wrongHead)),/草稿定位/);
  const invalidPrefs = structuredClone(backup); invalidPrefs.preferences.split=100;
  await assert.rejects(readPracticeBackup(await packet(invalidPrefs)),/分屏比例/);
  const invalidPacket = JSON.parse(await packet(backup)); invalidPacket.format='gre-vocabulary-backup';
  await assert.rejects(readPracticeBackup(JSON.stringify(invalidPacket)),/请选择刷题备份/);
});

test('event conflicts and independent submissions for one draft session stop the build merge',()=>{
  const {history,backup,event} = fixture();
  const changed = structuredClone(backup); changed.events[0].payload.answer='AD';
  assert.throws(()=>mergePracticeHistory(history,changed),/同 ID/);
  const competing = structuredClone(backup); competing.events.find(e=>e.id===event.id).id='other-submit';
  const completeHistory = mergePracticeHistory(history,backup);
  assert.throws(()=>mergePracticeHistory(completeHistory,competing),/同 ID/);
  const conflictingDraft = structuredClone(backup); conflictingDraft.drafts[0].answer=['2'];
  assert.throws(()=>mergePracticeHistory(completeHistory,conflictingDraft),/同 ID/);
});

test('bad backups and history conflicts fail export before touching the published bank or repository events',async t=>{
  const root = await temporary(t), output = path.join(root,'published'), backupPath = path.join(root,'phone backup.json');
  await fs.mkdir(output);
  await fs.writeFile(path.join(output,'manifest.json'),'previous manifest');
  await fs.writeFile(path.join(output,'history.json'),'previous history');
  const {history,backup} = fixture();
  await fs.mkdir(path.join(root,'platform/events'),{recursive:true});
  const eventPath = path.join(root,'platform/events/original.json'), originalEvent = JSON.stringify(history.events[0]);
  await fs.writeFile(eventPath,originalEvent);
  const unchanged = async()=>{
    assert.equal(await fs.readFile(path.join(output,'manifest.json'),'utf8'),'previous manifest');
    assert.equal(await fs.readFile(path.join(output,'history.json'),'utf8'),'previous history');
    assert.deepEqual((await fs.readdir(output)).sort(),['history.json','manifest.json']);
    assert.equal(await fs.readFile(eventPath,'utf8'),originalEvent);
    assert.deepEqual(await fs.readdir(path.join(root,'platform/events')),['original.json']);
  };
  await fs.writeFile(backupPath,'broken backup');
  await assert.rejects(exportPractice({root,output,backupPath,log:()=>{}}),/有效 JSON/);
  await unchanged();
  const damaged = JSON.parse(await packet(backup)); damaged.checksum.value='0'.repeat(64);
  await fs.writeFile(backupPath,JSON.stringify(damaged));
  await assert.rejects(exportPractice({root,output,backupPath,log:()=>{}}),/校验失败/);
  await unchanged();
  const conflict = structuredClone(backup); conflict.events[0].payload.answer='AD';
  await fs.writeFile(backupPath,await packet(conflict));
  await assert.rejects(exportPractice({root,output,backupPath,log:()=>{}}),/同 ID/);
  await unchanged();
  const blank = structuredClone(backup); blank.events[1].payload.answer='';
  await fs.writeFile(backupPath,await packet(blank));
  await assert.rejects(exportPractice({root,output,backupPath,log:()=>{}}),/作答内容为空/);
  await unchanged();
  await fs.writeFile(backupPath,await packet(backup));
  assert.deepEqual(await loadPracticeHistoryBackup(backupPath),backup);
});

test('optional backup CLI keeps caller-supplied paths and rejects missing, duplicate or unknown arguments',()=>{
  assert.deepEqual(parseExportPracticeArgs([]),{});
  assert.deepEqual(parseExportPracticeArgs(['--backup','a folder/phone backup.json']),{backupPath:'a folder/phone backup.json'});
  for (const args of [['--backup'],['--backup',''],['--backup','--wrong'],['--wrong','file'],['--backup','one','--backup','two']]) assert.throws(()=>parseExportPracticeArgs(args),/用法/);
});
