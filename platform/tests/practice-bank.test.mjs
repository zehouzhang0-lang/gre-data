import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPracticeBank } from "../server/practice-bank.mjs";
import { keyOf } from "../server/store.mjs";

function question(unit, overrides = {}) {
  const q = {
    material: "test_material", unit, question: "4", type: "se",
    prompt: "The tone was _____.", options: ["calm", "quiet", "loud", "sharp", "new", "old"],
    ...overrides,
  };
  return { ...q, key: keyOf(q) };
}
const attempt = q => ({ material: q.material, unit: q.unit, question: q.question, type: q.type, answer: "AB" });
const bank = (indexed, rest = {}) => buildPracticeBank({ indexed, type: "se", ...rest });

test("same content skips later source locations without changing their original keys or history", () => {
  const first = question("test1"), duplicate = question("test2"), next = question("test3", { prompt: "A different tone was _____." });
  const input = { indexed: [first, duplicate, next], attempts: [attempt(first)], type: "se" };
  const before = structuredClone(input);
  const result = buildPracticeBank(input);
  assert.equal(result.questions.length, 3);
  assert.deepEqual(result.questions.map(q => q.key), input.indexed.map(q => q.key));
  assert.equal(result.questions[0].content_id, result.questions[1].content_id);
  assert.match(result.questions[0].content_id, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.completed, [first.key]);
  assert.deepEqual(result.completedContentIds, [result.questions[0].content_id]);
  assert.equal(result.recommended, next.key);
  assert.deepEqual(input, before);
  assert.equal(first.content_id, undefined);
});

test("presentation whitespace, Unicode quotes, canonical accents and ligatures normalize, but original text is retained", () => {
  const first = question("one", { prompt: "The ‘ﬁnal’ café was _____." });
  const second = question("two", { prompt: "  The 'final' cafe\u0301\u00a0was\n_____.  ", options: [" calm\t", "quiet", "loud", "sharp", "new", "old"] });
  const result = bank([first, second]);
  assert.equal(result.questions[0].content_id, result.questions[1].content_id);
  assert.equal(result.questions[0].prompt, first.prompt);
  assert.equal(result.questions[1].prompt, second.prompt);
});

test("case, semantic punctuation, negation and mathematical symbols are not discarded", () => {
  const prompts = ["X is x².", "x is x².", "X is x2.", "X is x²?", "X is not x².", "X—is x².", "X-is x²."];
  const result = bank(prompts.map((prompt, i) => question(String(i), { prompt })));
  assert.equal(new Set(result.questions.map(q => q.content_id)).size, prompts.length);
});

test("choice order and differing answer labels cannot be merged", () => {
  const first = question("first"), reordered = question("reordered", { options: [...first.options].reverse() });
  const missingLabel = question("missing-label", { letters: ["A", "B", "C", "D", "F", "G"] });
  const shiftedLabel = question("shifted-label", { letters: ["B", "A", "C", "D", "E", "F"] });
  const result = bank([first, reordered, missingLabel, shiftedLabel], { attempts: [attempt(first)] });
  assert.equal(new Set(result.questions.map(q => q.content_id)).size, 4);
  assert.equal(result.recommended, reordered.key);
});

test("same labels, blank groups and derived mode match an imported text question", () => {
  const first = question("indexed", { type: "tc", mode: "blanks", native: true,
    letters: ["A", "B", "C", "D", "E", "F"], groups: [["A", "B", "C"], ["D", "E", "F"]] });
  const second = question("imported", { type: "tc" });
  const result = bank([first], { imported: [second], type: "tc" });
  assert.equal(result.questions[0].content_id, result.questions[1].content_id);
  const badGroups = question("bad-groups", { ...second, unit: "bad-groups", groups: [["A", "D", "E"], ["B", "C", "F"]] });
  const rejected = bank([first, badGroups], { type: "tc" });
  assert.notEqual(rejected.questions[0].content_id, rejected.questions[1].content_id);
});

test("legacy answers complete the content group but not its unanswered sibling source key", () => {
  const first = question("first"), duplicate = question("duplicate");
  const history = { ...attempt(first), record: "verbal/submissions/old.md" };
  const result = bank([first, duplicate], { legacy: [history, history] });
  assert.deepEqual(result.completed, [first.key]);
  assert.equal(result.completedContentIds.length, 1);
  assert.equal(result.recommended, null);
  assert.equal(result.questions.length, 2);
});

test("all completed or empty banks recommend null rather than recycling the first question", () => {
  const first = question("first"), second = question("second", { prompt: "Another _____." });
  assert.equal(bank([first, second], { attempts: [attempt(second), attempt(first)] }).recommended, null);
  assert.deepEqual(bank([]), { questions: [], completed: [], completedContentIds: [], recommended: null });
});

test("recommendation continues after the most recent original key and wraps only to unattempted content", () => {
  const first = question("first"), second = question("second", { prompt: "Second _____." }), third = question("third", { prompt: "Third _____." });
  assert.equal(bank([first, second, third], { attempts: [attempt(second)] }).recommended, third.key);
  assert.equal(bank([first, second, third], { attempts: [attempt(third), attempt(second)] }).recommended, first.key);
});

test("unknown historical source keys are retained but cannot claim unrelated content as completed", () => {
  const current = question("current"), unknown = question("missing-source");
  const result = bank([current], { attempts: [{ ...attempt(unknown), content_id: "forged" }] });
  assert.deepEqual(result.completed, [unknown.key]);
  assert.deepEqual(result.completedContentIds, []);
  assert.equal(result.recommended, current.key);
});

test("missing prompt, empty or insufficient options and unsafe PDF text use stable independent keys", () => {
  for (const fields of [
    { prompt: undefined }, { prompt: " \n " }, { options: [] }, { options: ["A", "B"] },
    { options: ["calm", "quiet", "loud", "sharp", "new", ""] },
    { options: ["calm", "quiet", "loud", "sharp", "new", null] },
    { native: false }, { prompt: "The � is _____." },
  ]) {
    const first = question("first", fields), second = question("second", fields);
    const result = bank([first, second], { attempts: [attempt(first)] });
    assert.notEqual(result.questions[0].content_id, result.questions[1].content_id);
    assert.equal(result.recommended, second.key);
    assert.equal(result.questions[0].content_id, bank([first]).questions[0].content_id);
  }
});

test("PDF-only mathematical and diagram questions do not share identity from common option labels", () => {
  const first = question("diagram1", { type: "quant", prompt: undefined, options: undefined, mode: "comparison", letters: ["A", "B", "C", "D"], regions: [{ page: 1 }] });
  const second = question("diagram2", { ...first, unit: "diagram2", regions: [{ page: 2 }] });
  const result = bank([first, second], { type: "quant", attempts: [attempt(first)] });
  assert.notEqual(result.questions[0].content_id, result.questions[1].content_id);
  assert.equal(result.recommended, second.key);
});

test("Reading requires the complete passage, retaining paragraph boundaries and differing articles", () => {
  const fields = { type: "rc", prompt: "What does the author suggest?", options: ["One", "Two", "Three", "Four", "Five"], paragraphs: ["The first article.", "The final paragraph."] };
  const first = question("first", fields), same = question("same", fields);
  const other = question("other", { ...fields, paragraphs: ["A different article.", "The final paragraph."] });
  const regrouped = question("regrouped", { ...fields, paragraphs: ["The first article. The final paragraph."] });
  const missing = question("missing", { ...fields, paragraphs: undefined });
  const missingAgain = question("missing-again", { ...fields, paragraphs: undefined });
  const result = bank([first, same, other, regrouped, missing, missingAgain], { type: "rc", attempts: [attempt(first)] });
  assert.equal(result.questions[0].content_id, result.questions[1].content_id);
  assert.equal(new Set(result.questions.map(q => q.content_id)).size, 5);
  assert.equal(result.recommended, other.key);
});

test("Reading sentence-selection questions without choices stay independent", () => {
  const fields = { type: "rc", mode: "sentence", options: [], paragraphs: ["A whole article."], sentences: ["A whole article."] };
  const first = question("first", fields), second = question("second", fields);
  const result = bank([first, second], { type: "rc" });
  assert.notEqual(result.questions[0].content_id, result.questions[1].content_id);
});

test("question types and response modes never share content IDs", () => {
  const se = question("one"), tc = question("two", { type: "tc" });
  assert.notEqual(bank([se]).questions[0].content_id, bank([tc], { type: "tc" }).questions[0].content_id);
  const single = question("single", { type: "rc", options: ["1", "2", "3", "4", "5"], paragraphs: ["Passage."], mode: "single" });
  const multiple = question("multiple", { ...single, unit: "multiple", mode: "multiple" });
  const result = bank([single, multiple], { type: "rc" });
  assert.notEqual(result.questions[0].content_id, result.questions[1].content_id);
});

test("imports override only the same original key, without duplicating or mutating source records", () => {
  const first = question("first"), second = question("second");
  const replacement = { ...first, prompt: "The edited tone was _____.", content_id: "untrusted-import-value" };
  const result = bank([first, second], { imported: [replacement], attempts: [attempt(first)] });
  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions.map(q => q.key), [first.key, second.key]);
  assert.equal(result.questions[0].prompt, replacement.prompt);
  assert.match(result.questions[0].content_id, /^[a-f0-9]{64}$/);
  assert.notEqual(result.questions[0].content_id, result.questions[1].content_id);
  assert.equal(result.recommended, second.key);
});

test("filtering excludes other types without treating their attempts as this type's completion", () => {
  const se = question("same"), tc = question("same", { type: "tc" });
  const result = bank([se, tc], { attempts: [attempt(tc)], legacy: [attempt(tc)] });
  assert.equal(result.questions.length, 1);
  assert.deepEqual(result.completed, []);
  assert.equal(result.recommended, se.key);
});
