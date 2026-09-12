import { useState } from "react";
import { save, download } from "./api";
import { Modal, Field } from "./components";
export default function ImportDialog({ mode, context, onClose, onSaved }) {
  const [raw, setRaw] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(
    mode === "questions" ? "questions_import" : "keys_import",
  );
  const [preview, setPreview] = useState(null);
  const parse = () => {
    let items;
    try {
      const data = JSON.parse(raw);
      items = Array.isArray(data) ? data : data.items;
    } catch {
      if (mode === "questions")
        throw new Error("题目请用JSON数组导入，可下载空白模板");
      items = raw
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((line) => {
          const match = line.match(/^\s*(\S+?)[.、\s]+(.+?)(?:\s*\|\s*(.*))?$/);
          if (!match)
            throw new Error(
              `无法识别这一行：${line.slice(0, 50)}。格式：题号 答案 | 解析`,
            );
          return {
            question: match[1],
            answer: match[2],
            explanation: match[3] || "",
          };
        });
    }
    if (!Array.isArray(items) || !items.length || items.length > 200)
      throw new Error("一次导入1–200项");
    return items.map((q) => ({
      ...context,
      ...q,
      question: String(q.question ?? ""),
      type: q.type || context.type,
    }));
  };
  const inspect = () => {
    try {
      setPreview(parse());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save(target, { items: preview });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={mode === "questions" ? "导入题目" : "上传答案"}
      onClose={onClose}
    >
      <p>
        当前定位：{context.material} / {context.unit}
        。JSON中可逐题指定教材和单元。
      </p>
      {mode !== "questions" && (
        <Field label="上传内容">
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setPreview(null);
            }}
          >
            <option value="keys_import">标准答案与解析（用户提供）</option>
            <option value="attempts_import">我的作答</option>
          </select>
        </Field>
      )}
      <div className="actions">
        <label className="button">
          选择 JSON / TXT
          <input
            className="file-input"
            type="file"
            accept=".json,.txt"
            onChange={async (e) => {
              const f = e.target.files[0];
              if (!f) return;
              if (f.size > 2e6) return setError("文本文件不能超过2MB");
              setRaw(await f.text());
              setPreview(null);
            }}
          />
        </label>
        <button
          onClick={() =>
            download("gre-import-template.json", [
              {
                ...context,
                question: "",
                ...(mode === "questions" ? { prompt: "", options: [] } : {}),
                answer: "",
                explanation: "",
              },
            ])
          }
        >
          下载空白模板
        </button>
      </div>
      <Field
        label={
          mode === "questions"
            ? "题目 JSON"
            : "粘贴内容：每行“题号 答案 | 解析”，也支持 JSON"
        }
      >
        <textarea
          rows={9}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setPreview(null);
          }}
        />
      </Field>
      {preview && (
        <div className="import-preview">
          <strong>将导入 {preview.length} 项</strong>
          {preview.slice(0, 6).map((q, i) => (
            <p key={i}>
              {q.unit} · 第 {q.question || "（缺失）"} 题 —{" "}
              {q.answer || "未提供答案"}
            </p>
          ))}
          <small>上传的答案标记为用户提供；未填解析时保持待补充。</small>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        {preview ? (
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? "正在保存…" : "确认导入"}
          </button>
        ) : (
          <button className="primary" onClick={inspect}>
            检查内容
          </button>
        )}
      </div>
    </Modal>
  );
}
