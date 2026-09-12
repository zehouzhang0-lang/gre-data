import { useState } from "react";
import { Header, Icon, Field } from "./components";
import { post } from "./api";
import PdfReader from "./PdfReader";
export default function Library({ state, refresh, notify }) {
  const [selected, setSelected] = useState("text_completion_2000"),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const material =
    state.materials.find((m) => m.id === selected) || state.materials[0];
  const url = material
    ? `/api/material/${material.id}#page=${page}&view=FitH`
    : "";
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("单份PDF最大30MB");
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const event = await post("/api/upload-pdf", {
        filename: file.name,
        content,
      });
      await refresh();
      setSelected(event.payload.id);
      setPage(1);
      notify("PDF已加入资料库，点击同步进度上传到仓库");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        title="资料库"
        description={`${state.materials.length} 份 PDF，随时翻阅。`}
      >
        <label className={`button primary ${busy ? "disabled" : ""}`}>
          <Icon name="upload" />
          {busy ? "正在上传…" : "上传 PDF"}
          <input
            className="file-input"
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
      </Header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="library-layout">
        <nav className="material-list" aria-label="PDF资料">
          {state.materials.map((m) => (
            <button
              key={m.id}
              className={material?.id === m.id ? "active" : ""}
              onClick={() => {
                setSelected(m.id);
                setPage(1);
              }}
            >
              <Icon name="file" />
              <span>
                {m.filename.replace(/\.pdf$/i, "")}
                <small>
                  {m.pages ? `${m.pages} 页` : "新上传"}
                  {!m.available ? " · 本机缺失" : ""}
                </small>
              </span>
            </button>
          ))}
        </nav>
        <section className="panel library-reader">
          {material && (
            <>
              <div className="reader-toolbar">
                <Field label="页码">
                  <input
                    type="number"
                    min="1"
                    max={material.pages || 9999}
                    value={page}
                    onChange={(e) =>
                      setPage(Math.max(1, Number(e.target.value)))
                    }
                  />
                </Field>
                <a href={url} target="_blank" rel="noreferrer">
                  单独打开 PDF ↗
                </a>
              </div>
              {material.available ? (
                <PdfReader
                  material={material.id}
                  page={page}
                  onPage={setPage}
                />
              ) : (
                <p>本机缺少此资料，请先拉取仓库。</p>
              )}
            </>
          )}
        </section>
      </div>
      <p className="footnote">新增 PDF 随进度同步 · 单份最大30MB</p>
    </>
  );
}
