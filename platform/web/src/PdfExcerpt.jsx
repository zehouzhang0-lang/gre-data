import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
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
function Slice({ pdf, region, label }) {
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
    {region.focusTop !== undefined && <div className="source-focus" aria-hidden="true" style={{ top: (region.focusTop - region.top) * width / (region.right - region.left), height: (region.focusBottom - region.focusTop) * width / (region.right - region.left) }} />}
  </div>;
}
export default function PdfExcerpt({ pdf, regions, label }) {
  if (!pdf) return <p className="source-loading">正在读取教材…</p>;
  return regions.map((region, index) => <Slice key={`${region.page}-${index}`} pdf={pdf} region={region} label={label} />);
}
