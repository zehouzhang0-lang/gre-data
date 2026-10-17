import { createHash } from "node:crypto";
import { keyOf } from "./store.mjs";

const letters = "ABCDEFGHIJKL";
const ligatures = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };

// Normalize presentation only. In particular, do not use NFKC: it would
// collapse mathematical superscripts and other potentially meaningful symbols.
function text(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC")
    .replace(/\u00ad/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ﬀﬁﬂﬃﬄﬅﬆ]/g, c => ligatures[c])
    .replace(/\s+/gu, " ").trim();
}

function completeContent(question) {
  const prompt = text(question.prompt);
  if (!prompt || prompt.includes("�") || question.native === false) return null;
  if (!Array.isArray(question.options)) return null;
  const options = question.options.map(text);
  if (options.some(option => !option || option.includes("�"))) return null;
  const counts = { se: [6], tc: [5, 6, 9], rc: [3, 5], quant: [4, 5] };
  if (!counts[question.type]?.includes(options.length)) return null;

  // Missing/reordered labels can change the answer's position. Imported text
  // has no labels and follows the standard array order; PDF labels must agree.
  const expectedLetters = [...letters.slice(0, options.length)];
  if (question.letters !== undefined && (!Array.isArray(question.letters)
    || JSON.stringify(question.letters) !== JSON.stringify(expectedLetters))) return null;

  const inferredMode = question.type === "se" ? "pair"
    : question.type === "tc" && options.length > 5 ? "blanks"
      : question.type === "rc" && options.length === 3 ? "multiple"
        : question.type === "quant" && options.length === 4 ? "comparison" : "single";
  const mode = question.mode || inferredMode;
  if (["sentence", "entry"].includes(mode)) return null;
  const groups = mode === "blanks"
    ? Array.from({ length: options.length / 3 }, (_, i) => expectedLetters.slice(i * 3, i * 3 + 3)) : null;
  if (question.groups !== undefined && JSON.stringify(question.groups) !== JSON.stringify(groups)) return null;

  let paragraphs = null;
  if (question.type === "rc") {
    if (!Array.isArray(question.paragraphs) || !question.paragraphs.length) return null;
    paragraphs = question.paragraphs.map(text);
    if (paragraphs.some(paragraph => !paragraph || paragraph.includes("�"))) return null;
  }
  return [question.type, mode, prompt, options, paragraphs];
}

function contentId(question) {
  const content = completeContent(question);
  // Separate namespaces ensure incomplete text can never join a complete
  // content group. The original source key remains the only fallback identity.
  const identity = content
    ? ["gre-practice-content-v1", ...content]
    : ["gre-practice-source-v1", question.type, question.key];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

/** A read-only practice projection; never turns a duplicate into an attempt. */
export function buildPracticeBank({ indexed = [], imported = [], attempts = [], legacy = [], type }) {
  const merged = new Map([...indexed, ...imported]
    .filter(question => question.type === type)
    .map(question => [question.key || keyOf(question), question]));
  const questions = [...merged].map(([key, question]) => {
    const original = { ...question, key };
    return { ...original, content_id: contentId(original) };
  });
  const currentAttempts = attempts.filter(attempt => attempt.type === type);
  const previousAttempts = legacy.filter(attempt => attempt.type === type);
  const completed = [...new Set([...currentAttempts, ...previousAttempts].map(keyOf))];
  const byKey = new Map(questions.map(question => [question.key, question]));
  const completedContentIds = [...new Set(completed
    .map(key => byKey.get(key)?.content_id).filter(Boolean))];
  const done = new Set(completedContentIds);
  const last = currentAttempts[0] || previousAttempts[0];
  const previousIndex = last ? questions.findIndex(question => question.key === keyOf(last)) : -1;
  const unattempted = question => !done.has(question.content_id);
  const next = questions.slice(previousIndex + 1).find(unattempted) || questions.find(unattempted);
  return { questions, completed, completedContentIds, recommended: next?.key ?? null };
}
