import { Capacitor, registerPlugin } from '@capacitor/core';
const ChatGPT = registerPlugin('ChatGPTPlan');
const native = () => Capacitor.getPlatform() === 'android';
export async function connectionStatus() {
  return native() ? ChatGPT.status() : { connected: false, eligible: false, available: false, message: '请在安卓应用中连接 ChatGPT；网页预览不保存登录凭据。' };
}
export async function signIn() {
  if (!native()) throw Error('请在安卓应用中使用 ChatGPT 登录。');
  return ChatGPT.signIn();
}
export async function signOut() { if (native()) return ChatGPT.signOut(); }
export async function listModels() {
  if (!native()) return [];
  const result = await ChatGPT.models();
  return result.models || [];
}
export async function requestReview(body) {
  if (!native()) throw Error('AI 解析需在已连接 ChatGPT 的安卓应用中使用。');
  return ChatGPT.respond({ body });
}
export async function stopReview() { if (native()) await ChatGPT.cancel(); }
export async function cancelSignIn() { if (native()) await ChatGPT.cancelSignIn(); }
export async function openUsage() { if (native()) return ChatGPT.openUsage(); }
