import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBook, rowsOf } from "../server/question-bank.mjs";

const row = (text, y, page = 1, x = 57) => ({ text, y, page, height: 842, items: [{ x }] });
test("reading years stay in the passage; sentence questions and unnumbered questions keep separate source regions", () => {
  const qs = parseBook("reading_440", [
    row("Passage 2", 72), row("A manuscript remained unpublished since", 99), row("1929. A later version was published.", 112),
    row("1. Select the sentence that explains the change.", 160), row("2. What changed?", 200), row("A. One", 220), row("B. Two", 233), row("C. Three", 246), row("D. Four", 259), row("E. Five", 272),
    row("Passage 3", 320), row("The observation supports a conclusion.", 347), row("Which assumption is required?", 380), row("A. One", 393), row("B. Two", 406), row("C. Three", 419), row("D. Four", 432), row("E. Five", 445),
  ]);
  assert.deepEqual(qs.map(q => [q.unit, q.question, q.mode]), [["passage2", "1", "sentence"], ["passage2", "2", "single"], ["passage3", "1", "single"]]);
  assert(qs[0].sentences.some(s => s.includes("1929")));
  assert(qs[2].passageRegions[0].bottom < qs[2].regions[0].top);
});

test("split words and out-of-order columns retain cross-page TC groups; restarted Quant sets never overwrite earlier answers", () => {
  const textRows = rowsOf([
    { str: "B. second", transform: [1,0,0,1,57,720], width: 60 },
    { str: "A. firs", transform: [1,0,0,1,57,733], width: 28 },
    { str: "t", transform: [1,0,0,1,85,733], width: 3 },
  ], 842, 1);
  assert.equal(textRows[0].text, "A. first");
  const tc = parseBook("text_completion_2000", [row("test 130 section 1 medium", 70), row("1. Choose (i) ___ and (ii) ___", 700), row("A. one D. four", 740), row("B. two E. five", 76, 2), row("C. three F. six", 99, 2)]);
  assert.equal(tc[0].type, "tc"); assert.deepEqual(tc[0].groups, [["A","B","C"],["D","E","F"]]); assert.equal(tc[0].regions.length, 2);
  const quant = parseBook("quant_900", [row("Section 1 - Easy", 70, 1, 90), row("1. Quantity A: x", 100, 1, 90), row("Quantity B: y", 120, 1, 90), row("2. The period ends in", 200, 1, 90), row("2006. Which value?", 220, 1, 90), row("A. 1 B. 2 C. 3 D. 4 E. 5", 250, 1, 90), row("1. A new set", 100, 2, 90), row("A. 1 B. 2 C. 3 D. 4 E. 5", 140, 2, 90)]);
  assert.equal(quant.length, 3); assert.equal(quant[0].mode, "comparison"); assert.equal(quant[1].question, "2"); assert.notEqual(quant[0].key, quant[2].key);
});

test("verbal markers tolerate missing spaces and an unnumbered first reading question", () => {
  const tc = parseBook("text_completion_2000", [row("test 114 section 1 (medium)", 70), row("1.Choose a word.", 100), row("A. one B. two C. three D. four E. five", 120), row("2.Choose another word.", 160), row("A. one B. two C. three D. four E. five", 180)]);
  assert.deepEqual(tc.map(q => q.question), ["1", "2"]);
  const rc = parseBook("reading_440", [row("Passage 272", 72), row("The original passage ends here.", 100), row("Which explanation is supported?", 140), row("A. One", 153), row("B. Two", 166), row("C. Three", 179), row("2.Consider the function of the sentence.", 220), row("A. One", 233), row("B. Two", 246), row("C. Three", 259)]);
  assert.deepEqual(rc.map(q => q.question), ["1", "2"]);
  assert.equal(rc[0].prompt, "Which explanation is supported?");
  assert.equal(rc[0].paragraphs.join(" "), "The original passage ends here.");
});

test("inline and missing-dot options retain the full prompt and six SE choices", () => {
  const [q] = parseBook("text_completion_2000", [row("test 72 section 2 (medium)", 70), row("5. Fill the blank in virtual", 100), row("reality.A. ubiquitous", 113), row("B. exasperating", 126), row("C. estimable", 139), row("D. showy", 152), row("E meretricious", 165), row("F. worthwhile", 178)]);
  assert.equal(q.type, "se"); assert.equal(q.mode, "pair");
  assert.equal(q.prompt, "Fill the blank in virtual reality.");
  assert.deepEqual(q.letters, ["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(q.options, ["ubiquitous", "exasperating", "estimable", "showy", "meretricious", "worthwhile"]);
});

test("reading initials remain prose and click-on-sentence instructions select sentences", () => {
  const qs = parseBook("reading_440", [row("Passage 172", 72), row("This passage mentions an author.", 100), row("5. Which statements are supported?", 140), row("A. One", 153), row("B. It is a term that I. Schoep recommends replacing.", 166), row("C. Three", 179), row("6. The quotation from I. Schoep serves to", 220), row("A. One", 233), row("B. Two", 246), row("C. Three", 259), row("D. Four", 272), row("E. Five", 285), row("7. Click on the sentence that presents the observation.", 320), row("For the following question, select all that apply.", 346)]);
  assert.equal(qs[0].mode, "multiple"); assert.deepEqual(qs[0].letters, ["A", "B", "C"]);
  assert(qs[0].options[1].includes("I. Schoep"));
  assert.equal(qs[1].prompt, "The quotation from I. Schoep serves to");
  assert.deepEqual(qs[1].letters, ["A", "B", "C", "D", "E"]);
  assert.equal(qs[2].mode, "sentence");
});
