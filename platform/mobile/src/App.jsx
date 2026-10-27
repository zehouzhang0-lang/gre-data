import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import useRepository from './useRepository';
import { useBackAction, useBackBridge } from './useBack';
import { BottomNav, Icon } from './components/Primitives';
import WordWall from './components/WordWall';
import Review from './components/Review';
import Settings from './components/Settings';
import WordSession from './components/WordSession';

const Practice = lazy(() => import('./components/Practice'));
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
  const [tab, setTab] = useState('wall'), [session, setSession] = useState(null), [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false), [toast, setToast] = useState(null), [version, setVersion] = useState(0);
  const [practiceOpened, setPracticeOpened] = useState(false);
  const guard = useRef(false), toastTimer = useRef(null);
  useBackBridge();
  useBackAction(() => setTab('wall'), tab !== 'wall' && !session, 20);
  const notify = useCallback((message, isError = false, undo = false) => {
    clearTimeout(toastTimer.current); setToast({ message, isError, undo });
    if (!isError) toastTimer.current = setTimeout(() => setToast(null), undo ? 8500 : 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { if (tab === 'practice') setPracticeOpened(true); }, [tab]);
  const mutate = useCallback(async (operation, message) => {
    if (guard.current) return false;
    guard.current = true; setBusy(true);
    try {
      await operation();
      try { await refresh(); } catch (e) { notify(`操作已保存，但显示刷新失败：${e.message}`, true); return true; }
      if (message) notify(message, false, message.startsWith('已标记'));
      return true;
    } catch (e) { notify(e.message, true); return false; }
    finally { guard.current = false; setBusy(false); }
  }, [refresh, notify]);
  const start = (words, { initialCount } = {}) => { setSession({ words, initialCount, key: crypto.randomUUID() }); setTab('review'); };
  const resume = round => { setSession({ round, words: [], key: round.session_id }); setTab('review'); };
  const restored = () => { setVersion(v => v + 1); setSession(null); setSelecting(false); setTab('wall'); };
  if (error && !state) return <div className="startup"><h1>本地词库暂时无法读取</h1><p role="alert">{error}</p><p>没有清除任何数据。请重新打开应用后重试。</p><button onClick={() => location.reload()}>重新读取</button></div>;
  if (!state || !repo) return slow
    ? <div className="startup" data-testid="startup-slow"><h1>词库打开耗时较长</h1><p role="status">已经等待超过 15 秒，初始化尚未完成。</p><p>不会清除或重置已有数据。你可以继续等待，或重新读取。</p><button onClick={() => location.reload()}>重新读取</button></div>
    : <div className="startup" role="status"><h1>正在打开词库</h1><p>首次打开会将词库保存到手机。</p></div>;
  return <div className="app-shell" data-version={version}>
    <WordWall key={`wall-${version}`} state={state} repo={repo} busy={busy} active={tab === 'wall' && !session} mutate={mutate} notify={notify} onSelectionMode={setSelecting} onStartReview={start}/>
    <Review key={`review-${version}`} state={state} repo={repo} busy={busy} mutate={mutate} active={tab === 'review' && !session} onResume={resume} onWall={() => setTab('wall')}/>
    {(practiceOpened || tab === 'practice') && <PracticeBoundary active={tab === 'practice' && !session}>
      <Suspense fallback={tab === 'practice' && !session ? <section className="screen"><div className="empty" role="status">正在打开刷题…</div></section> : null}>
        <Practice active={tab === 'practice' && !session} notify={notify} vocabularyRepo={repo} refreshVocabulary={refresh} onConnection={() => setTab('settings')}/>
      </Suspense>
    </PracticeBoundary>}
    <Settings key={`settings-${version}`} state={state} repo={repo} active={tab === 'settings' && !session} busy={busy} mutate={mutate} notify={notify} onRestored={restored}/>
    {session && <WordSession key={session.key} state={state} repo={repo} initialWords={session.words} initialCount={session.initialCount} initialSession={session.round} refresh={refresh} onExit={() => { setSession(null); refresh().catch(e => notify(e.message, true)); }} notify={notify}/>}
    {!session && !selecting && <BottomNav tab={tab} onChange={setTab} practice/>}
    {toast && <div className={`toast ${toast.isError ? 'error-toast' : ''}`} role={toast.isError ? 'alert' : 'status'}><span>{toast.message}</span>{toast.undo && state.undoId && <button disabled={busy} onClick={() => mutate(() => repo.undoQuickReview(), '已撤销上次标记')}>撤销</button>}<button className="toast-close" aria-label="关闭提示" onClick={() => setToast(null)}><Icon name="close" size={16}/></button></div>}
  </div>;
}
