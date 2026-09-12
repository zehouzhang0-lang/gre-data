import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReader({ material, page, onPage }) {
  const container = useRef(null),
    canvas = useRef(null);
  const [document, setDocument] = useState(null),
    [width, setWidth] = useState(500),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setDocument(null);
    setLoading(true);
    setError("");
    let active = true;
    const task = getDocument({
      url: `/api/material/${encodeURIComponent(material)}`,
      isEvalSupported: false,
    });
    task.promise
      .then((pdf) => {
        if (active) setDocument(pdf);
      })
      .catch((e) => {
        if (active) {
          setError(`PDF读取失败：${e.message}`);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      task.destroy();
    };
  }, [material]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document) return;
    let active = true,
      renderTask;
    setLoading(true);
    setError("");
    const n = Math.min(Math.max(1, Number(page) || 1), document.numPages);
    if (n !== page) onPage(n);
    document
      .getPage(n)
      .then(async (pdfPage) => {
        if (!active) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale: (Math.max(100, width - 32) / natural.width) * zoom,
        });
        const ratio = window.devicePixelRatio || 1;
        const node = canvas.current;
        node.width = Math.floor(viewport.width * ratio);
        node.height = Math.floor(viewport.height * ratio);
        node.style.width = `${viewport.width}px`;
        node.style.height = `${viewport.height}px`;
        renderTask = pdfPage.render({
          canvasContext: node.getContext("2d"),
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
        });
        await renderTask.promise;
        if (active) setLoading(false);
      })
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, page, width, zoom]);
  return (
    <div className="pdf-reader" ref={container}>
      <div className="pdf-toolbar">
        <button
          aria-label="PDF上一页"
          disabled={!document || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ←
        </button>
        <span>
          {page} / {document?.numPages || "…"}
        </span>
        <button
          aria-label="PDF下一页"
          disabled={!document || page >= document.numPages}
          onClick={() => onPage(page + 1)}
        >
          →
        </button>
        <select
          aria-label="PDF缩放"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        >
          <option value="1">适合宽度</option>
          <option value="1.3">130%</option>
          <option value="1.6">160%</option>
          <option value="2">200%</option>
        </select>
      </div>
      <div className="pdf-scroll">
        {loading && (
          <span className="pdf-loading" role="status">
            正在加载 PDF…
          </span>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <canvas
          ref={canvas}
          aria-label={`PDF第${page}页`}
          data-loaded={!loading && !error}
          role="img"
        />
      </div>
    </div>
  );
}
