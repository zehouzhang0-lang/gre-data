import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { AiCoach } from "../server/ai-coach.mjs";

test("AI review is asynchronous, retains the reference snapshot, and never rewrites an attempt or key", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-coach-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root), q = { material: "m", unit: "u", question: "1", type: "tc" };
  await store.append("questions_import", { items: [{ ...q, prompt: "Test-only prompt", options: ["one", "two"], answer: "B" }] });
  const attempt = await store.append("attempt", { ...q, answer: "A" });
  let finishRun, sawInput;
  const gate = new Promise(resolve => { finishRun = resolve; });
  const runner = async (_binary, args, options) => {
    if (args[0] === "login") return { stdout: "Logged in using ChatGPT", stderr: "" };
    sawInput = options.input;
    assert(args.includes('forced_login_method="chatgpt"'));
    assert(args.includes("--ignore-user-config"));
    assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
    assert.notEqual(options.cwd, root);
    await gate;
    await fs.writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({
      summary: "测试分析", evidence: "测试证据", reasoning_gap: "未提供推理", next_action: "回看证据", technique_ids: ["invented_id"], assessment: "needs_review",
    }));
    return { stdout: "", stderr: "" };
  };
  const ai = new AiCoach(root, store, { load: async () => [] }, (...args) => store.append(...args), runner);
  const job = await ai.start("attempt", attempt.id);
  assert.equal(job.status, "running");
  await assert.rejects(ai.start("attempt", attempt.id), /已有AI分析/);
  // A study action can still save while the model is waiting.
  await store.append("attempt", { ...q, answer: "B" });
  finishRun();
  for (let i = 0; i < 100 && ["running", "saving"].includes(ai.job.status); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(ai.job.status, "completed", ai.job.error);
  assert(sawInput.includes('"answer":"A"'));
  const state = await store.state();
  assert.equal(state.attempts.length, 2);
  assert.equal(state.attempts.find(a => a.id === attempt.id).answer, "A");
  assert.equal(state.reviews[0].expected_answer, "B");
  assert.equal(state.reviews[0].provisional, true);
  assert.deepEqual(state.reviews[0].result.technique_ids, []);
  assert.equal(Object.values(state.keys)[0].answer, "B");
});

test("API-key login is rejected and a failed subscription call saves no analysis", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-coach-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await store.append("vocab_upsert", { word: "test", meaning: "测试" });
  await store.append("vocab_recall", { word: "test", self_rating: "forgotten" });
  let subscription = false, calls = 0;
  const runner = async (_binary, args) => {
    if (args[0] === "login") return { stdout: subscription ? "Logged in using ChatGPT" : "Logged in using an API key", stderr: "" };
    calls++; throw new Error("模拟网络中断");
  };
  const ai = new AiCoach(root, store, {}, (...args) => store.append(...args), runner);
  await assert.rejects(ai.start("recent"), /不会使用API余额/);
  assert.equal(calls, 0);
  subscription = true;
  await ai.start("recent");
  for (let i = 0; i < 100 && ai.job.status === "running"; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(ai.job.status, "failed");
  assert.equal((await store.events()).length, 2);
  assert.equal((await store.state()).reviews.length, 0);
});
