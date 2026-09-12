import { useState } from "react";
import { Header, Empty, Field } from "./components";
import { save } from "./api";
export default function Recall({ state, initialWords, refresh, notify }) {
  const [mode, setMode] = useState("recall"),
    [scope, setScope] = useState("difficult"),
    [queue, setQueue] = useState(null),
    [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const candidates =
    initialWords ||
    state.vocabulary.filter(
      (w) =>
        !w.deleted &&
        (scope === "all" ||
          w.status === "待复习" ||
          w.recalls.at(-1)?.self_rating === "forgotten"),
    );
  const word = queue?.[index];
  const start = () => {
    setQueue(
      candidates
        .filter((w) => w.meaning || w.feedback)
        .map(
          (w) =>
            state.vocabulary.find((current) => current.word === w.word) || w,
        )
        .sort((a, b) =>
          (a.recalls.at(-1)?.recorded_at || "").localeCompare(
            b.recalls.at(-1)?.recorded_at || "",
          ),
        )
        .slice(0, 20),
    );
    setIndex(0);
    setAnswer("");
    setRevealed(false);
  };
  async function rate(self_rating) {
    setBusy(true);
    setError("");
    try {
      await save("vocab_recall", {
        word: word.word,
        answer,
        mode,
        self_rating,
      });
      await refresh();
      setIndex((i) => i + 1);
      setRevealed(false);
      setAnswer("");
      notify("回忆自评已记录");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header title="记忆与背诵" description="先回忆，再翻面；每次最多20词。" />
      {!queue ? (
        <section className="recall-setup">
          <div className="tabs">
            <button
              className={mode === "recall" ? "selected" : ""}
              onClick={() => setMode("recall")}
            >
              默写回忆
            </button>
            <button
              className={mode === "flashcard" ? "selected" : ""}
              onClick={() => setMode("flashcard")}
            >
              翻卡记忆
            </button>
          </div>
          <h2>给记忆一次独立作答的机会</h2>
          <p>
            {initialWords
              ? "使用生词本中选出的词表。"
              : "从待复习词汇开始，也可以选择全部词汇。"}
          </p>
          {!initialWords && (
            <Field label="词表范围">
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="difficult">待复习词汇</option>
                <option value="all">全部词汇</option>
              </select>
            </Field>
          )}
          <button className="primary" onClick={start}>
            开始{" "}
            {Math.min(
              20,
              candidates.filter((w) => w.meaning || w.feedback).length,
            )}{" "}
            词练习 →
          </button>
          <small>未整理释义的词暂不用于翻卡。原640词主序停点保持不变。</small>
        </section>
      ) : word ? (
        <section className="recall-card">
          <div className="section-heading">
            <span>{mode === "recall" ? "默写回忆" : "翻卡记忆"}</span>
            <span>
              {index + 1} / {queue.length}
            </span>
          </div>
          <progress value={index} max={queue.length} />
          <h2 className="recall-word">{word.word}</h2>
          {mode === "recall" && (
            <textarea
              aria-label="回忆的中文义"
              placeholder="写下你回忆出的中文义…"
              value={answer}
              readOnly={revealed}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}
          {!revealed ? (
            <button className="primary" onClick={() => setRevealed(true)}>
              显示释义
            </button>
          ) : (
            <>
              <div className="revealed">
                <p>
                  {word.pos} {word.meaning || word.feedback}
                </p>
                {word.meaning && <small>{word.collocation}</small>}
                <small>
                  {word.meaning
                    ? word.definition_source
                    : "历史批改，含当时纠正说明"}
                </small>
              </div>
              <div className="rating-actions">
                <button disabled={busy} onClick={() => rate("forgotten")}>
                  忘记了
                </button>
                <button disabled={busy} onClick={() => rate("partial")}>
                  不够准确
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => rate("remembered")}
                >
                  记得
                </button>
              </div>
            </>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setIndex((i) => i + 1);
              setAnswer("");
              setRevealed(false);
            }}
          >
            跳过，不记作答
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <small>自评用于安排复习，教练核对后再更新掌握证据。</small>
        </section>
      ) : (
        <Empty title={queue.length ? "本组已结束" : "暂无可练习的词汇"}>
          <p>已作答的自评保存在学习记录中。</p>
          <button onClick={() => setQueue(null)}>选择下一组</button>
        </Empty>
      )}
    </>
  );
}
