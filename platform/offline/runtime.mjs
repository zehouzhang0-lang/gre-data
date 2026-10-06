import {Store,keyOf} from '../server/store.mjs';
import {readLegacyQuestions} from '../server/legacy-review.mjs';
import {initialize,files,setFile,version,attachments} from './virtual-files.mjs';
import {initializeStorage,readBackup,uiSnapshot,persist,offlineStorage} from './storage.mjs';
import {decodeImport,mergeEvents,canonical,checkEvent} from './validation.mjs';
export const isOffline=true;
const pack=globalThis.__GRE_OFFLINE_PACK__;
initialize(pack.files);
const store=new Store('');
const baseEvents=await store.events(),baseIds=new Set(baseEvents.map(e=>e.id));
const questionMap=new Map(pack.questions.map(q=>[q.key,q])),extraQuestions=new Map();
const urls=new Map();let stateCache=null,stateToken='',writeTail=Promise.resolve(),initialWarning='';
let ui=pack.ui||{};
export function allQuestions(){return [...questionMap.values()];}
export async function extraEvents(){return (await store.events()).filter(e=>!baseIds.has(e.id));}
// Keep an event snapshot so storage/export never need to await a filesystem scan.
let eventSnapshot=baseEvents;
function applyImport(data){const decoded=decodeImport(data),merged=mergeEvents(eventSnapshot,decoded.events);
 // Verify the entire batch before mutating events or question definitions.
 const additions=[];for(const q of decoded.questions){const old=questionMap.get(q.key);if(old){if(q.prompt&&old.prompt&&(q.prompt!==old.prompt||canonical(q.options)!==canonical(old.options)))throw Error('同一题目出现不同原文，已停止导入');}else additions.push(q);}
 for(const e of merged.events)if(!eventSnapshot.some(old=>old.id===e.id))setFile(`platform/events/${e.id}.json`,JSON.stringify(e));
 for(const q of additions){questionMap.set(q.key,q);extraQuestions.set(q.key,q);}
 eventSnapshot=merged.events;stateToken='';return {added:merged.added,questions:additions.length};}
if(pack.initial_events?.length)applyImport({format:'gre-platform-offline-backup',schema_version:1,events:pack.initial_events,questions:[]});
const embedded=globalThis.__GRE_OFFLINE_RESTORE__;
if(embedded){try{applyImport(embedded);ui={...ui,...embedded.ui};}catch(e){initialWarning='内嵌备份未能恢复：'+e.message;}}
const cached=readBackup();if(cached){try{applyImport(cached);ui={...ui,...cached.ui};}catch(e){initialWarning='浏览器备份未能合并：'+e.message;}}
export function backup(forExport=false){const events=eventSnapshot.filter(e=>!baseIds.has(e.id));const keys=new Set(events.filter(e=>e.kind==='attempt').map(e=>keyOf(e.payload)));const questions=forExport?[...new Map([...extraQuestions,...[...keys].filter(k=>questionMap.has(k)).map(k=>[k,questionMap.get(k)])]).values()]:[...extraQuestions.values()];return {format:'gre-platform-offline-backup',schema_version:1,repository:pack.repository,base_commit:pack.commit,exported_at:new Date().toISOString(),events,questions,ui:uiSnapshot(),analysis_requirements:{full_stem_translation:true,all_options:['core_meaning','contextual_meaning','full_translation','choice_or_elimination_evidence'],se_equivalent_completed_sentences:true}};}
initializeStorage(ui,()=>backup(false));
export {initialWarning};
export async function getState(){const token=version()+':'+Math.floor(Date.now()/60000);if(token===stateToken&&stateCache)return stateCache;stateCache=await store.state();stateToken=token;return stateCache;}
function serial(fn){const result=writeTail.then(fn);writeTail=result.catch(()=>{});return result;}
export async function importBackup(data){return serial(async()=>{const result=applyImport(data);
 if(data.format==='gre-platform-offline-backup'&&data.ui&&typeof data.ui==='object')for(const [key,value] of Object.entries(data.ui)){if(!(key.startsWith('gre:')||key.startsWith('gre-word-round-pending:'))||typeof value!=='string')continue;if(offlineStorage.getItem(key)===null)offlineStorage.setItem(key,value);else if(key==='gre:practice:v3'){try{const current=JSON.parse(offlineStorage.getItem(key)),incoming=JSON.parse(value);const baseline=JSON.parse(pack.ui?.[key]||'{}').drafts||{},drafts={...(current.drafts||{})};for(const [id,d]of Object.entries(incoming.drafts||{}))if(!drafts[id]||canonical(drafts[id])===canonical(baseline[id]))drafts[id]=d;offlineStorage.setItem(key,JSON.stringify({...incoming,...current,active:{...(incoming.active||{}),...(current.active||{})},drafts}));}catch{/* Submitted records have already been merged; malformed drafts are ignored. */}}}
 persist();return result;});}
export function request(url,options){const u=new URL(url,'https://offline.invalid');if(options?.method==='POST')return post(u.pathname,JSON.parse(options.body));return (async()=>{if(u.pathname==='/api/state'){const s=await getState();return u.searchParams.get('revision')===s.revision?{unchanged:true}:s;}
 if(u.pathname==='/api/practice'){const type=u.searchParams.get('type')||'se',s=await getState(),legacy=await readLegacyQuestions(store);const questions=[...new Map([...questionMap.values(),...s.questions].filter(q=>q.type===type).map(q=>[q.key,q])).values()];const attempts=s.attempts.filter(a=>a.type===type),completed=[...new Set([...attempts,...legacy.filter(a=>a.type===type)].map(keyOf))],last=attempts[0],at=last?questions.findIndex(q=>q.key===keyOf(last)):-1,next=questions.slice(at+1).find(q=>!completed.includes(q.key))||questions.find(q=>!completed.includes(q.key));return {questions,completed,recommended:next?.key||questions[0]?.key};}
 if(u.pathname==='/api/record'){const relative=u.searchParams.get('path');if(!(await getState()).history.some(r=>r.path===relative))throw Error('记录不存在');return {text:await store.read(relative)};}
 if(u.pathname==='/api/ai/status')return {available:false,message:'离线模式：请导出学习记录发回聊天分析。',model:'gpt-5.6-terra',reasoning_effort:'medium'};
 throw Error('这个操作需要在线服务，离线版请使用导入／导出。');})();}
export function post(url,data){if(url!=='/api/events')return Promise.reject(Error('离线版请导出记录，不连接服务器。'));return serial(async()=>{if(['ai_review','material_upload'].includes(data.kind))throw Error('请使用离线版对应入口');const e=await store.append(data.kind,data.payload,data.id);if(!eventSnapshot.some(x=>x.id===e.id))eventSnapshot.push(e);stateToken='';persist();return e;});}
export const save=(kind,payload,id=crypto.randomUUID())=>post('/api/events',{kind,payload,id});
export {keyOf};
export const typeNames={tc:'Text Completion',se:'Sentence Equivalence',rc:'Reading',quant:'Quant'};
export function download(name,data){const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:name.endsWith('.html')?'text/html;charset=utf-8':'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function materialURL(id){if(!urls.has(id))throw Error('请先到“资料库”选择对应的本机 PDF，再返回本题。');return urls.get(id);}
export async function attachPDF(id,file){const material=(await getState()).materials.find(m=>m.id===id);if(!material)throw Error('请先选择教材');if(file.size>50*1024*1024)throw Error('单个 PDF 最大 50 MB');const head=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());if(head!=='%PDF-')throw Error('请选择有效 PDF');if(material.sha256){const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');if(digest.toLowerCase()!==material.sha256.toLowerCase())throw Error('文件与这份教材的原版不一致，请选择对应 PDF，避免题目页码错位。');}if(urls.has(id))URL.revokeObjectURL(urls.get(id));urls.set(id,URL.createObjectURL(file));attachments.set(material.repo_path,true);stateToken='';}
export function exportHTML(){persist();const clone=document.documentElement.cloneNode(true);clone.querySelector('#root').replaceChildren();clone.querySelector('#offline-restore').textContent=JSON.stringify(backup(true)).replace(/</g,'\\u003c');download('GRE-platform-with-records-'+new Date().toISOString().replace(/[:.]/g,'-')+'.html','<!doctype html>\n'+clone.outerHTML);}
if(!crypto.randomUUID)throw Error('浏览器缺少随机编号支持，请使用较新的 Chrome');
globalThis.addEventListener('pagehide',persist);
