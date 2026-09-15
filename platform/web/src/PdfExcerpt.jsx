import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;

export function useSourcePdf(material) {
  const [result, setResult] = useState({ pdf: null, error: "" });
  useEffect(() => {
    setResult({ pdf: null, error: "" });
    if (!material) return;
    let active = true, task;
    const controller = new AbortController();
    // Local files load once. Owning fetch cancellation prevents PDF range-reader
    // promises from outliving the component when the learner switches books.
    (async () => {
      const response = await fetch(`/api/material/${encodeURIComponent(material)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("教材读取失败");
      const data = new Uint8Array(await response.arrayBuffer());
      if (!active) return;
      task = getDocument({ data, isEvalSupported: false, verbosity: 0 });
      const pdf = await task.promise;
      if (active) setResult({ pdf, error: "" });
    })().catch(error => { if (active) setResult({ pdf: null, error: error.message }); });
    return () => { active = false; controller.abort(); task?.destroy().catch(() => {}); };
  }, [material]);
  return result;
}
function SelectableText({pdf,region,width}) {
  const container=useRef(null),[message,setMessage]=useState('');
  const scale=width/(region.right-region.left);
  useEffect(()=>{
    let active=true,layer;
    const node=container.current;node.replaceChildren();setMessage('');
    (async()=>{
      const page=await pdf.getPage(region.page),content=await page.getTextContent();
      if(!active)return;
      const natural=page.getViewport({scale:1});
      const items=content.items.filter(item=>{
        if(!item.str)return false;
        const [x,y]=natural.convertToViewportPoint(item.transform[4],item.transform[5]);
        return x+item.width>region.left && x<region.right && y>region.top && y-item.height<region.bottom;
      });
      if(!items.length){setMessage('该区域没有可选文字');return;}
      layer=new TextLayer({textContentSource:{...content,items},container:node,viewport:page.getViewport({scale})});
      await layer.render();
    })().catch(error=>{if(active&&error.name!=='AbortException')setMessage('文字选择暂不可用，原题仍可阅读');});
    return ()=>{active=false;layer?.cancel();node.replaceChildren();};
  },[pdf,region,width]);
  return <><div ref={container} className="capture-pdf-text" data-word-source style={{left:-region.left*scale,top:-region.top*scale,'--total-scale-factor':scale,'--scale-round-x':'1px','--scale-round-y':'1px'}}/>{message&&<small className="capture-pdf-message">{message}</small>}</>;
}
function Slice({ pdf, region, label, selectable }) {
  const box = useRef(null), canvas = useRef(null);
  const [width, setWidth] = useState(600), [status, setStatus] = useState("loading");
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true, task;
    setStatus("loading");
    pdf.getPage(region.page).then(async page => {
      if (!active) return;
      const scale = width / (region.right - region.left);
      const ratio = window.devicePixelRatio || 1;
      const node = canvas.current;
      node.width = Math.ceil(width * ratio);
      node.height = Math.ceil((region.bottom - region.top) * scale * ratio);
      node.style.width = "100%";
      node.style.height = `${node.height / ratio}px`;
      task = page.render({ canvasContext: node.getContext("2d"), viewport: page.getViewport({ scale }),
        transform: [ratio, 0, 0, ratio, -region.left * scale * ratio, -region.top * scale * ratio] });
      await task.promise;
      if (active) {
        setStatus("ready");
        const scroll = box.current.closest(".quant-source");
        if (scroll && box.current === scroll.firstElementChild && region.focusTop !== undefined)
          scroll.scrollTop = Math.max(0, (region.focusTop - region.top) * scale - 24);
      }
    }).catch(error => { if (active && error.name !== "RenderingCancelledException") setStatus(error.message); });
    return () => { active = false; task?.cancel(); };
  }, [pdf, region, width]);
  return <div ref={box} className="pdf-excerpt">
    {status === "loading" && <span className="source-loading" role="status">正在呈现原题…</span>}
    {!['ready', 'loading'].includes(status) && <p role="alert">原题显示失败：{status}</p>}
    <canvas ref={canvas} role="img" aria-label={label} data-loaded={status === "ready"} />
    {selectable && status==='ready' && <SelectableText pdf={pdf} region={region} width={width}/>}
    {region.focusTop !== undefined && <div className="source-focus" aria-hidden="true" style={{ top: (region.focusTop - region.top) * width / (region.right - region.left), height: (region.focusBottom - region.focusTop) * width / (region.right - region.left) }} />}
  </div>;
}
export default function PdfExcerpt({ pdf, regions, label, selectable=false }) {
  if (!pdf) return <p className="source-loading">正在读取教材…</p>;
  return regions.map((region, index) => <Slice key={`${region.page}-${index}`} pdf={pdf} region={region} label={label} selectable={selectable} />);
}
