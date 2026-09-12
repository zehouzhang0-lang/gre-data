import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import YAML from "yaml";

export const normalizeWord = (value) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
export const keyOf = (q) => JSON.stringify([q.material, q.unit, q.question]);
const kinds = new Set([
  "vocab_upsert",
  "vocab_delete",
  "vocab_restore",
  "vocab_recall",
  "questions_import",
  "keys_import",
  "attempt",
  "attempts_import",
  "material_upload",
]);
const types = new Set(["tc", "se", "rc", "quant"]);
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
    };
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

export function grade(answer, expected, type) {
  if (!expected) return null;
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
    const p = validate(kind, payload);
    await fs.mkdir(this.eventsDir, { recursive: true });
    const target = path.join(this.eventsDir, `${id}.json`);
    try {
      const prior = JSON.parse(await fs.readFile(target, "utf8"));
      if (
        prior.kind !== kind ||
        JSON.stringify(prior.payload) !== JSON.stringify(p)
      )
        throw new Error("操作编号已被不同内容使用");
      return prior;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
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
  async state() {
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
      attempts = [];
    for (const e of events) {
      const p = e.payload;
      if (e.kind === "vocab_upsert") {
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
    return {
      vocabulary: [...words.values()].sort((a, b) =>
        a.word.localeCompare(b.word),
      ),
      questions: [...questions.values()],
      keys: Object.fromEntries(keys),
      attempts: attempts
        .map((a) => {
          const k = keys.get(keyOf(a));
          return {
            ...a,
            result: grade(a.answer, k?.answer, a.type),
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
          ]),
        )
        .digest("hex"),
    };
  }
}
