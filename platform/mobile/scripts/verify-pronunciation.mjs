import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { localAudioPath } from '../src/pronunciation.mjs';
import { readPackage } from '../src/data/packages.mjs';
import { projectState } from '../src/data/model.mjs';
const root = new URL('../public/',import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('pronunciation.json',root),'utf8'));
const seed = await readPackage(await fs.readFile(new URL('vocabulary-seed.json',root),'utf8'));
const corrections = JSON.parse(await fs.readFile(new URL('./pronunciation-corrections.json',import.meta.url),'utf8'));
assert.equal(manifest.schema_version,1);
const words = new Set(projectState(seed.data).vocabulary.map(item=>item.word));
for (const word of words) for (const accent of ['gb','us']) {
  const item=manifest.words[word]?.[accent]; assert.ok(item,`${word}: ${accent} missing`);
  assert.ok(localAudioPath(item.audio)); assert.ok(manifest.assets[item.audio]);
  assert.ok(['human','synthetic'].includes(item.kind));
  if(item.ipa) {
    if(corrections[word]) {assert.equal(item.source,corrections[word].source);assert.equal(item.ipa,corrections[word][accent]);}
    else {assert.match(item.source,/^https:\/\/en.wiktionary.org\/wiki\//);assert.equal(item.license,'CC BY-SA 4.0');}
  }
  if(item.kind==='human') {
    assert.ok(localAudioPath(item.fallback)); assert.ok(manifest.assets[item.fallback]);
    assert.ok(item.recording.author); assert.ok(item.recording.license); assert.match(item.recording.source,/^https:\/\/commons.wikimedia.org\//);
  }
}
for(const [name,expected] of Object.entries(manifest.assets)) {
  assert.ok(localAudioPath(name)); const file=await fs.readFile(new URL(name,root));
  assert.equal(file.length,expected.bytes,name);assert.equal(createHash('sha256').update(file).digest('hex'),expected.sha256,name);
}
console.log(JSON.stringify({result:'passed',...manifest.coverage,assets:Object.keys(manifest.assets).length}));
