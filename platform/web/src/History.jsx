import { useState } from "react";
import { Header, Modal, Empty } from "./components";
import { request, download, typeNames } from "./api";
const labels = {
  vocab_recall: "词汇回忆自评",
  vocab_upsert: "编辑生词",
  vocab_delete: "移除生词",
  vocab_restore: "恢复生词",
  questions_import: "导入题目",
  keys_import: "导入答案与解析",
  attempts_import: "上传作答",
  attempt: "答题",
  material_upload: "上传 PDF",
};
export default function History({ state }) {
  const [tab, setTab] = useState("attempts"),
    [record, setRecord] = useState(null),
    [search, setSearch] = useState("");
  async function open(r) {
    try {
      const data = await request(
        `/api/record?path=${encodeURIComponent(r.path)}`,
      );
      setRecord({ title: r.name, text: data.text });
    } catch (e) {
      setRecord({ title: "读取失败", text: e.message });
    }
  }
  return (
    <>
      <Header title="学习记录" description="保存原始作答，让每次复盘有据可查。">
        <button
          onClick={() =>
            download("gre-workbench-export.json", {
              schema_version: 1,
              exported_at: new Date().toISOString(),
              attempts: state.attempts,
              vocabulary_recalls: state.vocabulary.flatMap((w) => w.recalls),
              events: state.events,
            })
          }
        >
          导出记录
        </button>
      </Header>
      <div className="tabs">
        {[
          ["attempts", "平台作答"],
          ["events", "操作与自评"],
          ["legacy", "历史训练"],
        ].map(([key, name]) => (
          <button
            className={tab === key ? "selected" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "attempts" &&
        (!state.attempts.length ? (
          <Empty title="还没有平台作答">
            <p>保存答案后，会在这里保留题号、原答案和核对结果。</p>
          </Empty>
        ) : (
          <div className="record-list">
            {state.attempts.map((a) => (
              <article className="record" key={a.id}>
                <div className="section-heading">
                  <strong>
                    {typeNames[a.type]} · {a.unit} · 第 {a.question} 题
                  </strong>
                  <span className={a.result === false ? "error" : "result"}>
                    {a.result === null
                      ? "待核对"
                      : a.result
                        ? "答案一致"
                        : "答案不一致"}
                  </span>
                </div>
                <small>
                  {a.material} ·{" "}
                  {new Date(a.recorded_at).toLocaleString("zh-CN")}
                  {a.duration_seconds
                    ? ` · ${Math.round(a.duration_seconds)}秒`
                    : ""}
                </small>
                <p>
                  我的答案：{a.answer}
                  {a.expected ? `　参考答案：${a.expected}` : ""}
                </p>
                {a.note && <p>思路：{a.note}</p>}
                <details>
                  <summary>解析</summary>
                  <p>{a.explanation || "尚未提供解析。"}</p>
                  <small>
                    答案来源：
                    {a.answer_source === "user_provided"
                      ? "用户提供"
                      : "尚无依据"}
                  </small>
                </details>
              </article>
            ))}
          </div>
        ))}
      {tab === "events" &&
        (!state.events.length ? (
          <Empty title="还没有平台操作记录" />
        ) : (
          <div className="record-list">
            {state.events.map((e) => (
              <div className="event-row" key={e.id}>
                <strong>
                  {labels[e.kind]}
                  {e.word ? ` · ${e.word}` : ""}
                  {e.count ? ` · ${e.count}项` : ""}
                </strong>
                <small>{new Date(e.recorded_at).toLocaleString("zh-CN")}</small>
              </div>
            ))}
          </div>
        ))}
      {tab === "legacy" && (
        <>
          <input
            className="history-search"
            placeholder="搜索日期或训练名称…"
            aria-label="搜索历史记录"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="record-list">
            {state.history
              .filter((r) => r.name.includes(search))
              .map((r) => (
                <button
                  className="legacy-row"
                  key={r.path}
                  onClick={() => open(r)}
                >
                  <span>{r.name}</span>
                  <span>查看原记录 ↗</span>
                </button>
              ))}
          </div>
        </>
      )}
      {record && (
        <Modal title={record.title} onClose={() => setRecord(null)}>
          <pre className="record-text">{record.text}</pre>
        </Modal>
      )}
    </>
  );
}
