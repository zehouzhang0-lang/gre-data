import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import useRepository from './useRepository';
import { useBackAction, useBackBridge } from './useBack';
import { BottomNav, Icon, SheetNoticeContext } from './components/Primitives';
import WordWall from './components/WordWall';
import Review from './components/Review';
import Settings from './components/Settings';
import WordSession from './components/WordSession';
import { loadWallView } from './wall-navigation.mjs';
import { loadWallAppearance, normalizeWallAppearance, saveWallAppearance } from './wall-display.mjs';
import { configureSound, unlockSound } from './sound.mjs';
import { loadQueue, nextBatch, saveQueue } from './review-queue.mjs';
import './wall-display.css';

const Practice = lazy(() => import('./components/Practice'));
const darkPreference = '(prefers-color-scheme: dark)';
const AppAppearance = registerPlugin('AppAppearance');
class PracticeBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="screen" hidden={!this.props.active}><div className="empty">
      <h2>刷题页面暂时无法打开</h2><p role="alert">{this.state.error.message}</p>
      <button onClick={() => location.reload()}>重新打开</button>
    </div></section>;
  }
}

export default function App() {
  const { state, repo, refresh, error, slow } = useRepository();
  const [tab, setTab] = useState('wall'), [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false), [toast, setToast] = useState(null), [version, setVersion] = useState(0);
  const [noticeSlots, setNoticeSlots] = useState([]);
  const [queue, setQueue] = useState(null);
  const [practiceOpened, setPracticeOpened] = useState(false);
  const [wallAppearance, setWallAppearance] = useState(loadWallAppearance);
  const guard = useRef(false), toastTimer = useRef(null);
  useBackBridge();
  useBackAction(() => setTab('wall'), tab !== 'wall' && !session, 20);
  const registerNoticeSlot = useCallback(slot => {
    setNoticeSlots(slots => [...slots, slot]);
    return () => setNoticeSlots(slots => slots.filter(open => open !== slot));
  }, []);
  const notify = useCallback((message, isError = false) => {
    clearTimeout(toastTimer.current); setToast({ message, isError });
    if (!isError) toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { if (tab === 'practice') setPracticeOpened(true); }, [tab]);
  useEffect(() => { saveWallAppearance(wallAppearance); }, [wallAppearance]);
  const { theme } = wallAppearance;
  useLayoutEffect(() => {
    const preference = globalThis.matchMedia?.(darkPreference);
    let revision = 0;
    function applyTheme() {
      const currentRevision = ++revision;
      const dark = theme === 'dark' || (theme === 'system' && preference?.matches);
      const root = document.documentElement;
      root.dataset.colorScheme = dark ? 'dark' : 'light';
      const color = getComputedStyle(root).getPropertyValue('--c-canvas').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
      if (Capacitor.getPlatform() === 'android') {
        void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
          .catch(() => {})
          .then(() => { if (currentRevision === revision) return AppAppearance.setSurface({ color }); })
          .catch(() => {});
      }
    }
    applyTheme();
    preference?.addEventListener('change', applyTheme);
    return () => {
      revision++;
      preference?.removeEventListener('change', applyTheme);
    };
  }, [theme]);
  const { sound, pageTone } = wallAppearance;
  useLayoutEffect(() => { configureSound({ sound, pageTone }); }, [sound, pageTone]);
  const updateWallAppearance = useCallback(patch => setWallAppearance(previous => normalizeWallAppearance({ ...previous, ...patch })), []);
  const mutate = useCallback(async (operation, message, { quiet = false } = {}) => {
    if (guard.current) return false;
    guard.current = true; setBusy(true);
    try {
      await operation();
      try { await refresh(); } catch (e) { if (!quiet) notify(`操作已保存，但显示刷新失败：${e.message}`, true); return true; }
      if (message && !quiet) notify(message);
      return true;
    } catch (e) { if (!quiet) notify(e.message, true); return false; }
    finally { guard.current = false; setBusy(false); }
  }, [refresh, notify]);
  const resume = round => { setSession(round); setTab('review'); };
  const datasetId = state?.datasetId;
  useEffect(() => { if (datasetId) setQueue(loadQueue(datasetId)); }, [datasetId]);
  const keepQueue = next => { setQueue(next); saveQueue(next); };
  // Starts the next ten words of a queue as an ordinary round; wrong answers come back within the group, so one meaning pass is enough.
  async function startBatch(from) {
    const usable = new Set(state.vocabulary.filter(w => !w.deleted && w.meaning?.trim()).map(w => w.word));
    const batch = nextBatch(from, usable);
    if (!batch) { keepQueue(null); return false; }
    let round;
    if (!await mutate(async () => { round = await repo.createReviewRound({ words: batch.words, name: batch.name, meaning_passes: 1, order: 'spaced' }); })) return false;
    keepQueue(batch.rest); resume(round);
    return true;
  }
  const startWords = (words, name) => startBatch({ datasetId, base: name || new Date().toLocaleDateString('sv-SE'), total: words.length, started: 0, words });
  const restored = () => { setVersion(v => v + 1); setSession(null); setTab('wall'); };
  if (error && !state) return <div className="startup"><h1>本地词库暂时无法读取</h1><p role="alert">{error}</p><p>没有清除任何数据。请重新打开应用后重试。</p><button onClick={() => location.reload()}>重新读取</button></div>;
  if (!state || !repo) return slow
    ? <div className="startup" data-testid="startup-slow"><h1>词库打开耗时较长</h1><p role="status">已经等待超过 15 秒，初始化尚未完成。</p><p>不会清除或重置已有数据。你可以继续等待，或重新读取。</p><button onClick={() => location.reload()}>重新读取</button></div>
    : <div className="startup" role="status"><h1>正在打开词库</h1><p>首次打开会将词库保存到手机。</p></div>;
  const notice = toast && <div className={`toast ${toast.isError ? 'error-toast' : ''}`}>
    <span role={toast.isError ? 'alert' : 'status'}>{toast.message}</span>
    <button className="toast-close" aria-label="关闭提示" onClick={() => setToast(null)}><Icon name="close" size={16}/></button>
  </div>;
  const noticeSlot = noticeSlots.at(-1);
  const wallFont = wallAppearance.font ?? (tab === 'settings' ? loadWallView(globalThis.localStorage, state.datasetId, state.settings).display.font : undefined);
  return <SheetNoticeContext.Provider value={registerNoticeSlot}><div className="app-shell" data-version={version}
    onPointerDownCapture={unlockSound} onPointerUpCapture={unlockSound} onClickCapture={unlockSound}>
    <WordWall key={`wall-${version}`} state={state} repo={repo} busy={busy} active={tab === 'wall' && !session} mutate={mutate} notify={notify} onStartWords={startWords} appearance={wallAppearance}
      onHintSeen={() => updateWallAppearance({ hinted: true })}/>
    <Review key={`review-${version}`} state={state} repo={repo} busy={busy} mutate={mutate} active={tab === 'review' && !session} onResume={resume} onWall={() => setTab('wall')} queue={queue} onContinueQueue={() => startBatch(queue)} onDropQueue={() => keepQueue(null)}/>
    {(practiceOpened || tab === 'practice') && <PracticeBoundary active={tab === 'practice' && !session}>
      <Suspense fallback={tab === 'practice' && !session ? <section className="screen"><div className="empty" role="status">正在打开刷题…</div></section> : null}>
        <Practice active={tab === 'practice' && !session} notify={notify} vocabularyRepo={repo} refreshVocabulary={refresh} onConnection={() => setTab('settings')}/>
      </Suspense>
    </PracticeBoundary>}
    <Settings key={`settings-${version}`} state={state} repo={repo} active={tab === 'settings' && !session} busy={busy} mutate={mutate} notify={notify} onRestored={restored}
      wallAppearance={wallAppearance} onWallAppearanceChange={updateWallAppearance} wallFont={wallAppearance.font ?? (wallFont === 14.5 ? 15 : wallFont)} onWallFontChange={font => updateWallAppearance({ font })}/>
    {session && <WordSession key={session.session_id} state={state} repo={repo} initialSession={session} refresh={refresh} queue={queue} onNext={() => startBatch(queue)} onExit={() => { setSession(null); refresh().catch(e => notify(e.message, true)); }} notify={notify}/>}
    {noticeSlot ? createPortal(notice, noticeSlot) : notice}
    {!session && <BottomNav tab={tab} onChange={setTab} practice compact/>}
  </div></SheetNoticeContext.Provider>;
}
