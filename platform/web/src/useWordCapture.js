import {useEffect,useRef,useState} from 'react';
import {save} from './api';
import {capturedWord} from '../../shared/capture-word.mjs';

const sourceFor=node=>(node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement)?.closest('[data-word-source]');
function selectionIn(root) {
  const selection=window.getSelection();
  if(!selection || selection.isCollapsed || !selection.rangeCount)return null;
  const range=selection.getRangeAt(0),source=sourceFor(range.startContainer);
  if(!source || !root?.contains(source) || sourceFor(range.endContainer)!==source)return null;
  return {selection,range,source,text:selection.toString()};
}
export default function useWordCapture({root,question,vocabulary,refresh,notify}) {
  const [enabled,setEnabled]=useState(false),[saving,setSaving]=useState(false);
  const pending=useRef(false),retry=useRef(null);
  useEffect(()=>{window.getSelection()?.removeAllRanges();retry.current=null;},[question?.key]);
  useEffect(()=>{
    if(!enabled)return;
    const escape=e=>{if(e.key==='Escape'){setEnabled(false);window.getSelection()?.removeAllRanges();}};
    document.addEventListener('keydown',escape);
    return ()=>document.removeEventListener('keydown',escape);
  },[enabled]);
  function toggle(){setEnabled(v=>!v);window.getSelection()?.removeAllRanges();}
  function mouseDown(event) {
    // Keep the existing highlight when the secondary button is pressed.
    if(enabled && event.button===2 && sourceFor(event.target) && selectionIn(root.current))event.preventDefault();
  }
  async function contextMenu(event) {
    if(!enabled || !question || !sourceFor(event.target))return;
    const selected=selectionIn(root.current);
    if(!selected || sourceFor(event.target)!==selected.source)return;
    event.preventDefault();event.stopPropagation();
    if(pending.current)return;
    let word;
    try {word=capturedWord(selected.text);}catch(e){notify(e.message);return;}
    const existing=vocabulary.find(w=>w.word===word);
    if(existing && !existing.deleted){notify(`${word} 已在生词本中`);return;}
    const raw=selected.source.textContent.replace(/\s+/g,' ').trim();
    const prefix=document.createRange();prefix.selectNodeContents(selected.source);prefix.setEnd(selected.range.startContainer,selected.range.startOffset);
    const offset=prefix.toString().replace(/\s+/g,' ').trimStart().length;
    const context=raw.slice(Math.max(0,offset-65),Math.max(0,offset-65)+220);
    const payload={word,context,source:{material:question.material,unit:question.unit,question:question.question,type:question.type}};
    const signature=JSON.stringify(payload);
    if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()};
    pending.current=true;setSaving(true);
    try {
      await save('vocab_capture',payload,retry.current.id);
      await refresh();retry.current=null;
      selected.selection.removeAllRanges();
      notify(`${word} ${existing?.deleted?'已重新收入':'已收入'}生词本${existing?.meaning?'':' · 待补释义'}`);
    }catch(e){notify(`未完成收录：${e.message}。保留选中内容，可右键重试。`);}
    finally{pending.current=false;setSaving(false);}
  }
  return {enabled,saving,toggle,mouseDown,contextMenu};
}
