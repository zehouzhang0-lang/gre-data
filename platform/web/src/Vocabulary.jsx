import { useDeferredValue, useState } from "react";
import { Header, Icon, Field, Modal, Empty } from "./components";
import { save } from "./api";
export default function Vocabulary({ state, refresh, notify, startRecall }) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [edit, setEdit] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState(null);
  const query = useDeferredValue(search.toLowerCase());
  const words = state.vocabulary.filter(
    (w) =>
      (filter === "deleted" ? w.deleted : !w.deleted) &&
      (filter === "difficult"
        ? w.status === "待复习" || w.recalls.at(-1)?.self_rating === "forgotten"
        : true) &&
      `${w.word} ${w.meaning}`.toLowerCase().includes(query),
  );
  const visible = words.slice(page * 30, page * 30 + 30);
  async function mutate(kind, payload) {
    setBusy(true);
    setError("");
    try {
      await save(kind, payload);
      await refresh();
      notify("生词本已保存");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        title="生词本"
        description={`${state.vocabulary.filter((w) => !w.deleted).length} 个词与短语，来自你的学习记录。`}
      >
        <button disabled={busy || !words.some((w) => !w.deleted)} onClick={() => startRecall(words.filter((w) => !w.deleted))}>
          背诵当前词表
        </button>
        <button
          className="primary"
          onClick={() => setEdit({ word: "", meaning: "", pos: "", note: "" })}
        >
          <Icon name="plus" />
          新增单词
        </button>
      </Header>
      <div className="table-tools">
        <label className="search">
          <Icon name="search" />
          <input
            aria-label="搜索单词或释义"
            placeholder="搜索单词或释义…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="词汇筛选"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">全部词汇</option>
          <option value="difficult">待复习</option>
          <option value="deleted">已移除</option>
        </select>
        <span>{words.length} 项</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="vocab-table">
        <div className="vocab-row table-heading">
          <span>单词 / 短语</span>
          <span>核心义</span>
          <span>操作</span>
        </div>
        {visible.map((w) => (
          <div className="vocab-row" key={w.word}>
            <button className="word-link" onClick={() => setDetail(w)}>
              {w.word}
              <small>
                {w.pos}
                {w.status === "待复习" ? " · 待复习" : ""}
              </small>
            </button>
            <span className="meaning">
              {w.meaning || (
                <span className="muted">尚未整理释义 · 可查看原记录</span>
              )}
            </span>
            <div className="row-actions">
              {w.deleted ? (
                <button
                  disabled={busy}
                  onClick={() => mutate("vocab_restore", w)}
                >
                  恢复
                </button>
              ) : (
                <>
                  <button
                    className="text-button"
                    onClick={() => setEdit({ ...w, existing: true })}
                  >
                    编辑
                  </button>
                  <button
                    className="text-button muted"
                    disabled={busy}
                    onClick={() => mutate("vocab_delete", w)}
                  >
                    移除
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {!words.length && (
        <Empty title="没有匹配的词汇">
          <p>换一个搜索词，或新增单词。</p>
        </Empty>
      )}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          上一页
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(words.length / 30))}
        </span>
        <button
          disabled={(page + 1) * 30 >= words.length}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
      {edit && (
        <Modal
          title={edit.existing ? "编辑单词" : "新增单词"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate("vocab_upsert", edit)) setEdit(null);
            }}
          >
            <Field label="单词 / 短语">
              <input
                required
                readOnly={edit.existing}
                value={edit.word}
                onChange={(e) => setEdit({ ...edit, word: e.target.value })}
              />
            </Field>
            <Field label="核心义">
              <textarea
                required
                value={edit.meaning}
                onChange={(e) => setEdit({ ...edit, meaning: e.target.value })}
              />
            </Field>
            <Field label="词性（可选）">
              <input
                value={edit.pos}
                onChange={(e) => setEdit({ ...edit, pos: e.target.value })}
              />
            </Field>
            <Field label="备注（可选）">
              <textarea
                value={edit.note}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              />
            </Field>
            <small>修改留存历史；新释义标记为用户编辑，待词典核验。</small>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setEdit(null)}>
                取消
              </button>
              <button className="primary" disabled={busy}>
                保存单词
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.word} onClose={() => setDetail(null)}>
          <p className="definition">
            {detail.pos} {detail.meaning || "尚未整理释义"}
          </p>
          <p>{detail.collocation}</p>
          <p>{detail.note}</p>
          <small>{detail.definition_source}</small>
          {detail.feedback && <p>历史批改：{detail.feedback}</p>}
          {detail.dictionary_url &&
            /^https:\/\//.test(detail.dictionary_url) && (
              <p>
                <a
                  href={detail.dictionary_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看词典 ↗
                </a>
              </p>
            )}
          <p>
            平台回忆自评：{detail.recalls.length} 次。自评不直接提升已掌握等级。
          </p>
        </Modal>
      )}
    </>
  );
}
