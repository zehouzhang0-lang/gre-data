import { Capacitor, registerPlugin } from '@capacitor/core';

let nativeBridge;
function bridge() {
  if (!Capacitor.isNativePlatform()) return null;
  // Keep Capacitor's thenable proxy out of async function return values.
  return nativeBridge ||= registerPlugin('PracticeStorage');
}
export async function createPracticeStorage() {
  const native = bridge();
  if (native) return { kind: 'sqlite', read: async () => (await native.read()).value, write: async value => { await native.write({ value }); } };
  if (!globalThis.indexedDB) throw Error('本机存储不可用，无法安全保存刷题记录');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('gre-practice-mobile', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error || Error('刷题数据库打开失败'));
    request.onblocked = () => reject(Error('请关闭其他页面后重新打开刷题'));
  });
  function transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction('documents', mode), request = operation(tx.objectStore('documents'));
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result ?? null);
      tx.onerror = () => reject(tx.error || Error('刷题记录保存失败，原数据保留'));
      tx.onabort = () => reject(tx.error || Error('刷题记录保存被取消，原数据保留'));
    });
  }
  return { kind: 'indexeddb', read: () => transaction('readonly', store => store.get('practice')), write: value => transaction('readwrite', store => store.put(value, 'practice')), close: () => database.close() };
}
