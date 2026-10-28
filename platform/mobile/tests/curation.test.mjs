import test from 'node:test';
import assert from 'node:assert/strict';
import { openRepository, emptyData } from '../src/data/repository.mjs';
import { validateData, projectState } from '../src/data/model.mjs';
import { readPackage } from '../src/data/packages.mjs';
import { updateCatalog } from '../src/data/catalog-update.mjs';
import { filterEntries, emptyFilters, normalizeFilters } from '../src/model.mjs';

const now = () => new Date('2026-10-18T00:00:00Z');
function memory() { return { value: null, fail: false, async read() { return this.value; }, async write(value) { if (this.fail) throw Error('disk full'); this.value = value; } }; }
function fixture() {
  const data = emptyData();
  data.baseline.vocabulary = [{ word: 'abate', meaning: '减轻', pos: 'v.' }, { word: 'blank', meaning: '' }, { word: 'hidden', meaning: '', deleted: true }];
  data.baseline.legacyWords = [{ word: 'abate', review_count: 3, last_day: '2026-10-15', records: ['test'] }];
  return validateData(data);
}
async function setup() { const storage = memory(); return { storage, repo: await openRepository({ storage, seed: fixture(), now }) }; }
function learning(state) {
  return Object.fromEntries(['vocabulary', 'relations', 'spacedReview', 'vocabSessions', 'vocabDrills', 'cardReadings', 'quickRound', 'undoId'].map(key => [key, state[key]]));
}

test('curation marks blank and defined words without changing content or learning, and repeat requests are no-ops', async () => {
  const { storage, repo } = await setup();
  await repo.rate(['abate'], 'partial');
  await repo.saveEvent('vocab_session', { session_id: crypto.randomUUID(), words: ['abate'], meaning_passes: 1 });
  await repo.saveEvent('vocab_card_reading', { items: [{ word: 'abate', count: 2, viewed_at: '2026-10-17T23:00:00Z', impression: 'partial' }] });
  const before = await repo.getState();
  assert.deepEqual(await repo.requestCuration([' ABATE ', 'blank']), { added: 2 });
  const after = await repo.getState(), bytes = storage.value;
  assert.deepEqual(learning(after), learning(before));
  assert.deepEqual(after.curationRequests.map(item => item.word), ['abate', 'blank']);
  assert.deepEqual(await repo.requestCuration(['blank', 'abate']), { added: 0 });
  assert.equal(storage.value, bytes);
  assert.deepEqual((await repo.getState()).curationRequests, after.curationRequests);
  const reopened = await openRepository({ storage, seed: emptyData(), now });
  assert.deepEqual(await reopened.getState(), after);
});

test('requests survive backup, restore, word editing and catalog upgrade without being treated as completed', async () => {
  const { repo } = await setup();
  await repo.requestCuration(['blank', 'abate']);
  await repo.saveEvent('vocab_upsert', { word: 'blank', meaning: '新释义' });
  const backup = await repo.backup(), data = (await readPackage(backup)).data;
  const upgraded = updateCatalog(data, fixture(), 'curation-test-revision');
  assert.deepEqual(projectState(upgraded, now()).curationRequests, (await repo.getState()).curationRequests);
  assert.deepEqual(upgraded.events, data.events);
  const target = await setup();
  await target.repo.restore(backup);
  const reopened = await openRepository({ storage: target.storage, now });
  assert.deepEqual((await reopened.getState()).curationRequests, (await repo.getState()).curationRequests);
  assert.deepEqual((await readPackage(await reopened.backup())).data, data);
});

test('failed saves and invalid batches leave disk and state unchanged; concurrent duplicates are deduplicated', async () => {
  const { repo, storage } = await setup();
  for (const words of [[], ['abate', 'unknown'], ['abate', 'hidden'], ['abate', ' ABATE '], [null], new Array(1), ['abate', 4]]) {
    const bytes = storage.value, before = await repo.getState();
    await assert.rejects(repo.requestCuration(words));
    assert.equal(storage.value, bytes);
    assert.deepEqual(await repo.getState(), before);
  }
  const bytes = storage.value, before = await repo.getState();
  storage.fail = true;
  await assert.rejects(repo.requestCuration(['blank']), /disk full/);
  assert.equal(storage.value, bytes);
  assert.deepEqual(await repo.getState(), before);
  storage.fail = false;
  assert.deepEqual(await Promise.all([repo.requestCuration(['blank']), repo.requestCuration(['blank', 'abate'])]), [{ added: 1 }, { added: 1 }]);
  assert.equal((await repo.getState()).curationRequests.length, 2);
});

test('backup validation rejects unknown references and extra fields but retains requests for subsequently hidden words', async () => {
  const { repo } = await setup();
  await repo.requestCuration(['blank']);
  const data = (await readPackage(await repo.backup())).data;
  for (const payload of [{ words: ['unknown'] }, { words: ['hidden'] }, { words: ['blank'], completed: true }]) {
    const damaged = structuredClone(data); damaged.events[0].payload = payload;
    assert.throws(() => validateData(damaged));
  }
  await repo.saveEvent('vocab_delete', { word: 'blank' });
  const hidden = await readPackage(await repo.backup());
  assert.equal(projectState(hidden.data, now()).curationRequests[0].word, 'blank');
  assert.deepEqual(filterEntries(projectState(hidden.data, now()), { ...emptyFilters, scope: 'curation' }), []);
});

test('curation scope is explicit, intersects other filters and remains compatible with unmarked old data', async () => {
  const { repo } = await setup();
  assert.deepEqual((await repo.getState()).curationRequests, []);
  assert.deepEqual(normalizeFilters({ scope: 'curation' }).scope, 'curation');
  await repo.requestCuration(['blank', 'abate']);
  const state = await repo.getState();
  assert.deepEqual(filterEntries(state, { ...emptyFilters, scope: 'curation' }).map(item => item.word), ['abate', 'blank']);
  assert.deepEqual(filterEntries(state, { ...emptyFilters, scope: 'curation', query: 'blank' }).map(item => item.word), ['blank']);
  assert.equal(projectState(fixture(), now()).curationRequests.length, 0);
});

test('only a reviewed matching definition resolves its original requests; later requests and personal edits stay pending', async () => {
 const {repo}=await setup();await repo.requestCuration(['blank']);
 const raw=(await readPackage(await repo.backup())).data;
 const request=raw.events.find(e=>e.kind==='vocab_curation_request');
 const example={en:'A blank page lay on the desk.',zh:'桌上放着一张空白纸。',kind:'coach_original',review_status:'coach_authored',source:{publisher:'GRE AI教练（自拟）',created_at:'2026-10-29'}};
 const definition={word:'blank',input:{pos:'adj.',meaning:'空白的'},senses:[{pos:'adj.',meanings:['空白的'],examples:[example]}],status:'dictionary_checked',sources:[{publisher:'Cambridge Dictionary',url:'https://dictionary.cambridge.org/dictionary/english/blank',checked_at:'2026-10-29'}],curation:{status:'completed',scope:'definition_examples',reviewed_at:'2026-10-29',record:'vocab/curation-resolutions.json',request_ids:[request.id]}};
 const incoming=fixture();incoming.baseline.definitions=[definition];
 const upgraded=updateCatalog(raw,incoming,'explicit-curation');
 assert.deepEqual(upgraded.events,raw.events);
 assert.deepEqual(projectState(upgraded,now()).curationRequests,[]);
 assert.equal(projectState(upgraded,now()).vocabulary.find(w=>w.word==='blank').meaning,'adj.空白的');
 const later=structuredClone(upgraded);later.events.push({...request,id:crypto.randomUUID(),recorded_at:'2026-10-18T01:00:00.000Z'});
 assert.equal(projectState(validateData(later),now()).curationRequests.length,1);
 const edited=structuredClone(upgraded);edited.events.push({schema_version:1,id:crypto.randomUUID(),recorded_at:'2026-10-18T02:00:00.000Z',kind:'vocab_upsert',payload:{word:'blank',meaning:'我的个人解释',pos:''}});
 assert.equal(projectState(validateData(edited),now()).curationRequests.length,1);
 const roundtrip=(await readPackage(await (await import('../src/data/packages.mjs')).createPackage(upgraded))).data;
 assert.deepEqual(roundtrip.baseline.definitions,upgraded.baseline.definitions);
 const damaged=structuredClone(upgraded);damaged.baseline.definitions[0].senses[0].examples=[null];assert.throws(()=>validateData(damaged));
});

test('an established definition on a raw blank capture receives only matching sense examples without a new request',()=>{
 const current=fixture();const base={word:'blank',input:{pos:'',meaning:''},senses:[{pos:'adj.',meanings:['空白的'],examples:[null]}],status:'dictionary_checked',sources:[{publisher:'Cambridge Dictionary',url:'https://dictionary.cambridge.org/dictionary/english/blank',checked_at:'2026-10-13'}]};
 current.baseline.definitions=[base];
 const incoming=fixture();const example={en:'She opened a blank notebook.',zh:'她打开了一本空白笔记本。',kind:'coach_original',review_status:'coach_authored',source:{publisher:'GRE AI教练（自拟）',created_at:'2026-10-29'}};
 incoming.baseline.definitions=[{...base,senses:[{...base.senses[0],examples:[example]}]}];
 const next=updateCatalog(current,incoming,'matching-only');assert.equal(projectState(next,now()).vocabulary.find(w=>w.word==='blank').senses[0].examples[0].kind,'coach_original');assert.deepEqual(next.events,current.events);
 incoming.baseline.definitions[0].senses[0].meanings=['新解释'];const rejected=updateCatalog(current,incoming,'different-sense');assert.deepEqual(rejected.baseline.definitions,validateData(current).baseline.definitions);
 const redirect=fixture();redirect.baseline.definitions=[{word:'blank',input:{pos:'',meaning:''},senses:[],status:'spelling_redirect',note:'测试中的截断词形，仅说明其归属，不更改事件。',sources:[]}];
 const explained=updateCatalog(current,redirect,'redirect');assert.equal(projectState(explained,now()).vocabulary.find(w=>w.word==='blank').definition_status,'spelling_redirect');assert.deepEqual(explained.events,current.events);assert.equal(projectState(explained,now()).vocabulary.find(w=>w.word==='blank').deleted,false);
});
