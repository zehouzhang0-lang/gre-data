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
