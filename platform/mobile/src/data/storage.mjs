import { MAX_FILE_BYTES } from './model.mjs';

let bridgePromise;
async function bridge() {
  if (!bridgePromise) bridgePromise = import('@capacitor/core').then(({ Capacitor, registerPlugin }) => Capacitor.isNativePlatform() ? registerPlugin('VocabStorage') : null);
  return bridgePromise;
}
export async function createStorage() {
  const native = await bridge();
  if (native) return { kind: 'sqlite', read: async () => (await native.read()).value, write: async value => { await native.write({ value }); } };
  if (!globalThis.indexedDB) throw Error('本机存储不可用，无法安全保存学习记录');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('gre-vocabulary-mobile', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error || Error('本机数据库打开失败'));
    request.onblocked = () => reject(Error('数据库正在被旧页面使用，请关闭其他标签后重试'));
  });
  function transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction('documents', mode), request = operation(tx.objectStore('documents'));
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result ?? null);
      tx.onerror = () => reject(tx.error || Error('本机保存失败，原数据保留'));
      tx.onabort = () => reject(tx.error || Error('本机保存被取消，原数据保留'));
    });
  }
  return { kind: 'indexeddb', read: () => transaction('readonly', store => store.get('vocabulary')), write: value => transaction('readwrite', store => store.put(value, 'vocabulary')), close: () => database.close() };
}
export async function exportFile(name, content) {
  const native = await bridge();
  if (native) return native.exportFile({ name, content });
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' }), uri = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = uri; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(uri), 30000);
  return { name, downloadRequested: true };
}
export async function importFile() {
  const native = await bridge();
  if (native) return native.importFile();
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('cancel', () => reject(Object.assign(Error('已取消选择文件'), { code: 'CANCELLED' })), { once: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return reject(Object.assign(Error('已取消选择文件'), { code: 'CANCELLED' }));
      if (file.size > MAX_FILE_BYTES) return reject(Error('文件不能超过 20 MB'));
      try { resolve({ name: file.name, content: await file.text() }); } catch (error) { reject(error); }
    }, { once: true });
    input.click();
  });
}
