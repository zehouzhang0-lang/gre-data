import { useRef, useState } from "react";
import { Header, Empty } from "./components";
import { save } from "./api";
import ReviewDashboard from './ReviewDashboard';
import QuestionReview from './QuestionReview';
export default function Recall(props) {
  const [words,setWords]=useState(props.initialWords || null),[questions,setQuestions]=useState(null);
  if(questions)return <QuestionReview {...props} items={questions} onExit={()=>setQuestions(null)}/>;
  if(words)return <WordSession {...props} initialWords={words} onExit={()=>setWords(null)} />;
  return <ReviewDashboard {...props} onWords={setWords} onQuestions={setQuestions}/>;
}
function WordSession({ state, initialWords, refresh, notify, onExit }) {
  const [mode, setMode] = useState("flashcard"),
    [queue] = useState(()=>initialWords.filter(w=>w.meaning||w.feedback).slice(0,20)),
    [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation=useRef(crypto.randomUUID());
  const word = queue?.[index];
  async function rate(self_rating) {
    setBusy(true);
    setError("");
    try {
      await save("vocab_recall", {
        word: word.word,
        answer,
        mode,
        self_rating,
      }, operation.current);
      await refresh();
      operation.current=crypto.randomUUID();
      setIndex((i) => i + 1);
      setRevealed(false);
      setAnswer("");
      notify(self_rating==='forgotten'?'已记录 · 10分钟后再练':self_rating==='partial'?'已记录 · 明天再练':'已记录，下次复习已安排');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header title="记忆与背诵" description="先回忆，再翻面；每次最多20词。"><button disabled={busy} onClick={onExit}>返回今日复习</button></Header>
      {word ? (
        <section className="recall-card">
          <div className="section-heading">
            <span>{mode === "recall" ? "默写回忆" : "翻卡记忆"}</span>
            <span>
              {index + 1} / {queue.length}
            </span>
          </div>
          <progress value={index} max={queue.length} />
          <h2 className="recall-word">{word.word}</h2>
          <small>已复习 {state.spacedReview?.items.find(i=>i.word===word.word)?.review_count || 0} 次</small>
          {!revealed && <button className="text-button" onClick={()=>setMode(m=>m==='recall'?'flashcard':'recall')}>{mode==='recall'?'改用翻卡':'写下释义'}</button>}
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
              operation.current=crypto.randomUUID();
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
          <button onClick={onExit}>查看今日剩余任务</button>
        </Empty>
      )}
    </>
  );
}
