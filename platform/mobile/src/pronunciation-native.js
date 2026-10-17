import { Capacitor, registerPlugin } from '@capacitor/core';
const Pronunciation = registerPlugin('Pronunciation');
let webCancel = null;

export function stopSpeech() {
  if (Capacitor.getPlatform() === 'android') void Pronunciation.stop().catch(() => {});
  else { webCancel?.(); webCancel = null; globalThis.speechSynthesis?.cancel(); }
}

export async function speak(word, accent) {
  if (Capacitor.getPlatform() === 'android') return Pronunciation.speak({ word, accent });
  const engine = globalThis.speechSynthesis;
  if (!engine) throw new Error('当前设备没有可用的语音引擎');
  const locale = accent === 'gb' ? 'en-GB' : 'en-US';
  const voices = engine.getVoices().filter(voice => voice.lang.replace('_','-').toLowerCase() === locale.toLowerCase());
  const voice = voices.find(voice => voice.localService) || voices[0];
  if (!voice) throw new Error(`设备尚未安装${accent === 'gb' ? '英式' : '美式'}英语语音`);
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.voice = voice; utterance.lang = locale; utterance.rate = 0.85;
    let settled = false;
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); webCancel = null; error ? reject(error) : resolve(); };
    const timer = setTimeout(() => { finish(new Error('语音服务暂时不可用，请检查网络或系统英语语音')); engine.cancel(); },15000);
    webCancel = () => finish(new Error('cancelled'));
    utterance.onend = () => finish();
    utterance.onerror = () => finish(new Error('语音服务暂时不可用，请检查网络或系统英语语音'));
    engine.speak(utterance);
  });
}
