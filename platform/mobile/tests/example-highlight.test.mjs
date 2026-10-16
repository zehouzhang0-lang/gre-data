import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightExample } from '../src/example-highlight.mjs';
const hits = (text,word,pos) => {
  const parts=highlightExample(text,word,pos);
  assert.equal(parts.map(part=>part.text).join(''),text,'Original quotation is unchanged');
  return parts.filter(part=>part.highlight).map(part=>part.text);
};
test('base and inflected verbs highlight without matching derived words',()=>{
  assert.deepEqual(hits('Belie, belies, belied, belying; belief and unbelievable.','belie','v.'),['Belie','belies','belied','belying']);
  assert.deepEqual(hits('abates abated abating; abatement','abate','v.'),['abates','abated','abating']);
  assert.deepEqual(hits('stopped stopping stops nonstop','stop','v.'),['stopped','stopping','stops']);
  assert.deepEqual(hits('referred referring refers','refer','v.'),['referred','referring','refers']);
});
test('irregular forms and noun plurals are POS aware',()=>{
  assert.deepEqual(hits('went gone going go goes','go','v.'),['went','gone','going','go','goes']);
  assert.deepEqual(hits('analyses analysis analytical','analysis','n.'),['analyses','analysis']);
  assert.deepEqual(hits('studies studied studying study','study','n.'),['studies','study']);
  assert.deepEqual(hits('happier happiest happy unhappily','happy','adj.'),['happier','happiest','happy']);
});
test('word boundaries, punctuation and phrase spacing preserve the source exactly',()=>{
  assert.deepEqual(hits('Ill, still, illness, “ill”.','ill','adj.'),['Ill','ill']);
  assert.deepEqual(hits('They gave  up; she gives up.','give up','v.'),['gave  up','gives up']);
  assert.deepEqual(hits("The children's books.",'child','n.'),['children']);
  assert.deepEqual(hits('C++ and C++17','c++',''),['C++']);
  assert.deepEqual(hits('unchanged','', ''),[]);
});
