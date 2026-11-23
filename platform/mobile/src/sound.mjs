import { Capacitor, registerPlugin } from '@capacitor/core';
import { DEFAULT_PAGE_TONE, PAGE_TONES, SAMPLE_RATE, SOUND_ASSETS, playbackRate, soundAsset } from './sound-catalog.mjs';

export { DEFAULT_PAGE_TONE, PAGE_TONES } from './sound-catalog.mjs';

// The APK and the Web Audio fallback use the same rendered WAVs.
const media = import.meta.env ? import.meta.glob('../android/app/src/main/res/raw/ui_*.wav', {
  eager: true, import: 'default', query: '?url&no-inline',
}) : {};
const urls = new Map(Object.entries(media).map(([file, url]) => [file.split('/').at(-1).slice(3, -4), url]));
const soundIds = SOUND_ASSETS.map(({ id }) => id);
const native = registerPlugin('LowLatencySound');
const nativeStatuses = new Map(soundIds.map(id => [id, 'loading']));
const webStatuses = new Map(soundIds.map(id => [id, 'loading']));
const webBuffers = new Map();
const decodedBuffers = new Map();
const webStreams = new Set();
let nativeAvailable = Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('LowLatencySound');
let nativePreparing = false, webPreloading = false;
let webContext, listeningForVisibility = false;
let soundOn = true, pageTone = DEFAULT_PAGE_TONE, engine = 'native';
let generation = 0;

function visible() { return globalThis.document?.visibilityState !== 'hidden'; }
function preferNative() { return engine === 'native' && nativeAvailable; }

function audioContext() {
  if (webContext?.state !== 'closed' && webContext) return webContext;
  try {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return null;
    webContext = new Context({ latencyHint: 'interactive' });
    return webContext;
  } catch {
    return null;
  }
}

function resumeWeb() {
  const ac = audioContext();
  if (ac && ac.state !== 'running' && globalThis.navigator?.userActivation?.hasBeenActive !== false) {
    void ac.resume().catch(() => {});
  }
  return ac;
}

function loadBuffer(id) {
  const loaded = webBuffers.get(id);
  if (loaded) return loaded;
  const ac = audioContext(), url = urls.get(id);
  if (!ac || !url) {
    webStatuses.set(id, 'failed');
    return Promise.resolve(null);
  }
  webStatuses.set(id, 'loading');
  const request = fetch(url).then(response => {
    if (!response.ok) throw new Error('Audio asset unavailable');
    return response.arrayBuffer();
  }).then(bytes => ac.decodeAudioData(bytes)).then(buffer => {
    decodedBuffers.set(id, buffer);
    webStatuses.set(id, 'ready');
    return buffer;
  }).catch(() => {
    webStatuses.set(id, 'failed');
    return null;
  });
  webBuffers.set(id, request);
  return request;
}

function preloadWeb() {
  if (webPreloading || !audioContext()) return;
  webPreloading = true;
  for (const id of soundIds) void loadBuffer(id);
}

function stopSounds() {
  generation++;
  for (const source of webStreams) {
    try { source.stop(); } catch { /* Already ended. */ }
  }
  webStreams.clear();
  if (nativeAvailable) void native.stopAll().catch(() => {});
}

function playWeb(id, rate, volume, delay = 0) {
  const ac = resumeWeb();
  if (!ac) return;
  const current = generation, when = ac.currentTime + delay, started = performance.now();
  const start = buffer => {
    if (!buffer || !soundOn || !visible() || current !== generation || ac.state === 'closed'
      || performance.now() - started > (100 + delay * 1000)) return;
    try {
      const source = ac.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      let gain;
      if (volume === 1) {
        source.connect(ac.destination);
      } else {
        gain = ac.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(ac.destination);
      }
      source.onended = () => { webStreams.delete(source); source.disconnect(); gain?.disconnect(); };
      webStreams.add(source);
      source.start(Math.max(ac.currentTime, when));
    } catch { /* Audio never blocks a user interaction. */ }
  };
  if (decodedBuffers.has(id)) start(decodedBuffers.get(id));
  else void loadBuffer(id).then(start);
}

function updateNative({ id, status }) {
  if (!nativeStatuses.has(id) || !['loading', 'ready', 'failed'].includes(status)) return;
  nativeStatuses.set(id, status);
  if (status === 'failed' && soundOn) void loadBuffer(id);
}

function prepareNative() {
  if (!nativeAvailable || nativePreparing) return;
  nativePreparing = true;
  void Promise.all([
    native.addListener('soundLoad', updateNative),
    native.addListener('playUnavailable', ({ id, rate, volume, generation: request }) => {
      if (preferNative() && soundOn && visible() && generation === request && nativeStatuses.has(id)) {
        playWeb(id, rate, volume);
      }
    }),
  ]).then(() => native.status()).then(({ sounds }) => {
    if (!sounds || !Object.keys(sounds).length) throw new Error('No native audio assets');
    for (const id of soundIds) updateNative({ id, status: sounds[id] || 'failed' });
  }).catch(() => {
    nativeAvailable = false;
    if (soundOn) preloadWeb();
  });
}

function visibilityChanged() {
  if (!visible()) {
    stopSounds();
  } else if (soundOn && (!preferNative() || webContext)) {
    resumeWeb();
  }
}

export function configureSound({ sound = soundOn, pageTone: tone = pageTone, engine: preferred = engine } = {}) {
  const nextEngine = preferred === 'web' ? 'web' : 'native';
  if ((!sound && soundOn) || engine !== nextEngine) stopSounds();
  soundOn = sound !== false;
  if (Object.hasOwn(PAGE_TONES, tone)) pageTone = tone;
  engine = nextEngine;
  if (!listeningForVisibility && globalThis.document) {
    document.addEventListener('visibilitychange', visibilityChanged);
    listeningForVisibility = true;
  }
  prepareNative();
  if (soundOn && !preferNative()) preloadWeb();
}

export function unlockSound() {
  if (!soundOn || !visible()) return false;
  prepareNative();
  if (preferNative()) {
    if (webContext) resumeWeb();
    return true;
  }
  return !!resumeWeb();
}

export function play(name, arg, { at = 0 } = {}) {
  const id = soundAsset(name, arg, pageTone);
  if (!id || !soundOn || !visible()) return;
  prepareNative();
  const rate = playbackRate(name), volume = 1;
  const delay = Number.isFinite(at) ? Math.max(0, at) : 0;
  if (preferNative() && nativeStatuses.get(id) === 'ready') {
    const current = generation;
    void native.play({ id, rate, volume, delayMs: Math.round(delay * 1000), generation }).catch(() => {
      if (current === generation && soundOn && visible()) playWeb(id, rate, volume, delay);
    });
  } else {
    playWeb(id, rate, volume, delay);
  }
}

export function soundDiagnostics() {
  const isNative = preferNative();
  return {
    engine: isNative ? 'native' : 'web',
    sampleRate: isNative ? SAMPLE_RATE : webContext?.sampleRate ?? null,
    baseLatency: isNative ? null : webContext?.baseLatency ?? null,
    outputLatency: isNative ? null : webContext?.outputLatency ?? null,
    sounds: Object.fromEntries(soundIds.map(id => {
      const status = nativeStatuses.get(id);
      return [id, isNative && status !== 'failed' ? status : webStatuses.get(id)];
    })),
  };
}

export function copySoundDiagnostic(text) {
  if (Capacitor.isPluginAvailable('LowLatencySound')) return native.copyDiagnostic({ text });
  return navigator.clipboard.writeText(text);
}
