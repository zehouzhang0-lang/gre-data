import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import YAML from "yaml";
import { validateRelation, projectRelations } from "./word-relations.mjs";
import { legacyWordReviews, projectReview } from "./spaced-review.mjs";
import { readLegacyQuestions } from "./legacy-review.mjs";
import { capturedWord } from "../shared/capture-word.mjs";
import { WORD_STAGES, meaningChoices, drillResult, roundProgress, roundRating } from "../shared/word-session.mjs";

export const normalizeWord = (value) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
export const keyOf = (q) => JSON.stringify([q.material, q.unit, q.question]);
const kinds = new Set([
  "vocab_upsert",
  "vocab_capture",
  "vocab_delete",
  "vocab_restore",
  "vocab_recall",
  "vocab_session", "vocab_drill",
  "questions_import",
  "keys_import",
  "attempt",
  "attempts_import",
  "material_upload",
  "ai_review",
  "topic_upsert", "topic_delete", "topic_restore", "word_topics",
  "relation_upsert", "relation_delete", "relation_restore",
]);
const types = new Set(["tc", "se", "rc", "quant"]);
const uuid = value => {
  if(typeof value!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new Error("无效复习轮次编号");
  return value;
};
const text = (v, name, max = 10000, optional = false) => {
  if (optional && (v === undefined || v === null || v === "")) return "";
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new Error(`${name}不能为空，且不得超过${max}字`);
  return v.trim();
};
function location(p) {
  return {
    material: text(p.material, "教材", 200),
    unit: text(p.unit, "单元", 200),
    question: text(String(p.question ?? ""), "题号", 100),
  };
}
function attempt(p) {
  const seconds = Number(p.duration_seconds);
  return {
    ...location(p),
    type: types.has(p.type) ? p.type : "tc",
    answer: text(p.answer, "作答"),
    duration_seconds:
      Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) : null,
    note: text(p.note, "思路", 10000, true),
  };
}
export function validate(kind, p) {
  if (!kinds.has(kind) || !p || typeof p !== "object")
    throw new Error("不支持的操作");
  const relation = validateRelation(kind, p);
  if (relation) return relation;
  if(kind === "vocab_session") {
    if(!Array.isArray(p.words)||p.words.length<1||p.words.length>20)throw new Error("每轮选择 1–20 个词");
    const words=p.words.map(w=>normalizeWord(text(w,"单词",120)));
    if(new Set(words).size!==words.length || ![1,2].includes(p.meaning_passes))throw new Error("词汇不能重复，认词轮数为 1 或 2");
    return {session_id:uuid(p.session_id),words,meaning_passes:p.meaning_passes};
  }
  if(kind === "vocab_drill") {
    if(!WORD_STAGES.includes(p.stage)||!["correct","incorrect","revealed"].includes(p.result)||!["choice","typing","self_check"].includes(p.response_mode))throw new Error("复习步骤或结果无效");
    return {session_id:uuid(p.session_id),word:normalizeWord(text(p.word,"单词",120)),stage:p.stage,answer:text(p.answer,"本次回答",3000,true),result:p.result,response_mode:p.response_mode};
  }
  if (kind === "vocab_capture") {
    if (!p.source || !types.has(p.source.type)) throw new Error("摘词缺少题目来源");
    return {word:capturedWord(p.word),source:{...location(p.source),type:p.source.type},context:text(p.context,"摘词语境",240,true)};
  }
  if (kind === "ai_review") {
    if (!["attempt", "recent"].includes(p.scope) || !p.result || !/^[a-f0-9]{64}$/.test(p.input_hash)) throw new Error("AI分析记录不完整");
    if (!["supported", "needs_review"].includes(p.result.assessment) || !Array.isArray(p.result.technique_ids)) throw new Error("AI分析结果格式不正确");
    return {
      scope: p.scope, attempt_id: p.scope === "attempt" ? text(p.attempt_id, "作答编号", 120) : null,
      input_hash: p.input_hash, model: text(p.model, "模型", 100), provider: "codex_cli", provisional: true,
      expected_answer: text(p.expected_answer, "生成时参考答案", 1000, true) || null,
      result: { summary: text(p.result.summary, "结论", 2000), evidence: text(p.result.evidence, "证据", 6000), reasoning_gap: text(p.result.reasoning_gap, "推理与错因", 3000), next_action: text(p.result.next_action, "下一步", 3000),
        technique_ids: p.result.technique_ids.slice(0,8).map(id => text(id, "技巧ID", 100)), assessment: p.result.assessment },
    };
  }
  if (kind === "material_upload") {
    if (!/^materials\/uploads\/[0-9a-f-]+\.pdf$/.test(p.repo_path))
      throw new Error("上传路径不合法");
    return {
      id: text(p.id, "资料编号", 100),
      filename: text(p.filename, "文件名", 300),
      repo_path: p.repo_path,
      pages: null,
      answer_status: "external_not_present",
    };
  }
  if (kind.startsWith("vocab_")) {
    const word = normalizeWord(text(p.word, "单词或短语", 120));
    if (kind === "vocab_upsert")
      return {
        word,
        meaning: text(p.meaning, "释义", 3000),
        pos: text(p.pos, "词性", 80, true),
        note: text(p.note, "备注", 3000, true),
      };
    if (kind === "vocab_recall") {
      if(p.mode === "multistage")return {word,mode:"multistage",session_id:uuid(p.session_id)};
      if (!["remembered", "partial", "forgotten"].includes(p.self_rating))
        throw new Error("请选择回忆结果");
      return {
        word,
        answer: text(p.answer, "回忆原文", 3000, true),
        self_rating: p.self_rating,
        assessment: "self_reported",
        mode: p.mode === "recall" ? "recall" : "flashcard",
      };
    }
    return { word };
  }
  if (kind === "attempt") return attempt(p);
  if (!Array.isArray(p.items) || p.items.length < 1 || p.items.length > 200)
    throw new Error("一次导入1–200项");
  const items = p.items.map((item) => {
    if (kind === "attempts_import") return attempt(item);
    const base = location(item);
    if (!types.has(item.type)) throw new Error("题型必须为tc、se、rc或quant");
    const answer = text(
      item.answer,
      "标准答案",
      1000,
      kind === "questions_import",
    );
    const result = {
      ...base,
      type: item.type,
      answer: answer || null,
      explanation: text(item.explanation, "解析", 10000, true),
      answer_source: "user_provided",
      source_ref: text(item.source_ref, "答案来源定位", 500, true),
    };
    if (item.answer_format !== undefined) {
      if (item.answer_format !== "sentence" || item.type !== "rc") throw new Error("选句答案只适用于Reading");
      result.answer_format = "sentence";
    }
    if (kind === "questions_import") {
      result.prompt = text(item.prompt, "题目", 16000);
      result.options = item.options ?? [];
      if (
        !Array.isArray(result.options) ||
        result.options.length > 12 ||
        result.options.some((v) => typeof v !== "string" || v.length > 3000)
      )
        throw new Error("选项须为不超过12项的文本数组");
    }
    return result;
  });
  if (new Set(items.map(keyOf)).size !== items.length)
    throw new Error("导入包含重复题号，请按教材、单元、题号区分");
  return { items };
}

export function grade(answer, expected, type, format) {
  if (!expected) return null;
  // An explicitly sourced sentence is a selection, not a semantic free-text answer.
  if (type === "rc" && format === "sentence") {
    const sentence = v => v.normalize("NFKC").replace(/([a-z])-\s+([a-z])/g, "$1-$2").replace(/\s+/g, " ").trim();
    return sentence(answer) === sentence(expected);
  }
  const clean = (v) =>
    v
      .trim()
      .toUpperCase()
      .replace(/[\s,，/;；、]+/g, "");
  const a = clean(answer),
    b = clean(expected);
  if (/^[A-L]+$/.test(a) && /^[A-L]+$/.test(b)) {
    const canonical = (v) =>
      type === "se" || type === "rc" || type === "quant"
        ? [...new Set(v)].sort().join("")
        : v;
    return canonical(a) === canonical(b);
  }
  // Only compare unambiguous decimal/fraction numeric entries. Free text awaits a coach.
  const number = (v) => {
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/[+-]?\d+(?:\.\d+)?)?$/.test(v))
      return null;
    const [n, d = "1"] = v.split("/");
    const x = Number(n) / Number(d);
    return Number.isFinite(x) ? x : null;
  };
  const x = number(answer.trim()),
    y = number(expected.trim());
  return x !== null && y !== null
    ? Math.abs(x - y) <= 1e-10 * Math.max(1, Math.abs(y))
    : null;
}

export class Store {
  constructor(root) {
    this.root = root;
    this.eventsDir = path.join(root, "platform/events");
  }
  async read(relative, fallback) {
    try {
      return await fs.readFile(path.join(this.root, relative), "utf8");
    } catch (e) {
      if (e.code === "ENOENT" && fallback !== undefined) return fallback;
      throw e;
    }
  }
  async json(relative, fallback = {}) {
    return JSON.parse(await this.read(relative, JSON.stringify(fallback)));
  }
  async yaml(relative, fallback = {}) {
    return YAML.parse(await this.read(relative, YAML.stringify(fallback)));
  }
  async list(relative) {
    try {
      return (await fs.readdir(path.join(this.root, relative))).sort();
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  async events() {
    const files = (await this.list("platform/events")).filter((f) =>
      f.endsWith(".json"),
    );
    return (
      await Promise.all(files.map((f) => this.json(`platform/events/${f}`)))
    ).sort(
      (a, b) =>
        a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id),
    );
  }
  async append(kind, payload, id = randomUUID()) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new Error("无效操作编号");
    let p = validate(kind, payload);
    await fs.mkdir(this.eventsDir, { recursive: true });
    const target = path.join(this.eventsDir, `${id}.json`);
    try {
      const prior = JSON.parse(await fs.readFile(target, "utf8"));
      if (
        prior.kind !== kind ||
        JSON.stringify(validate(kind,prior.payload)) !== JSON.stringify(p)
      )
        throw new Error("操作编号已被不同内容使用");
      return prior;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if(kind === "vocab_session" || kind === "vocab_drill" || kind === "vocab_recall"&&p.mode === "multistage") {
      const events=await this.events(),sessions=events.filter(e=>e.kind==='vocab_session'),existing=sessions.find(e=>e.payload.session_id===p.session_id);
      if(kind === "vocab_session") {
        if(existing) {
          if(JSON.stringify(validate(kind,existing.payload))!==JSON.stringify(p))throw new Error("此轮复习已经开始，请继续原轮次");
          return existing;
        }
        const state=await this.state(),wordMap=new Map(state.vocabulary.filter(w=>!w.deleted&&w.meaning).map(w=>[w.word,w]));
        if(p.words.some(w=>!wordMap.has(w)))throw new Error("请先为本轮单词补齐释义；已移除词不能开始复习");
        p={...p,items:p.words.map(word=>{const w=wordMap.get(word);return {word,meaning:w.meaning,pos:w.pos||'',choices:meaningChoices(w,state.vocabulary,state.relations,p.session_id+word)};})};
      } else {
        if(!existing)throw new Error("找不到复习轮次，请先开始一轮复习");
        const session=existing.payload,drills=events.filter(e=>e.kind==='vocab_drill').map(e=>e.payload),recalls=events.filter(e=>e.kind==='vocab_recall'&&e.payload.mode==='multistage').map(e=>e.payload),progress=roundProgress(session,drills,recalls);
        const item=session.items.find(w=>w.word===p.word);
        if(!item)throw new Error("该词不在本轮复习中");
        if(kind === "vocab_drill") {
          if(!progress.next || progress.next.stage!==p.stage || progress.next.word!==p.word)throw new Error("复习步骤已变化，请刷新后继续");
          const mode=p.stage.startsWith('meaning_')?(item.choices.length?'choice':'self_check'):'typing';
          if(p.response_mode!==mode)throw new Error("此步骤的作答方式不匹配");
          if(p.result==='revealed'&&p.answer)throw new Error("揭晓答案不应附带作答");
          if(p.result!=='revealed'&&mode!=='self_check'&&!p.answer)throw new Error("请先选择或填写答案");
          if(mode==='choice'&&p.result!=='revealed'&&!item.choices.some(c=>c.word===p.answer))throw new Error("请选择本题提供的释义");
          const result=drillResult(item,p);
          if(result!==p.result)throw new Error("回答与核对结果不一致");
          p={...p,assessment:mode==='self_check'?'self_reported':'locally_checked'};
        } else {
          const prior=events.find(e=>e.kind==='vocab_recall'&&e.payload.mode==='multistage'&&e.payload.session_id===p.session_id&&e.payload.word===p.word);
          if(prior)return prior;
          if(!progress.ready_words.includes(p.word))throw new Error("完成所有步骤后才能记作一轮复习");
          p={...p,answer:drills.filter(d=>d.session_id===p.session_id&&d.word===p.word&&d.stage==='spelling').at(-1)?.answer||'',self_rating:roundRating(session,p.word,drills),assessment:drills.some(d=>d.session_id===p.session_id&&d.word===p.word&&d.response_mode==='self_check')?'mixed':'locally_checked'};
        }
      }
    }
    if (kind === "relation_upsert" || kind === "word_topics" || kind === "topic_upsert") {
      const state = await this.state();
      const available = new Set(state.vocabulary.filter(w => !w.deleted).map(w => w.word));
      if (kind === "relation_upsert" && p.members.some(m => !available.has(m.word))) throw new Error("请先将词组中的词加入生词本；已移除词需先恢复");
      if (kind === "word_topics" && (!available.has(p.word) || p.topics.some(id => !state.relations.topics.some(t => t.id === id && !t.deleted)))) throw new Error("单词或主题已不存在，请刷新后重新选择");
      if (kind === "topic_upsert" && state.relations.topics.some(t => !t.deleted && t.id !== p.id && t.name === p.name)) throw new Error("已有同名主题");
    }
    // Serial local writes must retain causal order even within one clock millisecond.
    const previous = (await this.events()).at(-1);
    const timestamp = Math.max(
      Date.now(),
      previous ? Date.parse(previous.recorded_at) + 1 : 0,
    );
    const event = {
      schema_version: 1,
      id,
      recorded_at: new Date(timestamp).toISOString(),
      kind,
      payload: p,
    };
    const temp = path.join(this.eventsDir, `.${id}.tmp`);
    await fs.writeFile(temp, JSON.stringify(event, null, 2) + "\n", {
      flag: "wx",
    });
    await fs.rename(temp, target);
    return event;
  }
  async state(now = new Date()) {
    const [
      lexicon,
      homework,
      fill,
      difficult,
      mastered,
      catalog,
      events,
      profileText,
    ] = await Promise.all([
      this.json("vocab/lexicon.json", { items: [] }),
      this.json("vocab/homework/20260910_2014_all_vocab_review.json", {
        items: [],
        counts: {},
      }),
      this.json("vocab/homework/20260907_0022_fill_vocab.json", { items: [] }),
      this.yaml("vocab/difficult.yaml", { items: [] }),
      this.yaml("vocab/mastered.yaml", { items: [] }),
      this.yaml("materials/catalog.yaml", { materials: [] }),
      this.events(),
      this.read("profile.md", ""),
    ]);
    const words = new Map();
    for (const item of [...homework.items, ...fill.items, ...lexicon.items]) {
      const word = normalizeWord(item.word);
      const old = words.get(word) || {
        word,
        meaning: "",
        pos: "",
        note: "",
        deleted: false,
        status: "未检验",
        recalls: [],
      };
      words.set(word, {
        ...old,
        meaning: item.meaning || old.meaning,
        pos: item.pos || old.pos,
        note: item.note || old.note,
        original_context: item.original_context || old.original_context || "",
        sources: item.sources?.map(({material_id,record,kind,origin_word})=>({material_id,record,kind,origin_word})) || old.sources || [],
        collocation: item.collocation || old.collocation || "",
        dictionary_url:
          item.dictionary_url ||
          item.definition_sources?.[0]?.url ||
          old.dictionary_url ||
          "",
        definition_source: item.definition_sources
          ? "既有词库核验"
          : old.definition_source ||
            (item.meaning ? "既有作业释义" : "尚未补充释义"),
      });
    }
    for (const [pool, status] of [
      [difficult, "待复习"],
      [mastered, "已掌握"],
    ])
      for (const item of pool.items || []) {
        const w = words.get(normalizeWord(item.word));
        if (w)
          Object.assign(w, {
            status,
            review_count: item.review_count ?? 0,
            correct_streak: item.correct_streak ?? 0,
          });
      }
    for (const group of [
      ...(homework.groups || []),
      ...(homework.retests || []),
    ])
      for (const response of group.responses || []) {
        const w = words.get(normalizeWord(response.word));
        if (
          w &&
          response.note &&
          !/^(有效核心义|核心义正确|接受[。；]|正确[。；])/.test(response.note)
        )
          w.feedback = response.note;
      }
    const questions = new Map(),
      keys = new Map(),
      attempts = [], reviews = [], vocabSessions = [], vocabDrills = [], sessionRecalls = [], recalledRounds = new Set();
    for (const e of events) {
      const p = e.payload;
      if(e.kind==='vocab_session'&&!vocabSessions.some(s=>s.session_id===p.session_id))vocabSessions.push({...p,id:e.id,recorded_at:e.recorded_at});
      if(e.kind==='vocab_drill')vocabDrills.push({...p,id:e.id,recorded_at:e.recorded_at});
      if (e.kind === "ai_review") reviews.push({ ...p, id: e.id, recorded_at: e.recorded_at });
      if (e.kind === "vocab_capture") {
        const old=words.get(p.word) || {word:p.word,meaning:"",pos:"",note:"",status:"未检验",recalls:[],collocation:"",dictionary_url:"",definition_source:"题中摘词，待补释义"};
        const captures=[...(old.captures || [])];
        if (!captures.some(c => keyOf(c.source)===keyOf(p.source) && c.context===p.context)) captures.push({source:p.source,context:p.context,recorded_at:e.recorded_at});
        words.set(p.word,{...old,deleted:false,captures});
      } else if (e.kind === "vocab_upsert") {
        const old = words.get(p.word) || {
          status: "未检验",
          recalls: [],
          collocation: "",
          dictionary_url: "",
        };
        words.set(p.word, {
          ...old,
          ...p,
          deleted: false,
          definition_source: "用户编辑，待词典核验",
        });
      } else if (e.kind === "vocab_delete" || e.kind === "vocab_restore") {
        if (words.has(p.word))
          words.get(p.word).deleted = e.kind === "vocab_delete";
      } else if (e.kind === "vocab_recall") {
        if(p.mode==='multistage') {
          const roundKey=JSON.stringify([p.session_id,p.word]);
          if(recalledRounds.has(roundKey))continue;
          recalledRounds.add(roundKey);sessionRecalls.push({...p,id:e.id,recorded_at:e.recorded_at});
        }
        words.get(p.word)?.recalls.push({ ...p, recorded_at: e.recorded_at });
      } else if (e.kind === "questions_import" || e.kind === "keys_import") {
        for (const q of p.items) {
          const k = keyOf(q);
          if (e.kind === "questions_import") questions.set(k, { ...q, key: k });
          if (q.answer) keys.set(k, { ...q, event_id: e.id });
        }
      } else if (e.kind === "attempt")
        attempts.push({ ...p, id: e.id, recorded_at: e.recorded_at });
      else if (e.kind === "attempts_import")
        p.items.forEach((a, i) =>
          attempts.push({
            ...a,
            id: `${e.id}-${i}`,
            recorded_at: e.recorded_at,
          }),
        );
    }
    const materials = [
      ...(catalog.materials || []).filter(
        (m) => m.repo_path && m.filename?.endsWith(".pdf"),
      ),
      ...events
        .filter((e) => e.kind === "material_upload")
        .map((e) => e.payload),
    ];
    await Promise.all(
      materials.map(async (m) => {
        m.available = await fs.access(path.join(this.root, m.repo_path)).then(
          () => true,
          () => false,
        );
      }),
    );
    const history = [];
    for (const dir of [
      "verbal/submissions",
      "quant/submissions",
      "analytical-writing/submissions",
      "vocab/homework",
    ]) {
      for (const file of await this.list(dir))
        if (file.endsWith(".md"))
          history.push({
            path: `${dir}/${file}`,
            name: file.replace(".md", ""),
          });
    }
    const profile = YAML.parse(
      profileText.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] || "{}",
    );
    const relationSeed = await this.json("vocab/relations.json", { topics: [], groups: [] });
    const relations = projectRelations([...words.values()], relationSeed, events);
    const legacyQuestions = await readLegacyQuestions(this);
    const spacedReview = projectReview({ vocabulary:[...words.values()], legacyWords:legacyWordReviews({homework,lexicon,difficult,mastered}), legacyQuestions, events, grade, now, timeZone:profile.timezone || 'Asia/Shanghai' });
    return {
      vocabSessions: vocabSessions.map(session=>{
        const progress=roundProgress(session,vocabDrills,sessionRecalls);
        return {...session,...progress,completed_at:progress.complete?sessionRecalls.filter(r=>r.session_id===session.session_id).at(-1)?.recorded_at||null:null};
      }).reverse(),
      vocabDrills: vocabDrills,
      spacedReview,
      relations,
      vocabulary: [...words.values()].sort((a, b) =>
        a.word.localeCompare(b.word),
      ),
      questions: [...questions.values()],
      keys: Object.fromEntries(keys),
      reviews: reviews.reverse(),
      attempts: attempts
        .map((a) => {
          const k = keys.get(keyOf(a));
          return {
            ...a,
            result: grade(a.answer, k?.answer, a.type, k?.answer_format),
            expected: k?.answer || null,
            explanation: k?.explanation || "",
            answer_source: k?.answer_source || "unavailable",
          };
        })
        .reverse(),
      events: events
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          recorded_at: e.recorded_at,
          word: e.payload.word,
          count: e.payload.items?.length,
          session_id:e.payload.session_id,
          stage:e.payload.stage,
          result:e.payload.result,
          self_rating:e.payload.self_rating,
          mode:e.payload.mode,
          assessment:e.payload.assessment,
        }))
        .reverse(),
      history: history.sort((a, b) => b.name.localeCompare(a.name)),
      materials,
      counts: homework.counts,
      target: profile.target?.combined_vq ?? null,
      pending: homework.retests?.find((r) => r.id === "after_group15") || null,
      revision: createHash("sha256")
        .update(
          JSON.stringify([
            lexicon,
            homework,
            fill,
            difficult,
            mastered,
            catalog,
            events,
            profileText,
            history,
            relationSeed,
            legacyQuestions,
            Math.floor(+new Date(now) / 60000),
          ]),
        )
        .digest("hex"),
    };
  }
}
