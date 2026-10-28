import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { connectionStatus, signIn, signOut, listModels, cancelSignIn, openUsage } from '../ai/client.mjs';
import { ACTIVE_LOGIN_PHASES, boundedCall, createLoginFlow, initialLoginState, loginPhaseText } from '../ai/login-flow.mjs';
import { connectionDiagnostic, serializeConnectionDiagnostic } from '../ai/diagnostics.mjs';
import '../ai/ai.css';

const api = { connectionStatus, signIn, signOut, listModels, cancelSignIn };
export default function ChatGPTSettings({ active, state, repo, mutate, notify }) {
  const [view, setView] = useState(initialLoginState), [usageError, setUsageError] = useState('');
  const [copyingDiagnostic, setCopyingDiagnostic] = useState(false), [diagnosticText, setDiagnosticText] = useState('');
  const copyGuard = useRef(false);
  const flow = useRef(null), latest = useRef({ active, notify });
  latest.current = { active, notify };
  useEffect(() => {
    let disposed = false, nativeListener, nativeForeground = true;
    const controller = createLoginFlow({ api, onChange: setView, onConnectionChanged: status => {
      window.dispatchEvent(new Event('gre-chatgpt-connection'));
      if (status.connected) latest.current.notify('ChatGPT 账号已连接。');
    } });
    flow.current = controller;
    const visible = () => controller.setActive(latest.current.active && !document.hidden && nativeForeground);
    const focused = () => { if (latest.current.active && nativeForeground) { controller.setActive(true); } };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', focused);
    if (Capacitor.isNativePlatform()) import('@capacitor/app').then(async ({ App }) => {
      const listener = await App.addListener('appStateChange', ({ isActive }) => {
        nativeForeground = isActive;
        // Native foreground may arrive before WebView visibility is updated.
        controller.setActive(latest.current.active && isActive);
      });
      if (disposed) void listener.remove(); else nativeListener = listener;
    }).catch(() => { /* Visibility/focus remain available if native lifecycle is unavailable. */ });
    visible();
    return () => { disposed = true; controller.dispose(); flow.current = null; document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', focused); void nativeListener?.remove(); };
  }, []);
  useEffect(() => { flow.current?.setActive(active && !document.hidden); }, [active]);
  const { connection, login, models, modelsBusy, modelsError, actionBusy, statusBusy, statusError, loginError, pollingPaused } = view;
  const diagnostic = connectionDiagnostic(connection).diagnostics;
  const loginActive = ACTIVE_LOGIN_PHASES.has(login.phase), waiting = loginActive && !pollingPaused;
  const selected = models.some(m => m.slug === state.settings.aiModel) ? state.settings.aiModel : models[0]?.slug || '';
  const connect = () => { setUsageError(''); flow.current?.start(); };
  const disconnect = async () => {
    setUsageError('');
    const result = await flow.current?.disconnect();
    if (result !== null && result !== undefined) notify(result.revoked === false ? '已在此设备退出；可在 ChatGPT 设置中检查并撤销应用授权。' : '已退出 ChatGPT。');
  };
  const copyDiagnostic = async () => {
    const controller = flow.current;
    if (!controller || copyGuard.current) return;
    copyGuard.current = true; setCopyingDiagnostic(true); setDiagnosticText('');
    try {
      const fresh = await controller.refresh();
      if (flow.current !== controller) return;
      const current = controller.getState();
      const text = serializeConnectionDiagnostic(current.connection, { fresh: fresh === true });
      const freshness = fresh === true ? '' : current.connection ? '（上次已知状态，刷新未成功）' : '（尚未取得设备状态）';
      try {
        if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable');
        await boundedCall(() => navigator.clipboard.writeText(text), 5000, 'clipboard timeout');
        if (flow.current === controller) notify(`已复制连接诊断${freshness}。`);
      } catch {
        if (flow.current === controller) {
          setDiagnosticText(text);
          notify(`未能自动复制，请选中下方诊断文本手动复制${freshness}。`);
        }
      }
    } finally { copyGuard.current = false; if (flow.current === controller) setCopyingDiagnostic(false); }
  };
  return <section className="settings-section chatgpt-settings"><h2>AI 题目解析</h2>
    <p className="muted">使用你授权的 ChatGPT 计划；解析时手机联网即可，电脑可以关机。</p>
    {connection?.connected ? <>
      <p className="chatgpt-connection"><strong>{connection.email || '已连接 ChatGPT'}</strong><span>{connection.eligible ? '使用 ChatGPT 计划' : '尚未授权计划使用'}</span></p>
      {models.length > 0 && <label className="ai-model-label">解析模型<select value={selected} disabled={actionBusy || modelsBusy} onChange={e => mutate(() => repo.setSettings({ aiModel: e.target.value }))}>{models.map(model => <option key={model.slug} value={model.slug}>{model.display_name || model.slug}</option>)}</select></label>}
      {connection.eligible && <div className="ai-model-status">
        {modelsBusy && <p className="muted" role="status">账号已连接，正在加载模型…</p>}
        {modelsError && <p className="ai-error" role="alert">模型列表：{modelsError}</p>}
        {!modelsBusy && (modelsError || !models.length) && <button onClick={() => flow.current?.loadModels()} disabled={actionBusy}>重新加载模型</button>}
      </div>}
      <div className="ai-account-actions"><button disabled={actionBusy} onClick={() => openUsage().catch(e => setUsageError(e.message))}>管理额度</button><button disabled={actionBusy || loginActive} onClick={disconnect}>{actionBusy ? '正在退出…' : '退出连接'}</button>{!connection.eligible && <button disabled={actionBusy || waiting} className="primary" onClick={connect}>重新授权</button>}</div>
    </> : <><button className="primary chatgpt-connect" disabled={actionBusy || waiting || connection?.available === false} onClick={connect}>{waiting ? loginPhaseText[login.phase] : login.phase === 'failed' || pollingPaused ? '重新登录 ChatGPT' : 'Continue with ChatGPT'}</button>{connection?.message && <p className="muted">{connection.message}</p>}</>}
    {login.phase !== 'idle' && login.phase !== 'connected' && <div className={`ai-login-progress phase-${login.phase}`} role="status"><span>{pollingPaused && loginActive ? '登录状态等待更新' : loginPhaseText[login.phase]}</span>{loginActive && Number.isFinite(login.elapsed_seconds) && login.elapsed_seconds > 0 && <small>已等待 {Math.floor(login.elapsed_seconds)} 秒</small>}</div>}
    {loginActive && <div className="ai-account-actions"><button className="text-button" onClick={() => flow.current?.cancel()}>取消登录</button>{pollingPaused && connection?.connected && <button onClick={connect}>重新登录</button>}</div>}
    {(statusError || loginError || usageError) && <div className="ai-status-errors" role="alert">{loginError && <p className="ai-error">{loginError}</p>}{statusError && <p className="ai-error">{statusError}</p>}{usageError && <p className="ai-error">{usageError}</p>}</div>}
    {connection?.available !== false && <button className="text-button ai-refresh-status" disabled={statusBusy || actionBusy} onClick={() => flow.current?.wake()}>{statusBusy ? '正在检查连接…' : '重新检查状态'}</button>}
    <p className="muted"><small>应用版本：{diagnostic.app_version || (connection?.available === false ? '网页预览' : '待读取')} · 当前阶段：{connection?.available === false ? '网页预览不提供连接' : diagnostic.phase === 'idle' ? '尚未开始登录' : loginPhaseText[diagnostic.phase] || '待读取'}{statusError ? '（上次已知状态）' : ''}</small></p>
    <button disabled={copyingDiagnostic || actionBusy} onClick={copyDiagnostic}>{copyingDiagnostic ? '正在读取诊断…' : '复制连接诊断'}</button>
    {diagnosticText && <label className="field">连接诊断（点选后手动复制）<textarea aria-label="连接诊断文本" readOnly value={diagnosticText} rows={12} onFocus={e => e.currentTarget.select()} style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', userSelect: 'text', WebkitUserSelect: 'text' }}/></label>}
    <small className="muted ai-connection-note">此入口使用计划额度，不会自动转用收费 API。登录凭据不进入学习备份。</small>
  </section>;
}
