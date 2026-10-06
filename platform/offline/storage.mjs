const KEY='gre:offline-platform:v1';
const ui=new Map();let getter=()=>({}),timer;
export let storageMessage='本机缓存 · 结束前请导出记录';
export function initializeStorage(initial,getBackup){getter=getBackup;for(const [k,v] of Object.entries(initial||{}))ui.set(k,v);}
export function uiSnapshot(){return Object.fromEntries(ui);}
export function readBackup(){try{return JSON.parse(globalThis.localStorage.getItem(KEY)||'null');}catch{storageMessage='缓存不可用：记录保留在当前页面，退出前务必导出';return null;}}
export function persist(){clearTimeout(timer);try{globalThis.localStorage.setItem(KEY,JSON.stringify(getter()));storageMessage='本机缓存已保存 · 结束前请导出记录';}catch{storageMessage='缓存不可用或空间不足：请立即导出记录';}globalThis.dispatchEvent(new Event('gre:storage'));}
export const offlineStorage={getItem:k=>ui.get(k)??null,setItem(k,v){ui.set(k,String(v));clearTimeout(timer);timer=setTimeout(persist,150);},removeItem(k){ui.delete(k);clearTimeout(timer);timer=setTimeout(persist,150);}};
