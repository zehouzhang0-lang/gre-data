import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffled } from '../../shared/word-session.mjs';

function legacyHash(value) { let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0; }
function legacyShuffled(values,seed) {
  return [...values].sort((a,b)=>legacyHash(seed+JSON.stringify(a))-legacyHash(seed+JSON.stringify(b)));
}

test('precomputed shuffle preserves existing order, identity and input for rich vocabulary',()=>{
  const values = Array.from({length:173},(_,index)=>({
    word:`word-${index}`, meaning:`释义${index}；候选义`,pos:'n.; v.',
    definitions:[{pos:'n.',senses:[{meaning:`词义${index}`,example:{en:`Example ${index}.`,source_url:`https://example.test/${index}`}}]}],
    recalls:[{self_rating:'partial',recorded_at:'2026-10-16T12:00:00.000Z'}],
  }));
  const original = structuredClone(values);
  for(const seed of ['', 'session-word', '中文seed', 'meaning_1','meaning_2']) {
    const expected=legacyShuffled(values,seed),actual=shuffled(values,seed);
    assert.deepEqual(actual,expected);
    actual.forEach((value,index)=>assert.equal(value,expected[index]));
  }
  assert.deepEqual(values,original);
});

test('equal shuffle keys keep their original relative order',()=>{
  // Distinct objects with identical JSON deliberately produce equal keys.
  const first={word:'same',meaning:'相同'},second={word:'same',meaning:'相同'};
  const values=[first,{word:'other'},second];
  const actual=shuffled(values,'collision');
  assert.deepEqual(actual,legacyShuffled(values,'collision'));
  assert.ok(actual.indexOf(first)<actual.indexOf(second));
  assert.deepEqual(shuffled([],'empty'),[]);
});
