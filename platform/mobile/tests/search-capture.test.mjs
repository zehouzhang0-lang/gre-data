import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { Store, validate } from '../../server/store.mjs';
import { eventLabels, eventType } from '../../web/src/history-index.mjs';
import { exportVocabulary } from '../scripts/export-vocabulary.mjs';
import { importVocabularyBackup } from '../scripts/import-vocabulary-backup.mjs';
import { updateCatalog } from '../src/data/catalog-update.mjs';
import { cleanPayload, cleanWord, projectState, validateData } from '../src/data/model.mjs';
import { createPackage, digest, readPackage } from '../src/data/packages.mjs';
import { emptyData, openRepository } from '../src/data/repository.mjs';
import { emptyFilters, filterEntries } from '../src/model.mjs';
import { createWallSearch } from '../src/wall-search.mjs';

const now = () => new Date('2026-11-23T00:00:00Z');
const search = { type: 'search' };
const question = { material: 'synthetic', unit: 'unit', question: '1', type: 'tc' };
const payload = (word, source = search) => ({ word, source, context: '' });

async function makeRepo(seed = emptyData()) {
  let value = null;
  const storage = { async read() { return value; }, async write(next) { value = next; } };
  return openRepository({ storage, seed: validateData(seed), now });
}

async function syntheticRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gre-search-capture-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('phone and desktop clean search captures, preserve the old variant, and reject invalid sources', () => {
  const forged = { ...question, type: 'search', extra: true };
  for (const clean of [cleanPayload, validate]) {
    assert.deepEqual(clean('vocab_capture', payload('“Look‑up!”', forged)), payload('look-up'));
    assert.deepEqual(clean('vocab_capture', payload('abate', question)), payload('abate', question));
    assert.throws(() => clean('vocab_capture', payload('abate', { type: 'tc' })));
    assert.throws(() => clean('vocab_capture', payload('abate', { type: 'unknown' })));
    assert.throws(() => clean('vocab_capture', payload('版')));
  }
  assert.deepEqual(cleanWord({ word: 'abate', captures: [{ source: forged, context: '', recorded_at: now().toISOString() }] }).captures,
    [{ source: search, context: '', recorded_at: now().toISOString() }]);
});

test('new search entries stay pending, source filters distinguish both capture kinds, and restoring preserves personal edits', async () => {
  const repo = await makeRepo();
  await repo.saveEvent('vocab_capture', payload('abate'));
  await repo.saveEvent('vocab_capture', payload('brisk', question));
  await repo.saveEvent('vocab_capture', payload('dense'));
  await repo.saveEvent('vocab_capture', payload('dense', question));
  await repo.saveEvent('vocab_capture', payload('dense'));
  const state = await repo.getState();
  const abate = state.vocabulary.find(w => w.word === 'abate');
  assert.equal(abate.definition_source, '手动加入，待补释义');
  assert.equal(abate.meaning, '');
  assert.equal(state.vocabulary.find(w => w.word === 'dense').captures.length, 2);
  for (const filter of [filterEntries, createWallSearch().filterEntries]) {
    const find = sources => filter(state, { ...emptyFilters, sources, scope: 'missing' }).map(entry => entry.word);
    assert.deepEqual(find(['搜索加入']), ['abate', 'dense']);
    assert.deepEqual(find(['题中摘词']), ['brisk', 'dense']);
  }
  await assert.rejects(repo.rate(['abate'], 'remembered'));
  await assert.rejects(repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words: ['abate'], meaning_passes: 1 }));
  await repo.saveEvent('vocab_upsert', { word: 'abate', meaning: '减轻', pos: 'v.', note: '个人备注' });
  await repo.rate(['abate'], 'remembered');
  const before = (await repo.getState()).vocabulary.find(w => w.word === 'abate');
  await repo.saveEvent('vocab_delete', { word: 'abate' });
  await repo.saveEvent('vocab_capture', payload('abate'));
  assert.deepEqual((await repo.getState()).vocabulary.find(w => w.word === 'abate'), before);
});

test('a requested search capture receives its checked meaning through catalog update', async () => {
  const repo = await makeRepo();
  await repo.saveEvent('vocab_capture', payload('abate'));
  await repo.requestCuration(['abate']);
  const original = (await readPackage(await repo.backup())).data;
  const request = original.events.find(e => e.kind === 'vocab_curation_request');
  const incoming = emptyData();
  incoming.baseline.vocabulary = [{ word: 'abate', meaning: '减轻', pos: 'v.' }];
  incoming.baseline.definitions = [{
    word: 'abate', input: { pos: 'v.', meaning: '减轻' },
    senses: [{ pos: 'v.', meanings: ['减轻'], examples: [{
      en: 'The wind began to abate.', zh: '风势开始减弱。', kind: 'coach_original',
      review_status: 'coach_authored', source: { publisher: 'GRE AI教练（自拟）', created_at: '2026-11-23' },
    }] }],
    status: 'dictionary_checked',
    sources: [{ publisher: 'Synthetic Dictionary', url: 'https://example.test/abate', checked_at: '2026-11-23' }],
    curation: { status: 'completed', scope: 'definition_examples', reviewed_at: '2026-11-23', record: 'vocab/curation-resolutions.json', request_ids: [request.id] },
  }];
  const upgraded = updateCatalog(original, validateData(incoming), 'search-capture-test');
  assert.deepEqual(upgraded.events, original.events);
  const result = projectState(upgraded, now());
  assert.equal(result.vocabulary[0].meaning, 'v.减轻');
  assert.equal(result.vocabulary[0].definition_status, 'dictionary_checked');
  assert.deepEqual(result.vocabulary[0].captures[0].source, search);
  assert.equal(result.curationRequests.length, 0);
});

test('legacy question captures and new search captures survive backup, restore, desktop import and export', async t => {
  const root = await syntheticRoot(t);
  const repo = await makeRepo();
  await repo.saveEvent('vocab_capture', payload('brisk', question));
  const legacyPath = path.join(root, 'legacy.json');
  const legacyBackup = await repo.backup();
  await fs.writeFile(legacyPath, legacyBackup);
  assert.deepEqual((await readPackage(legacyBackup)).data.events[0].payload.source, question);
  const legacyRestored = await makeRepo();
  await legacyRestored.restore(legacyBackup);
  assert.equal((await legacyRestored.getState()).vocabulary[0].definition_source, '题中摘词，待补释义');
  assert.equal((await importVocabularyBackup({ root, backupPath: legacyPath, dryRun: true })).newEvents, 1);

  await repo.saveEvent('vocab_capture', payload('abate'));
  const backup = await repo.backup();
  const backupPath = path.join(root, 'search.json');
  await fs.writeFile(backupPath, backup);
  const imported = (await readPackage(backup)).data;
  const restored = await makeRepo();
  await restored.restore(backup);
  assert.deepEqual((await readPackage(await restored.backup())).data, imported);
  assert.deepEqual((await restored.getState()).vocabulary[0].captures[0].source, search);

  const importer = path.resolve(import.meta.dirname, '../scripts/import-vocabulary-backup.mjs');
  const { stdout } = await promisify(execFile)(process.execPath, [importer, '--root', root, '--backup', backupPath, '--dry-run']);
  assert.deepEqual(JSON.parse(stdout).newEventKinds, { vocab_capture: 2 });
  const store = new Store(root);
  assert.deepEqual(await store.events(), []);
  await importVocabularyBackup({ root, backupPath });
  assert.deepEqual(await store.events(), imported.events);
  const desktop = await store.state(now());
  const abate = desktop.vocabulary.find(w => w.word === 'abate');
  assert.equal(abate.definition_source, '手动加入，待补释义');
  assert.deepEqual(abate.captures[0].source, search);
  assert.deepEqual(desktop.events.map(event => eventLabels[eventType(event)]), ['搜索加入', '题中摘词']);
  const exported = await exportVocabulary(root, now());
  assert.equal(exported.report.parity, 'passed');
  assert.deepEqual((await readPackage(exported.content)).data.events, imported.events);
});

test('a forged backup is sanitized on mobile but the strict desktop evidence importer refuses to publish it', async t => {
  const root = await syntheticRoot(t);
  const repo = await makeRepo();
  await repo.saveEvent('vocab_capture', payload('abate'));
  const packet = JSON.parse(await repo.backup());
  packet.payload.events[0].payload.source.material = 'forged';
  packet.checksum.value = await digest(packet.payload);
  const forged = JSON.stringify(packet);
  const backupPath = path.join(root, 'forged.json');
  await fs.writeFile(backupPath, forged);
  assert.deepEqual((await readPackage(forged)).data.events[0].payload.source, search);
  assert.deepEqual(JSON.parse(await createPackage(packet.payload)).payload.events[0].payload.source, search);
  await assert.rejects(importVocabularyBackup({ root, backupPath, dryRun: true }), /原事件含不兼容字段/);
  assert.deepEqual(await new Store(root).events(), []);
});
