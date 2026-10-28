export const LOGIN_PHASES = new Set(['idle', 'starting', 'awaiting_browser', 'exchanging', 'verifying', 'connected', 'failed', 'cancelled']);
export const ACTIVE_LOGIN_PHASES = new Set(['starting', 'awaiting_browser', 'exchanging', 'verifying']);
export const BRIDGE_TIMEOUTS = { status: 6000, signIn: 6000, cancelSignIn: 6000, models: 40000, signOut: 10000, openUsage: 10000, respond: 250000, cancel: 6000 };
export const loginPhaseText = {
  idle: '', starting: '正在打开登录浏览器…', awaiting_browser: '请在浏览器完成授权，随后返回 App。',
  exchanging: '已收到授权，正在建立安全连接…', verifying: '授权已返回，正在核对账号和计划权限…',
  connected: 'ChatGPT 已连接', failed: '本次登录未完成', cancelled: '已取消本次登录',
};

// Bridge promises may outlive the WebView foreground or never settle. A timeout
// releases the caller; a later resolution has no opportunity to change its result.
export function boundedCall(operation, milliseconds, message, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => { if (settled) return; settled = true; clearTimer(timer); callback(value); };
    const timer = setTimer(() => { const error = Error(message); error.code = 'bridge_timeout'; finish(reject, error); }, milliseconds);
    Promise.resolve().then(operation).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

export function initialLoginState() {
  return { connection: null, login: { id: null, phase: 'idle', elapsed_seconds: 0 }, statusBusy: false, statusError: '', loginError: '', actionBusy: false, models: [], modelsBusy: false, modelsError: '', pollingPaused: false };
}

// Only native status is authoritative. signIn merely launches work and its
// response is deliberately not used as a login result. All side effects are
// injectable, allowing real timeout/foreground races to be tested without login.
export function createLoginFlow({ api, onChange = () => {}, onConnectionChanged = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, pollMs = 1500, idlePollMs = 10000, pollWindowMs = 180000, timeouts = BRIDGE_TIMEOUTS }) {
  let state = initialLoginState(), disposed = false, active = false, epoch = 0, statusSequence = 0, modelSequence = 0;
  let pollTimer = null, pollUntil = 0, statusFlight = null, modelAttempt = null, startPending = false, cancelFlight = null;
  const ignoredLoginIds = new Set();
  const clock = { setTimer, clearTimer };
  const emit = patch => { if (disposed) return; state = { ...state, ...patch }; onChange(state); };
  const call = (name, message) => boundedCall(() => api[name](), timeouts[name] ?? timeouts[{ connectionStatus: 'status', listModels: 'models' }[name]], message, clock);
  const connectionKey = value => value?.connected ? `${value.email || ''}|${!!value.eligible}` : '';
  const stopPolling = () => { clearTimer(pollTimer); pollTimer = null; };
  function schedulePoll() {
    stopPolling();
    if (!active || disposed || state.connection?.available === false) return;
    if (now() >= pollUntil) {
      emit({ pollingPaused: true, ...(ACTIVE_LOGIN_PHASES.has(state.login.phase) ? { loginError: '等待登录状态更新已超时。可以重新检查状态、取消本次登录或重试。' } : {}) });
      return;
    }
    pollTimer = setTimer(() => { pollTimer = null; void refresh().then(schedulePoll); }, Math.min(ACTIVE_LOGIN_PHASES.has(state.login.phase) ? pollMs : idlePollMs, pollUntil - now()));
  }
  function applyStatus(status) {
    if (!status || typeof status.connected !== 'boolean' || typeof status.eligible !== 'boolean' || typeof status.available !== 'boolean') throw Error('设备返回的连接状态不完整，请重新检查。');
    const incoming = status.login && LOGIN_PHASES.has(status.login.phase) ? status.login : { id: null, phase: status.connected ? 'connected' : 'idle', elapsed_seconds: 0 };
    if (incoming.id && ignoredLoginIds.has(incoming.id) && incoming.phase !== 'cancelled') return false;
    const previousKey = connectionKey(state.connection), nextKey = connectionKey(status);
    const login = startPending && incoming.phase === 'idle' && state.login.phase === 'starting' ? state.login : incoming;
    emit({ connection: status, login, statusError: '', loginError: login.phase === 'failed' ? login.error || '登录未完成，请重试。' : login.phase === 'idle' ? state.loginError : '', pollingPaused: false });
    if (previousKey !== nextKey) onConnectionChanged(status);
    if (!status.connected || !status.eligible) {
      modelSequence++; modelAttempt = null;
      emit({ models: [], modelsBusy: false, modelsError: '' });
    } else {
      const key = `${nextKey}|${login.phase === 'connected' ? login.id || '' : ''}`;
      if (modelAttempt !== key) void loadModels(key);
    }
    return true;
  }
  async function loadModels(key) {
    if (!state.connection?.connected || !state.connection?.eligible || disposed) return;
    const sequence = ++modelSequence, account = connectionKey(state.connection);
    modelAttempt = key || `${account}|${state.login.phase === 'connected' ? state.login.id || '' : ''}`;
    emit({ modelsBusy: true, modelsError: '' });
    try {
      const models = await call('listModels', '模型列表加载超时。账号仍已连接，请重新加载模型。');
      if (disposed || sequence !== modelSequence || connectionKey(state.connection) !== account) return;
      if (!Array.isArray(models) || !models.length || models.some(m => !m || typeof m.slug !== 'string' || !m.slug)) throw Error('当前账号未返回可用模型。可以重新加载模型或检查计划额度。');
      emit({ models, modelsBusy: false });
    } catch (error) {
      if (!disposed && sequence === modelSequence) emit({ modelsBusy: false, modelsError: error.message || '模型列表加载失败，请重试。' });
    }
  }
  async function refresh() {
    if (disposed) return false;
    if (statusFlight?.epoch === epoch) return statusFlight.promise;
    const token = epoch, sequence = ++statusSequence;
    emit({ statusBusy: true });
    const promise = call('connectionStatus', '读取连接状态超时。原有连接信息保留，可以重新检查。').then(status => {
      if (!disposed && token === epoch && sequence === statusSequence) return applyStatus(status);
      return false;
    }).catch(error => {
      if (!disposed && token === epoch && sequence === statusSequence) emit({ statusError: error.message || '读取连接状态失败。' });
      return false;
    }).finally(() => {
      if (!disposed && token === epoch && sequence === statusSequence) { statusFlight = null; emit({ statusBusy: false }); }
    });
    statusFlight = { epoch: token, promise };
    return promise;
  }
  function wake() {
    if (disposed || !active) return;
    pollUntil = now() + pollWindowMs;
    emit({ pollingPaused: false });
    stopPolling(); void refresh().then(schedulePoll);
  }
  function start() {
    if (disposed || state.actionBusy || state.connection?.available === false) return;
    if (ACTIVE_LOGIN_PHASES.has(state.login.phase)) void cancel();
    const token = ++epoch; statusSequence++; statusFlight = null; startPending = true;
    emit({ login: { id: null, phase: 'starting', elapsed_seconds: 0 }, loginError: '', statusError: '', statusBusy: false, pollingPaused: false });
    stopPolling(); pollUntil = now() + pollWindowMs;
    // A prior cancel must finish its bounded bridge dispatch before a new launch.
    const begin = () => {
      if (disposed || token !== epoch) return;
      const launch = call('signIn', '未收到启动登录的回执。请重新检查状态，或取消后重试。');
      void refresh().then(schedulePoll);
      void launch.then(() => {
        if (!disposed && token === epoch) { startPending = false; void refresh().then(schedulePoll); }
      }).catch(error => {
        if (disposed || token !== epoch) return;
        startPending = false;
        // A lost signIn reply is irrelevant once status identifies native work.
        if (!state.login.id && state.login.phase !== 'connected') emit({ login: { ...state.login, phase: 'failed', error: error.message || '无法启动登录。' }, loginError: error.message || '无法启动登录。', pollingPaused: true });
        void refresh().then(schedulePoll);
      });
    };
    if (cancelFlight) void cancelFlight.then(begin, begin); else begin();
  }
  function cancel() {
    if (disposed) return Promise.resolve();
    if (state.login.id) ignoredLoginIds.add(state.login.id);
    const token = ++epoch; statusSequence++; statusFlight = null; startPending = false; stopPolling();
    emit({ login: { ...state.login, phase: 'cancelled' }, loginError: '', statusError: '', statusBusy: false, pollingPaused: false });
    const promise = call('cancelSignIn', '取消登录的设备回执超时。界面已解除等待，可重新检查状态。').then(status => {
      if (disposed || token !== epoch) return;
      if (status && typeof status.connected === 'boolean') {
        if (status.connected && status.login?.phase === 'connected') {
          ignoredLoginIds.delete(status.login.id);
          applyStatus(status);
          return;
        }
        // Cancelling an authorization never disconnects an existing account.
        const previousKey = connectionKey(state.connection);
        emit({ connection: status });
        if (previousKey !== connectionKey(status)) onConnectionChanged(status);
      }
    }).catch(error => { if (!disposed && token === epoch) emit({ statusError: error.message }); }).finally(() => { if (cancelFlight === promise) cancelFlight = null; });
    cancelFlight = promise;
    return promise;
  }
  async function disconnect() {
    if (disposed || state.actionBusy) return null;
    const token = ++epoch; statusSequence++; statusFlight = null; modelSequence++; startPending = false; stopPolling();
    emit({ actionBusy: true, statusBusy: false, modelsBusy: false, statusError: '', loginError: '' });
    try {
      const result = await call('signOut', '退出连接超时。请重新检查设备状态。');
      if (disposed || token !== epoch) return null;
      await refresh();
      return result;
    } catch (error) { if (!disposed && token === epoch) emit({ statusError: error.message }); return null; }
    finally { if (!disposed && token === epoch) { emit({ actionBusy: false }); schedulePoll(); } }
  }
  return {
    getState: () => state, refresh, wake, start, cancel, disconnect, loadModels: () => loadModels(),
    setActive(value) { active = !!value; if (active) wake(); else stopPolling(); },
    dispose() { disposed = true; epoch++; statusSequence++; modelSequence++; stopPolling(); },
  };
}
