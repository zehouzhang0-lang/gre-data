// Read-only resources: playback never writes learning events.
let catalogPromise;
export function loadPronunciations() {
  if (!catalogPromise) catalogPromise = fetch('./pronunciation.json').then(response => {
    if (!response.ok) throw new Error('发音资源未载入');
    return response.json();
  }).then(data => {
    if (data.schema_version !== 1 || !data.words) throw new Error('发音资源格式不正确');
    return data.words;
  }).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}

export function localAudioPath(value) {
  return typeof value === 'string' && /^pronunciation-audio\/[a-f0-9]{24}\.mp3$/.test(value) ? `./${value}` : null;
}

export function createPronunciationPlayer({ createAudio, speak, stopSpeech, onState, timeoutMs = 15000 }) {
  let generation = 0, cancelAudio = null;
  function stop() {
    generation++; cancelAudio?.(); cancelAudio = null;
    stopSpeech(); onState({ status:'idle' });
  }
  async function play(word, accent, variant) {
    stop(); const token = generation;
    onState({ status:'loading', accent, kind:variant?.kind || 'synthetic' });
    const paths = [...new Set([variant?.audio, variant?.fallback].map(localAudioPath).filter(Boolean))];
    for (const path of paths) {
      if (token !== generation) return;
      try {
        await new Promise((resolve, reject) => {
          const audio = createAudio(path);
          let timer, settled = false;
          const finish = error => {
            if (settled) return; settled = true;
            clearTimeout(timer); audio.onended = audio.onerror = audio.onplaying = null;
            audio.pause(); audio.removeAttribute?.('src'); audio.load?.(); cancelAudio = null;
            error ? reject(error) : resolve();
          };
          cancelAudio = () => finish(new Error('cancelled'));
          timer = setTimeout(() => finish(new Error('audio timeout')), timeoutMs);
          audio.onended = () => finish(); audio.onerror = () => finish(new Error('audio error'));
          audio.onplaying = () => { if (token === generation) onState({ status:'playing', accent, kind:path === localAudioPath(variant?.audio) ? variant.kind : 'synthetic' }); };
          try { Promise.resolve(audio.play()).catch(finish); } catch (error) { finish(error); }
        });
        if (token === generation) onState({ status:'idle' });
        return;
      } catch { /* Unavailable clips fall back without changing learning data. */ }
    }
    if (token !== generation) return;
    try {
      onState({ status:'playing', accent, kind:'synthetic' }); await speak(word, accent);
      if (token === generation) onState({ status:'idle' });
    } catch (error) {
      if (token === generation) onState({ status:'error', accent, message:error.message || '暂时无法播放此口音' });
    }
  }
  return { play, stop };
}
