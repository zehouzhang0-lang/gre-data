import { Capacitor, registerPlugin } from '@capacitor/core';
import { boundedCall, BRIDGE_TIMEOUTS } from './login-flow.mjs';
const ChatGPT = registerPlugin('ChatGPTPlan');
const native = () => Capacitor.getPlatform() === 'android';
const bridge = (method, options) => boundedCall(() => ChatGPT[method](options), BRIDGE_TIMEOUTS[method], method === 'models' ? '模型列表加载超时。账号仍已连接，请重新加载模型。' : method === 'status' ? '读取设备连接状态超时，请重新检查。' : method === 'respond' ? '解析请求超时，请重试；原作答保留。' : '设备操作等待超时，请重新检查状态后重试。');
export async function connectionStatus() {
  return native() ? bridge('status') : { connected: false, eligible: false, available: false, login: { id: null, phase: 'idle', elapsed_seconds: 0 }, message: '请在安卓应用中连接 ChatGPT；网页预览不保存登录凭据。' };
}
export async function signIn() {
  if (!native()) throw Error('请在安卓应用中使用 ChatGPT 登录。');
  return bridge('signIn');
}
export async function signOut() { if (native()) return bridge('signOut'); }
export async function listModels() {
  if (!native()) return [];
  const result = await bridge('models');
  return result.models || [];
}
export async function requestReview(body) {
  if (!native()) throw Error('AI 解析需在已连接 ChatGPT 的安卓应用中使用。');
  return bridge('respond', { body });
}
export async function stopReview() { if (native()) await bridge('cancel'); }
export async function cancelSignIn() { if (native()) return bridge('cancelSignIn'); }
export async function openUsage() { if (native()) return bridge('openUsage'); }
