import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AiCoach, invokeCli } from "../server/ai-coach.mjs";
import { Store } from "../server/store.mjs";
import { validateWritingReviewResult, writingDimensionIds, writingReviewContext, writingReviewInputHash, writingReviewInstruction, writingReviewSchema } from "../server/writing-review.mjs";

const quote = "Public institutions should support broad access.";
const submission = (extra = {}) => ({
  id: "123e4567-e89b-42d3-a456-426614174001",
  topic: { title: "Isolated test topic", prompt: "Test-only claim about public institutions.", instructions: "Discuss the extent of agreement and address a circumstance in which the claim may not hold.", source: { kind: "self_created" } },
  text: `${quote}\nA local library can remove barriers, although scarce funding requires priorities.`,
  outline: "My private plan: explain access and funding.", mode: "full_essay", condition: "practice",
  completed: true, assistance_used: false, parent_id: null, timing_status: "untimed", word_count: 22,
  ...extra,
});
const result = (extra = {}) => ({
  summary: "本稿提出支持公共服务的立场；这只是测试反馈。",
  score: 3, score_reason: "AI暂定练习估分，不是正式成绩。",
  dimensions: writingDimensionIds.map(id => ({ id, feedback: "基于此句检查立场与任务要求；其余证据仍有限。", evidence: quote })),
  priorities: [
    { issue: "说明支持条件", evidence: quote, action: "补充资源约束如何改变支持程度。" },
    { issue: "验证例证推理", evidence: "A local library can remove barriers", action: "解释图书馆例子如何支持主张。" },
  ],
  sentence_feedback: [{ original: quote, suggestion: "Public institutions should broaden access while accounting for limited resources.", reason: "明确主张的适用边界。" }],
  next_action: "独立补写一段，并检查主张、理由、例证和含义是否连接。",
  technique_ids: ["aw_issue_position", "aw_paragraph_reasoning"], ...extra,
});

async function settled(ai) {
  for (let i = 0; i < 200 && ["running", "saving"].includes(ai.job?.status); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert(!["running", "saving"].includes(ai.job?.status), "isolated runner did not settle");
  return ai.job;
}

function coach(t, original = submission(), output = result(), onExec) {
  const previous = process.env.GRE_CODEX_BIN;
  process.env.GRE_CODEX_BIN = "isolated-writing-review-test-cli";
  t.after(() => { if (previous === undefined) delete process.env.GRE_CODEX_BIN; else process.env.GRE_CODEX_BIN = previous; });
  const state = { writing: { submissions: [original] }, attempts: [], events: [], vocabulary: [] };
  const writes = [], calls = [];
  const store = { state: async () => state, yaml: async () => ({ techniques: [] }) };
  const runner = async (binary, args, options) => {
    if (args[0] === "login") return { stdout: "Logged in using ChatGPT", stderr: "" };
    calls.push({ binary, args, options });
    if (onExec) await onExec(args, options);
    if (typeof output === "string") await fs.writeFile(args[args.indexOf("--output-last-message") + 1], output);
    else await fs.writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify(output));
    return { stdout: "", stderr: "" };
  };
  const ai = new AiCoach(process.cwd(), store, { load: () => { throw new Error("writing must not load question bank"); } }, async (kind, payload, id) => {
    writes.push({ kind, payload, id }); return { id };
  }, runner);
  return { ai, state, writes, calls };
}

test("writing review schema rejects empty, partial, extra, duplicated and invented evidence", () => {
  const original = submission(), valid = result();
  const checked = validateWritingReviewResult(valid, original);
  assert.deepEqual(checked, valid);
  assert.notEqual(checked, valid);
  for (const value of [null, {}, [], { ...valid, summary: " " }, { ...valid, dimensions: [] }, { ...valid, priorities: valid.priorities.slice(0, 1) }, { ...valid, score: 3.2 }, { ...valid, score: "3.5" }, { ...valid, untrusted: true }]) {
    assert.throws(() => validateWritingReviewResult(value, original));
  }
  const incomplete = structuredClone(valid); delete incomplete.score_reason;
  assert.throws(() => validateWritingReviewResult(incomplete, original), /不完整/);
  const duplicate = structuredClone(valid); duplicate.dimensions[1].id = duplicate.dimensions[0].id;
  assert.throws(() => validateWritingReviewResult(duplicate, original), /五个不同维度/);
  const fake = structuredClone(valid); fake.dimensions[0].evidence = "The user never wrote this.";
  assert.throws(() => validateWritingReviewResult(fake, original), /不存在的证据/);
  const fakeSentence = structuredClone(valid); fakeSentence.sentence_feedback[0].original = "Invented sentence.";
  assert.throws(() => validateWritingReviewResult(fakeSentence, original), /不存在的证据/);
  assert.throws(() => validateWritingReviewResult({ ...valid, technique_ids: ["invented_id"] }, original));
  assert.throws(() => validateWritingReviewResult({ ...valid, technique_ids: ["aw_issue_position", "aw_issue_position"] }, original), /重复/);
  const numericDimension = structuredClone(valid); numericDimension.dimensions[0].score = 4;
  assert.throws(() => validateWritingReviewResult(numericDimension, original), /额外字段/);
});

test("all quotation fields describe exact source-only excerpts while validation remains strict", () => {
  const properties = writingReviewSchema.properties;
  for (const field of [properties.dimensions.items.properties.evidence, properties.priorities.items.properties.evidence, properties.sentence_feedback.items.properties.original]) {
    assert.match(field.description, /verbatim, contiguous substring/);
    assert.match(field.description, /spelling, capitalization and punctuation/);
    assert.match(field.description, /no labels, quotation-mark wrappers, ellipses/);
    assert.match(field.description, /Reusing the same valid excerpt/);
    assert.match(field.description, /Do not quote the topic, task instructions/);
    assert.match(field.description, /For paragraph and full_essay modes, submission.outline is planning context only and MUST NOT be quoted/);
    assert.match(field.description, /Never join non-adjacent sentences/);
  }
  assert.match(properties.score.description, /otherwise use null/);
  assert.match(properties.score.description, /not a scoring floor/);
  assert.match(writingReviewInstruction, /输出前逐项自检dimensions\[\]\.evidence、priorities\[\]\.evidence和sentence_feedback\[\]\.original/);
  assert.match(writingReviewInstruction, /同一句真实引文可以用于多个维度/);
  assert.match(writingReviewInstruction, /full_essay和paragraph模式绝不能引用outline/);
  for (const altered of [`"${quote}"`, `${quote} This demonstrates a position.`, "Public institutions ... broad access.", quote.toLowerCase(), quote.replace("should", "must")]) {
    const output = result(); output.dimensions[0].evidence = altered;
    assert.throws(() => validateWritingReviewResult(output, submission()), /不存在的证据/);
  }
  const whitespaceOnly = result(); whitespaceOnly.dimensions[0].evidence = quote.replaceAll(" ", "\n");
  assert.doesNotThrow(() => validateWritingReviewResult(whitespaceOnly, submission()));
});

test("partial submissions cannot receive an overall score, including complete outlines and paragraphs", () => {
  for (const extra of [{ mode: "outline" }, { mode: "paragraph" }, { completed: false }]) {
    assert.doesNotThrow(() => validateWritingReviewResult(result({ score: null }), submission(extra)));
    assert.throws(() => validateWritingReviewResult(result(), submission(extra)), /不得给出完整作文分数/);
  }
  const outlineOnly = submission({ mode: "outline", text: "", outline: submission().text });
  assert.doesNotThrow(() => validateWritingReviewResult(result({ score: null }), outlineOnly));
  assert.throws(() => validateWritingReviewResult(result(), submission({ text: "", outline: submission().text })), /先独立写下/);
  const citingPlan = result(); citingPlan.dimensions[0].evidence = "My private plan";
  assert.throws(() => validateWritingReviewResult(citingPlan, submission()), /不存在的证据/);
  assert.doesNotThrow(() => validateWritingReviewResult(result({ score: null, sentence_feedback: [] }), submission()));
});

test("input hash preserves complete topic requirements and ignores review projection fields", () => {
  const original = submission();
  const hash = writingReviewInputHash(original);
  assert.equal(hash.length, 64);
  assert.equal(writingReviewInputHash({ ...original, reviews: [{ id: "new" }], latest_review: "anything" }), hash);
  const reordered = { ...original, topic: { source: original.topic.source, instructions: original.topic.instructions, prompt: original.topic.prompt, title: original.topic.title } };
  assert.equal(writingReviewInputHash(reordered), hash);
  assert.notEqual(writingReviewInputHash({ ...original, text: original.text + " New text." }), hash);
  assert.notEqual(writingReviewInputHash({ ...original, topic: { ...original.topic, instructions: "Different task." } }), hash);
  assert.notEqual(writingReviewInputHash({ ...original, assistance_used: true }), hash);
  assert.equal(writingReviewContext(original).submission.topic.instructions, original.topic.instructions);
});

test("writing review uses subscription-only readonly runner and persists independent immutable review", async t => {
  const original = submission(), before = structuredClone(original);
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const { ai, writes, calls } = coach(t, original, result(), async (args, options) => {
    assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
    assert.equal(args[args.indexOf("--model") + 1], process.env.GRE_AI_MODEL || "gpt-5.6-terra");
    assert(args.includes('forced_login_method="chatgpt"'));
    assert(args.includes("--ignore-user-config"));
    for (const disabled of ["shell_tool", "unified_exec", "multi_agent", "plugins", "hooks", "computer_use", "skill_search"]) assert(args.includes(disabled));
    assert.notEqual(options.cwd, process.cwd());
    assert(options.cwd.startsWith(path.join(os.tmpdir(), "gre-ai-")));
    assert(options.input.includes(original.topic.instructions));
    assert(options.input.includes("不生成整篇范文"));
    assert(options.input.includes("不是评分下限"));
    const schema = JSON.parse(await fs.readFile(args[args.indexOf("--output-schema") + 1], "utf8"));
    assert.equal(schema.properties.dimensions.minItems, 5);
    entered(); await gate;
  });
  const job = await ai.start("writing", original.id);
  assert.equal(job.scope, "writing");
  assert.equal(job.submission_id, original.id);
  assert.equal(job.attempt_id, null);
  await started;
  await assert.rejects(ai.start("writing", original.id), /已有AI分析/);
  await assert.rejects(ai.start("recent"), /已有AI分析/);
  release(); await settled(ai);
  assert.equal(ai.job.status, "completed", ai.job.error);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].kind, "writing_review");
  assert.equal(writes[0].payload.submission_id, original.id);
  assert.equal(writes[0].payload.input_hash, writingReviewInputHash(original));
  assert.equal(writes[0].id, job.id);
  assert.deepEqual(writes[0].payload.result, result());
  assert.deepEqual(original, before);
  // Allow the run's finally cleanup to finish after job completion.
  for (let i = 0; i < 100; i++) {
    try { await fs.access(calls[0].options.cwd); await new Promise(resolve => setTimeout(resolve, 5)); }
    catch { break; }
  }
  await assert.rejects(fs.access(calls[0].options.cwd));
});

test("outline runner schema forbids overall scoring and saves only unscored feedback", async t => {
  const original = submission({ mode: "outline" });
  const { ai, writes } = coach(t, original, result({ score: null }), async args => {
    const schema = JSON.parse(await fs.readFile(args[args.indexOf("--output-schema") + 1], "utf8"));
    assert.deepEqual(schema.properties.score, { type: "null" });
  });
  await ai.start("writing", original.id); await settled(ai);
  assert.equal(ai.job.status, "completed", ai.job.error);
  assert.equal(writes[0].payload.result.score, null);
});

test("malformed, incomplete, unsupported evidence and improperly scored partial outputs save nothing", async t => {
  const cases = ["not JSON", {}, { ...result(), dimensions: [] }, { ...result(), summary: "" }, { ...result(), priorities: [] }, { ...result(), dimensions: result().dimensions.map(item => ({ ...item, evidence: "invented" })) }];
  for (const output of cases) {
    const original = submission(), before = structuredClone(original);
    const { ai, writes } = coach(t, original, output);
    await ai.start("writing", original.id); await settled(ai);
    assert.equal(ai.job.status, "failed");
    assert.equal(writes.length, 0);
    assert.deepEqual(original, before);
  }
  const { ai, writes } = coach(t, submission({ completed: false }), result());
  await ai.start("writing", submission().id); await settled(ai);
  assert.equal(ai.job.status, "failed");
  assert.equal(writes.length, 0);
});

test("missing submission, blank original or missing task instructions do not start an AI exec", async t => {
  for (const original of [submission({ text: " " }), submission({ topic: { prompt: "Claim" } }), submission({ completed: "yes" })]) {
    const { ai, writes, calls } = coach(t, original);
    await assert.rejects(ai.start("writing", original.id));
    assert.equal(calls.length, 0); assert.equal(writes.length, 0);
  }
  const { ai, calls } = coach(t);
  await assert.rejects(ai.start("writing", "missing"), /请先保存写作原稿/);
  assert.equal(calls.length, 0);
});

test("cancellation and runner failure preserve original and save no review", async t => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const original = submission(), before = structuredClone(original);
  const cancelled = coach(t, original, result(), async () => { entered(); await gate; });
  await cancelled.ai.start("writing", original.id); await started;
  cancelled.ai.cancel(); release(); await settled(cancelled.ai);
  assert.equal(cancelled.ai.job.status, "failed");
  assert.match(cancelled.ai.job.error, /停止/);
  assert.equal(cancelled.writes.length, 0);
  assert.deepEqual(original, before);
  const failed = coach(t, original, result(), async () => { throw new Error("isolated network failure"); });
  await failed.ai.start("writing", original.id); await settled(failed.ai);
  assert.equal(failed.ai.job.status, "failed");
  assert.equal(failed.writes.length, 0);
  assert.deepEqual(original, before);
});

test("shared CLI runner enforces timeout without requiring a model or network", async () => {
  await assert.rejects(invokeCli(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeout: 30 }), /超时/);
});

test("isolated Store validates writing review hash and preserves saved original bytes", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-writing-ai-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root), original = submission();
  const session = await store.append("writing_session", {
    topic: { id: "test_issue", title: original.topic.title, prompt: original.topic.prompt,
      instructions: original.topic.instructions, source_kind: "coach_original" },
    mode: "full_essay", condition: "practice", parent_id: null,
  });
  const saved = await store.append("writing_submission", {
    session_id: session.id, text: original.text, outline: original.outline,
    assistance_used: false, completed: true, snapshot_at: new Date().toISOString(),
  });
  const filename = path.join(root, "platform/events", `${saved.id}.json`);
  const bytes = await fs.readFile(filename, "utf8");
  const { ai } = coach(t);
  ai.root = root; ai.store = store; ai.persist = (...args) => store.append(...args);
  await ai.start("writing", saved.id); await settled(ai);
  assert.equal(ai.job.status, "completed", ai.job.error);
  const state = await store.state();
  assert.equal(state.writing.reviews.length, 1);
  assert.equal(state.writing.reviews[0].provisional, true);
  assert.equal(state.writing.reviews[0].provider, "codex_cli");
  assert.equal(state.writing.reviews[0].submission_id, saved.id);
  assert.equal(state.writing.reviews[0].input_hash, writingReviewInputHash(state.writing.submissions[0]));
  assert.equal(state.reviews.length, 0);
  assert.equal(state.attempts.length, 0);
  assert.equal(await fs.readFile(filename, "utf8"), bytes);
  assert.equal((await store.events()).length, 3);
});

test("writing rejects API-key login and persistence errors never report a saved review", async t => {
  const unsupported = coach(t);
  unsupported.ai.runner = async () => ({ stdout: "Logged in using an API key", stderr: "" });
  await assert.rejects(unsupported.ai.start("writing", submission().id), /不会使用API余额/);
  assert.equal(unsupported.calls.length, 0);
  assert.equal(unsupported.writes.length, 0);
  const failed = coach(t);
  failed.ai.persist = async () => { throw new Error("isolated disk error"); };
  await failed.ai.start("writing", submission().id); await settled(failed.ai);
  assert.equal(failed.ai.job.status, "failed");
  assert.match(failed.ai.job.error, /disk error/);
  assert.equal(failed.writes.length, 0);
  assert.equal(failed.ai.job.event_id, undefined);
});
