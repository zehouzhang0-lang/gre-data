import { useCallback, useEffect, useState } from 'react';
import { connectionStatus, signIn, signOut, listModels, cancelSignIn, openUsage } from '../ai/client.mjs';
import '../ai/ai.css';

const connectionChanged = () => window.dispatchEvent(new Event('gre-chatgpt-connection'));
export default function ChatGPTSettings({ active, state, repo, mutate, notify }) {
  const [connection,setConnection] = useState(null), [models,setModels] = useState([]), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const refresh = useCallback(async () => {
    const status = await connectionStatus(); setConnection(status);
    setModels(status.eligible ? await listModels() : []);
  },[]);
  useEffect(() => { if (active) refresh().catch(e=>setError(e.message)); },[active,refresh]);
  const connect = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await signIn(); await refresh(); connectionChanged(); notify('已连接 ChatGPT，请选择可用模型。'); }
    catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); setError('');
    try { const result = await signOut(); await refresh(); connectionChanged(); notify(result?.revoked === false ? '已在此设备退出；可在 ChatGPT 设置中检查并撤销应用授权。' : '已退出 ChatGPT。'); }
    catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const selected = models.some(m=>m.slug===state.settings.aiModel) ? state.settings.aiModel : models[0]?.slug || '';
  return <section className="settings-section chatgpt-settings"><h2>AI 题目解析</h2>
    <p className="muted">使用你授权的 ChatGPT 计划；解析时手机联网即可，电脑可以关机。</p>
    {connection?.connected ? <>
      <p className="chatgpt-connection"><strong>{connection.email || '已连接 ChatGPT'}</strong><span>{connection.eligible ? '使用 ChatGPT 计划' : '尚未授权计划使用'}</span></p>
      {models.length > 0 && <label className="ai-model-label">解析模型<select value={selected} disabled={busy} onChange={e=>mutate(()=>repo.setSettings({aiModel:e.target.value}))}>{models.map(model=><option key={model.slug} value={model.slug}>{model.display_name || model.slug}</option>)}</select></label>}
      <div className="ai-account-actions"><button disabled={busy} onClick={()=>openUsage().catch(e=>setError(e.message))}>管理额度</button><button disabled={busy} onClick={disconnect}>退出连接</button>{!connection.eligible && <button disabled={busy} className="primary" onClick={connect}>重新授权</button>}</div>
    </> : <><button className="primary chatgpt-connect" disabled={busy || connection?.available === false} onClick={connect}>{busy ? '请在浏览器完成授权…' : 'Continue with ChatGPT'}</button>{connection?.message && <p className="muted">{connection.message}</p>}</>}
    {busy && <button className="text-button" onClick={()=>cancelSignIn().catch(e=>setError(e.message))}>取消登录</button>}
    {error && <p className="ai-error" role="alert">{error}</p>}
    <small className="muted">此入口使用计划额度，不会自动转用收费 API。登录凭据不进入学习备份。</small>
  </section>;
}
