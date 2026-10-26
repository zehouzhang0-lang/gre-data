import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Store } from '../../server/store.mjs';
import { legacyWordReviews } from '../../server/spaced-review.mjs';
import { projectRelations } from '../../server/word-relations.mjs';
import { VOCAB_EVENT_KINDS, cleanWord, validateData, projectState } from '../src/data/model.mjs';
import { createPackage, readPackage, BACKUP_FORMAT, SEED_FORMAT } from '../src/data/packages.mjs';
import { updateCatalog, CATALOG_REVISION } from '../src/data/catalog-update.mjs';

const defaultRoot = fileURLToPath(new URL('../../..', import.meta.url));

// Read the *pre-event* baseline separately. Exporting current vocabulary plus
// its historical events would replay the same recalls twice.
export async function exportVocabulary(root = defaultRoot, now = new Date(), { backupPath = null } = {}) {
  const store = new Store(root), baseStore = new Store(root);
  baseStore.events = async () => [];
  const baseJson=baseStore.json.bind(baseStore);
  baseStore.json=(name,fallback)=>name==='vocab/standardized.json'?Promise.resolve({items:[]}):baseJson(name,fallback);
  const [live, baseline, rawEvents, relationSeed, homework, lexicon, difficult, mastered] = await Promise.all([
    store.state(now), baseStore.state(now), store.events(), store.json('vocab/relations.json', { topics: [], groups: [] }),
    store.json('vocab/homework/20260910_2014_all_vocab_review.json', { items: [] }), store.json('vocab/lexicon.json', { items: [] }),
    store.yaml('vocab/difficult.yaml', { items: [] }), store.yaml('vocab/mastered.yaml', { items: [] }),
  ]);
  // Desktop seed patterns are evaluated here, never executed from imported files
  // on the phone. Explicit topic memberships retain the current categorization.
  const suggestions = projectRelations(live.vocabulary, relationSeed, []);
  const known = new Set(live.vocabulary.map(w => w.word));
  const data = validateData({
    schema_version: 1, dataset_id: crypto.randomUUID(), time_zone: live.spacedReview.time_zone,
    baseline: {
      definitions: (await store.json('vocab/standardized.json',{items:[]})).items,
      vocabulary: baseline.vocabulary.map(cleanWord),
      legacyWords: legacyWordReviews({ homework, lexicon, difficult, mastered }).filter(w => known.has(w.word)),
      relations: {
        topics: relationSeed.topics.map(({ id, name }) => ({ id, name, words: suggestions.assignments.filter(a => a.topics.includes(id)).map(a => a.word) })),
        groups: relationSeed.groups,
      },
    },
    events: rawEvents.filter(e => VOCAB_EVENT_KINDS.has(e.kind)), quickRound: null, settings: {},
  });
  const projected = projectState(data, now);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : value;
  function equal(label, a, b) {
    if (JSON.stringify(canonical(a)) !== JSON.stringify(canonical(b))) throw Error(`手机导出校验失败：${label}与桌面不一致；未生成词库包`);
  }
  const words = state => state.vocabulary.map(w => [w.word, w.meaning, w.pos, w.note, !!w.deleted, w.recalls]);
  equal('词条、释义与原始回忆', words(live), words(projected));
  const senses = state => state.vocabulary.map(w => [w.word, w.senses || []]);
  equal('逐义释义与来源例句', senses(live), senses(projected));
  const schedule = state => state.spacedReview.items.filter(i => i.kind === 'word');
  equal('完整单词复习排期', schedule(live), schedule(projected));
  const assignments = state => [...state.relations.assignments].sort((a, b) => a.word.localeCompare(b.word));
  equal('主题归属', assignments(live), assignments(projected));
  const groups = state => state.relations.groups.map(g => [g.id, g.type, g.title, g.note, g.deleted, g.members]);
  equal('关系组', groups(live), groups(projected));
  equal('主题状态', live.relations.topics.map(t => [t.id, t.name, t.deleted]), projected.relations.topics.map(t => [t.id, t.name, t.deleted]));
  equal('学习轮次', live.vocabSessions, projected.vocabSessions);
  let bundled = data, phoneReport = {};
  if (backupPath) {
    const bytes = await fs.readFile(backupPath), packet = await readPackage(bytes.toString('utf8'));
    if (packet.format !== BACKUP_FORMAT) throw Error('个人安装包只接受校验通过的完整手机备份作为学习记录基线');
    // Existing installations still use their own database. This optional base
    // supplies the user's latest history only on a fresh installation.
    bundled = updateCatalog(packet.data, data, CATALOG_REVISION);
    for (const field of ['dataset_id', 'time_zone', 'events', 'quickRound']) equal(`手机${field}`, bundled[field], packet.data[field]);
    equal('手机旧复习基线', bundled.baseline.legacyWords, packet.data.baseline.legacyWords);
    const state = projectState(bundled, now);
    phoneReport = {
      phone_source: path.basename(backupPath), phone_sha256: createHash('sha256').update(bytes).digest('hex'),
      phone_events: bundled.events.length, phone_words_before: projectState(packet.data, now).vocabulary.length,
      bundled_words: state.vocabulary.length, bundled_visible: state.vocabulary.filter(w => !w.deleted).length,
      bundled_groups: state.relations.groups.filter(g => !g.deleted).length,
      catalog_update: bundled.settings.catalogUpdate,
    };
  }
  return { content: await createPackage(bundled, SEED_FORMAT, now), report: {
    words: live.vocabulary.filter(w => !w.deleted).length, allWords: live.vocabulary.length,
    topics: live.relations.topics.filter(t => !t.deleted).length, groups: live.relations.groups.filter(g => !g.deleted).length,
    rawVocabularyEvents: data.events.length, recalls: live.vocabulary.reduce((n, w) => n + w.recalls.length, 0),
    due: live.spacedReview.summary.word.due, sessions: live.vocabSessions.length, parity: 'passed', ...phoneReport,
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const root = path.resolve(argument('--root', defaultRoot)), output = path.resolve(argument('--out', path.join(defaultRoot, 'platform/mobile/public/vocabulary-seed.json')));
  const result = await exportVocabulary(root, new Date(), { backupPath: argument('--backup', null) });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.content + '\n', 'utf8');
  console.log(JSON.stringify({ ...result.report, bytes: Buffer.byteLength(result.content), output }, null, 2));
}
