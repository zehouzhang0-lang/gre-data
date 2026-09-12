import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { request, post } from "./api";
import { Icon } from "./components";
import Practice from "./Practice";
import Vocabulary from "./Vocabulary";
import Recall from "./Recall";
import Library from "./Library";
import History from "./History";
import "./styles.css";
function App() {
  const [state, setState] = useState(null),
    [page, setPage] = useState("practice"),
    [error, setError] = useState(""),
    [syncError, setSyncError] = useState(""),
    [toast, setToast] = useState(""),
    [syncing, setSyncing] = useState(false),
    [recallWords, setRecallWords] = useState(null);
  const revision = useRef("");
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const data = await request(`/api/state?revision=${revision.current}`);
    if (sequence !== refreshSequence.current) return;
    if (!data.unchanged) {
      revision.current = data.revision;
      setState(data);
    }
    setError("");
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(
      () =>
        refresh().catch(() =>
          setError("本地服务暂时不可用，未保存的内容请保留，服务恢复后重试。"),
        ),
      5000,
    );
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function sync() {
    setSyncing(true);
    try {
      const result = await post("/api/sync", {});
      setSyncError("");
      await refresh();
      setToast(result.message);
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  }
  const nav = [
    ["practice", "file", "刷题练习"],
    ["library", "folder", "资料库"],
    ["vocab", "book", "生词本"],
    ["recall", "cards", "记忆与背诵"],
    ["history", "history", "学习记录"],
  ];
  const props = { state, refresh, notify: setToast };
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <strong>GRE</strong>
          <span>学习工作台</span>
        </div>
        <nav aria-label="主导航">
          {nav.map(([id, icon, name]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setPage(id);
                if (id === "recall") setRecallWords(null);
              }}
            >
              <Icon name={icon} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="target">
            <span>目标分数</span>
            <strong>{state?.target ?? "—"}</strong>
          </div>
          <button className="sync-button" disabled={syncing} onClick={sync}>
            <Icon name="sync" />
            {syncing ? "正在同步…" : "同步进度"}
          </button>
          <small>本地保存 · GitHub 同步</small>
        </div>
      </aside>
      <main>
        {syncError && (
          <div className="error-banner" role="alert">
            <div><span>本次同步未完成，本地记录仍保留。</span><details><summary>查看原因</summary><p>{syncError}</p></details></div>
            <button disabled={syncing} onClick={sync}>{syncing ? "正在同步…" : "重试同步"}</button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => refresh().catch((e) => setError(e.message))}>
              重新连接
            </button>
          </div>
        )}
        {!state ? (
          <div className="loading">正在读取 GRE 项目…</div>
        ) : (
          <>
            {page === "practice" && <Practice {...props} />}{" "}
            {page === "library" && <Library {...props} />}{" "}
            {page === "vocab" && (
              <Vocabulary
                {...props}
                startRecall={(words) => {
                  setRecallWords(words);
                  setPage("recall");
                }}
              />
            )}{" "}
            {page === "recall" && (
              <Recall {...props} initialWords={recallWords} />
            )}{" "}
            {page === "history" && <History {...props} />}
          </>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
