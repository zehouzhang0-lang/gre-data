import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store, grade, validate } from "../server/store.mjs";

test("word edits, deletes, restores and self-ratings are append-only; phrases remain intact", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-store-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await store.append("vocab_upsert", {
    word: "  ad   hoc ",
    meaning: "特定目的的",
  });
  await store.append("vocab_recall", {
    word: "ad hoc",
    answer: "临时的",
    self_rating: "remembered",
    mode: "recall",
  });
  await store.append("vocab_delete", { word: "ad hoc" });
  assert.equal((await store.state()).vocabulary[0].deleted, true);
  await store.append("vocab_restore", { word: "ad hoc" });
  const s = await store.state();
  assert.equal(s.vocabulary[0].word, "ad hoc");
  assert.equal(s.vocabulary[0].recalls.length, 1);
  assert.equal(s.vocabulary[0].status, "未检验");
  assert.equal(s.vocabulary[0].deleted, false);
  assert.equal((await store.events()).length, 4);
});
test("submission without a key stays ungraded; later key import compares without overwriting raw response", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-grade-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root),
    q = {
      material: "text_completion_2000",
      unit: "test2_section1_easy",
      question: "5",
      type: "se",
    };
  await store.append("attempt", { ...q, answer: "F / D" });
  assert.equal((await store.state()).attempts[0].result, null);
  await store.append("keys_import", {
    items: [{ ...q, answer: "D/F", explanation: "来自用户提供的解析" }],
  });
  const attempt = (await store.state()).attempts[0];
  assert.equal(attempt.result, true);
  assert.equal(attempt.answer, "F / D");
  assert.equal(attempt.answer_source, "user_provided");
  assert.equal((await store.events())[0].kind, "attempt");
});
test("retries are idempotent and conflicting payloads are rejected", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-id-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root),
    id = randomUUID(),
    p = { word: "glean", meaning: "搜寻" };
  await store.append("vocab_upsert", p, id);
  await store.append("vocab_upsert", p, id);
  assert.equal((await store.events()).length, 1);
  await assert.rejects(
    store.append("vocab_upsert", { ...p, meaning: "其他" }, id),
  );
});
test("grading respects ordered TC blanks, unordered SE choices, numeric fractions, and free-text uncertainty", () => {
  assert.equal(grade("D/A", "A/D", "tc"), false);
  assert.equal(grade("D/F", "F/D", "se"), true);
  assert.equal(grade("1/2", "0.5", "quant"), true);
  assert.equal(grade("无限", "inf", "quant"), null);
  assert.equal(grade("说明文字", "说明文字", "rc"), null);
  assert.equal(grade("A", null, "tc"), null);
});
test("import validation rejects duplicate locations, missing prompts and oversized batches", () => {
  const q = {
    material: "m",
    unit: "u",
    question: "1",
    type: "tc",
    answer: "A",
  };
  assert.throws(() => validate("keys_import", { items: [q, q] }));
  assert.throws(() => validate("questions_import", { items: [q] }));
  assert.throws(() => validate("keys_import", { items: Array(201).fill(q) }));
  assert.throws(() =>
    validate("vocab_recall", { word: "x", self_rating: "mastered" }),
  );
});
