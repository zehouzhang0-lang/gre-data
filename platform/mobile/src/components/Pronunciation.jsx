import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Icon } from './Primitives';
import { createPronunciationPlayer } from '../pronunciation.mjs';
import { speak, stopSpeech } from '../pronunciation-native';

export default function Pronunciation({ word, entry, loading }) {
  const [playback, setPlayback] = useState({ status:'idle' });
  const player = useRef(null);
  useEffect(() => {
    const current = createPronunciationPlayer({ createAudio:path => new Audio(path), speak, stopSpeech, onState:setPlayback });
    player.current = current;
    const hide = () => { if (document.hidden) current.stop(); };
    document.addEventListener('visibilitychange', hide);
    const lifecycle = App.addListener('appStateChange', ({ isActive }) => { if (!isActive) current.stop(); });
    return () => { current.stop(); player.current = null; document.removeEventListener('visibilitychange', hide); void lifecycle.then(listener => listener.remove()).catch(() => {}); };
  }, [word]);
  return <div className="word-pronunciation" aria-label="英美发音">
    {['gb','us'].map(accent => {
      const item = entry?.[accent], active = playback.accent === accent && ['loading','playing'].includes(playback.status);
      const synthetic = (active ? playback.kind : item?.kind) !== 'human';
      return <div className="pronunciation-row" key={accent}>
        <span className="pronunciation-accent">{accent === 'gb' ? '英' : '美'}</span>
        <span className={`pronunciation-ipa${item?.ipa ? '' : ' pending'}`} lang={item?.ipa ? 'en' : undefined}>{item?.ipa || (loading ? '…' : '音标待核验')}</span>
        <button type="button" className={`pronunciation-play${active ? ' active' : ''}`} disabled={loading} aria-label={`${active ? '停止' : '播放'}${accent === 'gb' ? '英式' : '美式'}发音${synthetic ? '（合成）' : ''}`} onClick={() => active ? player.current?.stop() : player.current?.play(word, accent, item)}><Icon name="speaker" size={18}/></button>
        {synthetic && <small className="pronunciation-kind">合成</small>}
      </div>;
    })}
    {playback.status === 'error' && <small role="status" className="pronunciation-error">{playback.message}</small>}
  </div>;
}

export function PronunciationSources({ entry }) {
  const sources = [...new Map(Object.values(entry || {}).filter(item => item.source).map(item => [item.source, item])).values()];
  const recordings = Object.entries(entry || {}).filter(([,item]) => item.recording);
  return <div className="pronunciation-sources">
    {sources.map(item => <p key={item.source}>音标：<a href={item.source} target="_blank" rel="noreferrer">{item.publisher || 'English Wiktionary contributors'}</a>{item.license === 'CC BY-SA 4.0' && <> · 经 Kaikki 提取（2026-09-02）· <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></>}</p>)}
    {recordings.map(([accent,item]) => <p key={accent}>{accent === 'gb' ? '英' : '美'}式录音：{item.recording.author} · <a href={item.recording.source} target="_blank" rel="noreferrer">Wikimedia Commons</a> · <a href={item.recording.license_url} target="_blank" rel="noreferrer">{item.recording.license}</a> · MP3 转码</p>)}
    {entry && <p>合成发音：<a href="https://huggingface.co/hexgrad/Kokoro-82M" target="_blank" rel="noreferrer">Kokoro-82M</a> · Apache-2.0</p>}
  </div>;
}
