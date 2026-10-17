import test from 'node:test';
import assert from 'node:assert/strict';
import { createPronunciationPlayer, localAudioPath } from '../src/pronunciation.mjs';
const primary = 'pronunciation-audio/'+'a'.repeat(24)+'.mp3';
const fallback = 'pronunciation-audio/'+'b'.repeat(24)+'.mp3';
function fixture(outcomes=[], timeoutMs=50) {
  const audios=[], states=[], spoken=[];
  const player=createPronunciationPlayer({ timeoutMs, onState:value=>states.push(value), stopSpeech:()=>{}, speak:async(...args)=>{spoken.push(args);}, createAudio:path=>{
    const outcome=outcomes[audios.length];
    const audio={path,paused:false,play(){
      if(outcome==='throw') throw Error('missing');
      queueMicrotask(()=>{audio.onplaying?.(); if(outcome==='error') audio.onerror?.(); else if(outcome!=='wait') audio.onended?.();});
      return Promise.resolve();
    },pause(){this.paused=true;},removeAttribute(){},load(){}};
    audios.push(audio);return audio;
  }});
  return {player,audios,states,spoken};
}
test('offline recording completes with no TTS call',async()=>{
  const f=fixture(); await f.player.play('belie','us',{audio:primary,fallback});
  assert.equal(f.audios.length,1); assert.deepEqual(f.spoken,[]); assert.equal(f.states.at(-1).status,'idle'); assert.ok(f.audios[0].paused);
});
test('broken recording falls back to packaged synthetic audio',async()=>{
  const f=fixture(['error']); await f.player.play('belie','gb',{audio:primary,fallback,kind:'human'});
  assert.equal(f.audios[1].path,'./'+fallback); assert.deepEqual(f.spoken,[]);
  assert.equal(f.states.filter(s=>s.status==='playing').at(-1).kind,'synthetic');
});
test('missing assets and synchronous play errors use requested system accent',async()=>{
  const f=fixture(['throw','error']);await f.player.play('unknown','gb',{audio:primary,fallback});
  assert.deepEqual(f.spoken,[['unknown','gb']]);
});
test('closing while loading cancels instead of starting fallback',async()=>{
  const f=fixture(['wait']);const playing=f.player.play('abate','us',{audio:primary,fallback}); f.player.stop();await playing;
  assert.equal(f.audios.length,1);assert.deepEqual(f.spoken,[]);assert.equal(f.states.at(-1).status,'idle');
});
test('switching accent stops prior audio and ignores its late callbacks',async()=>{
  const f=fixture(['wait']);const first=f.player.play('abate','gb',{audio:primary});const late=f.audios[0].onended;
  await f.player.play('abate','us',{audio:fallback});late?.();await first;
  assert.ok(f.audios[0].paused);assert.equal(f.states.at(-1).status,'idle');assert.deepEqual(f.spoken,[]);
});
test('stalled audio has a bounded timeout and synthetic fallback',async()=>{
  const f=fixture(['wait'],5);await f.player.play('abate','us',{audio:primary,fallback}); assert.equal(f.audios.length,2);assert.deepEqual(f.spoken,[]);
});
test('untrusted resource paths cannot trigger arbitrary online requests',()=>{
  for(const path of ['https://example.org/word.mp3','../file.mp3','pronunciation-audio/../../secret','javascript:alert(1)']) assert.equal(localAudioPath(path),null);
  assert.equal(localAudioPath(primary),'./'+primary);
});
