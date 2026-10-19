import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store, validate } from "../server/store.mjs";
import { prepareWritingEvent, projectWriting, validateWriting } from "../server/writing.mjs";
import { writingDimensionIds, writingReviewInputHash } from "../server/writing-review.mjs";

const start = "2026-10-19T03:00:00.000Z";
const at = seconds => new Date(Date.parse(start) + seconds * 1000).toISOString();
const sampleTopic = () => ({ id: "practice_topic", title: "A practice issue", prompt: "Discuss this fictional issue.",
  instructions: "Explain your position and consider its limitations.", translation: "讨论这道自拟练习题。",
  source_url: null, source_kind: "coach_original", theme: "education" });
const sessionPayload = (overrides = {}) => ({ topic: sampleTopic(), mode: "full_essay", condition: "practice", parent_id: null, ...overrides });
const begin = (overrides = {}) => prepareWritingEvent({ kind: "writing_session", payload: sessionPayload(overrides), id: randomUUID(), recorded_at: start });
const submissionPayload = (session, overrides = {}) => ({ session_id: session.id, text: "I support this position. There are important limits.", outline: "Position; reason; limitation.", assistance_used: false, completed: true, snapshot_at: at(60), ...overrides });
const submit = (session, overrides = {}, seconds = 60) => prepareWritingEvent({ kind: "writing_submission", payload: submissionPayload(session, overrides), id: randomUUID(), recorded_at: at(seconds), events: [session] });
const result = (score = 3.5) => ({ summary: "这是针对本稿的暂定反馈。", score, score_reason: "仅供本次练习参考，不代表正式成绩。",
  dimensions: writingDimensionIds.map(id => ({ id, feedback: "进一步说明论据如何支持立场。", evidence: "I support this position." })),
  priorities: [
    { issue: "论证发展", evidence: "I support this position.", action: "补充一个具体例子及其推理。" },
    { issue: "限定条件", evidence: "There are important limits.", action: "解释何种条件下结论不适用。" },
  ], sentence_feedback: [{ original: "There are important limits.", suggestion: "This position has important limitations.", reason: "更明确承接立场。" }],
  next_action: "限时五分钟补写一个反例并说明回应。", technique_ids: ["aw_issue_position"] });
const reviewPayload = (submission, overrides = {}) => ({ submission_id: submission.id, result: result(), model: "test-model",
  input_hash: writingReviewInputHash(submission), provider: "codex_cli", provisional: true, ...overrides });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-writing-test-"));
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: new Store(root) };
}

test("old stores expose empty writing data and a profile target without changing learning or score records", async t => {
  const { root, store } = await fixture(t);
  assert.deepEqual((await store.state()).writing, { sessions: [], submissions: [], reviews: [], target: null });
  const profile = "---\ntarget:\n  analytical_writing: 3.5\ncurrent:\n  analytical_writing: null\n---\n";
  await fs.writeFile(path.join(root, "profile.md"), profile);
  const session = await store.append("writing_session", sessionPayload());
  await store.append("writing_submission", submissionPayload(session, { snapshot_at: new Date().toISOString() }));
  const state = await store.state();
  assert.equal(state.writing.target, 3.5);
  assert.equal(state.writing.submissions.length, 1);
  assert.deepEqual(state.attempts, []);
  assert.deepEqual(state.reviews, []);
  assert.deepEqual(state.spacedReview.items, []);
  assert.equal(await fs.readFile(path.join(root, "profile.md"), "utf8"), profile);
  assert.equal((await store.list("analytical-writing/submissions")).length, 0);
});

test("session timestamps derive from the event and only full essays may be timed", () => {
  const session = begin({ condition: "timed" });
  const projected = projectWriting([session]).sessions[0];
  assert.equal(projected.started_at, start);
  assert.equal(projected.deadline_at, at(1800));
  assert.equal(projected.submitted, false);
  assert.equal(projected.submission_id, null);
  for (const mode of ["outline", "paragraph"]) assert.throws(() => begin({ mode, condition: "timed" }), /完整作文/);
  assert.throws(() => begin({ mode: "argument" }), /模式/);
  assert.throws(() => begin({ condition: "exam" }), /条件/);
  assert.equal(projectWriting([begin({ mode: "outline" })]).sessions[0].deadline_at, null);
});

test("submissions retain original whitespace, assistance and completion declarations; derived snapshots are server owned", () => {
  const session = begin();
  const text = "  I support this position.\n\nDon't ignore 2 counter-examples.  ";
  const outline = "  Reason one\n  Reason two  ";
  const event = submit(session, { text, outline, assistance_used: true, completed: false }, 60.125);
  const writing = projectWriting([session, event]);
  const saved = writing.submissions[0];
  assert.equal(saved.text, text);
  assert.equal(saved.outline, outline);
  assert.equal(saved.assistance_used, true);
  assert.equal(saved.completed, false);
  assert.equal(saved.word_count, 8);
  assert.equal(saved.duration_seconds, 60.125);
  assert.equal(saved.timing_status, "untimed");
  assert.equal(writing.sessions[0].submission_id, event.id);
  assert.equal(writing.sessions[0].submitted_at, at(60.125));
  saved.topic.prompt = "Local view changed";
  assert.equal(projectWriting([session, event]).submissions[0].topic.prompt, sampleTopic().prompt);
  assert.equal(event.payload.text, text);
});

test("timed status uses server receipt with a bounded five-second transport allowance", () => {
  const session = begin({ condition: "timed" });
  const cases = [
    [1790, 1790, "within_limit"], [1800, 1800, "within_limit"], [1805, 1800, "within_limit"],
    [1805.001, 1800, "recovered_after_deadline"], [1801, 1800.001, "recovered_after_deadline"],
    [3000, 1799, "recovered_after_deadline"],
  ];
  for (const [received, snapshot, expected] of cases) {
    const event = submit(session, { snapshot_at: at(snapshot) }, received);
    assert.equal(event.payload.timing_status, expected);
    assert.equal(event.payload.duration_seconds, received);
    assert.equal(event.payload.snapshot_at, at(snapshot));
  }
  assert.throws(() => submit(session, { snapshot_at: at(-6) }), /时钟/);
  assert.throws(() => submit(session, { snapshot_at: at(66) }), /时钟/);
});

test("snapshot dates require a real calendar date and explicit timezone", () => {
  const session = begin();
  for (const snapshot_at of ["2026-10-19", "2026-10-19T03:00:00", "2026-02-30T03:00:00Z", "bad", null]) {
    assert.throws(() => validateWriting("writing_submission", submissionPayload(session, { snapshot_at })), /ISO/);
  }
  assert.equal(validateWriting("writing_submission", submissionPayload(session, { snapshot_at: "2026-10-19T11:01:00+08:00" })).snapshot_at, at(60));
});

test("same-session retries are idempotent across request IDs, while changed essays require a new revision", async t => {
  const { store } = await fixture(t);
  const session = await store.append("writing_session", sessionPayload());
  const payload = submissionPayload(session, { snapshot_at: new Date().toISOString() });
  const id = randomUUID();
  const first = await store.append("writing_submission", payload, id);
  assert.deepEqual(await store.append("writing_submission", payload, id), first);
  assert.deepEqual(await store.append("writing_submission", payload, randomUUID()), first);
  await assert.rejects(store.append("writing_submission", { ...payload, text: "Edited." }, id), /不同内容/);
  await assert.rejects(store.append("writing_submission", { ...payload, text: "Edited." }), /修订稿/);
  assert.equal((await store.events()).length, 2);
  assert.equal((await store.state()).writing.submissions.length, 1);
});

test("concurrent writing submissions serialize to one immutable essay", async t => {
  const { store } = await fixture(t);
  const session = await store.append("writing_session", sessionPayload());
  const payload = submissionPayload(session, { snapshot_at: new Date().toISOString() });
  const outcomes = await Promise.allSettled([
    store.append("writing_submission", payload),
    store.append("writing_submission", { ...payload, text: "A conflicting draft." }),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === "rejected").length, 1);
  assert.equal((await store.events()).length, 2);
});

test("practice revisions retain their parent and immutable topic while preserving the original submission", () => {
  const session = begin(), original = submit(session);
  const events = [session, original], before = structuredClone(events);
  const payload = sessionPayload({ topic: null, parent_id: original.id, mode: "paragraph" });
  const revision = prepareWritingEvent({ kind: "writing_session", payload, id: randomUUID(), recorded_at: at(120), events });
  assert.deepEqual(revision.payload.topic, sampleTopic());
  assert.equal(revision.payload.parent_id, original.id);
  assert.equal(revision.payload.condition, "practice");
  assert.deepEqual(events, before);
  const revised = prepareWritingEvent({ kind: "writing_submission", payload: submissionPayload(revision, { text: "A revised paragraph.", snapshot_at: at(180) }), id: randomUUID(), recorded_at: at(180), events: [...events, revision] });
  const projection = projectWriting([...events, revision, revised]);
  assert.equal(projection.submissions.length, 2);
  assert.equal(projection.submissions[0].parent_id, original.id);
  assert.equal(projection.submissions[1].text, original.payload.text);
  assert.throws(() => prepareWritingEvent({ kind: "writing_session", payload: { ...payload, topic: { ...sampleTopic(), prompt: "Different topic." } }, id: randomUUID(), recorded_at: at(200), events }), /沿用/);
  assert.throws(() => prepareWritingEvent({ kind: "writing_session", payload: { ...payload, parent_id: randomUUID() }, id: randomUUID(), recorded_at: at(200), events }), /原稿/);
  assert.throws(() => begin({ condition: "timed", parent_id: original.id }), /修订稿/);
});

test("request validation rejects injected score, elapsed time, topic and unsafe or falsely official links", () => {
  const session = begin();
  for (const extra of [{ score: 6 }, { duration_seconds: 3 }, { timing_status: "within_limit" }, { topic: sampleTopic() }, { word_count: 600 }]) {
    assert.throws(() => validate("writing_submission", { ...submissionPayload(session), ...extra }), /字段/);
  }
  for (const source_url of ["javascript:alert(1)", "file:///private", "http://example.com", "https://user:pass@example.com", "https://example.com:8080/path"]) {
    assert.throws(() => begin({ topic: { ...sampleTopic(), source_url } }), /链接/);
  }
  for (const source_url of [null, "https://ets.org.evil.example/pool", "https://example.com/pool"]) {
    assert.throws(() => begin({ topic: { ...sampleTopic(), source_kind: "official", source_url } }), /ETS/);
  }
  assert.equal(begin({ topic: { ...sampleTopic(), source_kind: "official", source_url: "https://www.ets.org/pdfs/gre/issue-pool.pdf" } }).payload.topic.source_kind, "official");
  assert.throws(() => begin({ topic: { ...sampleTopic(), source_kind: "publisher" } }), /来源类型/);
  assert.throws(() => validateWriting("writing_submission", submissionPayload(session, { assistance_used: "false" })), /明确/);
  assert.throws(() => validateWriting("writing_submission", submissionPayload(session, { text: "a".repeat(60001) })), /60000/);
});

test("blank drafts are not submissions; outline-only and unfinished text retain their proper mode", () => {
  const outlineSession = begin({ mode: "outline" });
  assert.throws(() => submit(outlineSession, { text: " ", outline: "\n" }), /空白/);
  const event = submit(outlineSession, { text: "", outline: "A clear position and reason." });
  assert.equal(event.payload.mode, "outline");
  assert.equal(event.payload.text, "");
  assert.equal(event.payload.word_count, 0);
  assert.throws(() => submit(begin(), { text: "", outline: "Only notes." }), /正文/);
  assert.equal(submit(begin({ condition: "timed" }), { completed: false }).payload.completed, false);
});

test("missing references and operation-ID conflicts fail before persisting any writing event", async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.append("writing_submission", submissionPayload({ id: randomUUID() }, { snapshot_at: new Date().toISOString() })), /会话/);
  await assert.rejects(store.append("writing_session", sessionPayload({ parent_id: randomUUID() })), /原稿/);
  await assert.rejects(store.append("writing_session", sessionPayload(), "bad-id"), /编号/);
  assert.equal((await store.events()).length, 0);
  const id = randomUUID();
  await store.append("vocab_upsert", { word: "example", meaning: "例子" }, id);
  await assert.rejects(store.append("writing_session", sessionPayload(), id), /不同内容/);
  assert.equal((await store.events()).length, 1);
});

test("reviews are verified against the immutable submission and cannot alter its text or pretend to be official", async t => {
  const { root, store } = await fixture(t);
  const session = await store.append("writing_session", sessionPayload());
  const submission = await store.append("writing_submission", submissionPayload(session, { snapshot_at: new Date().toISOString() }));
  const rawBefore = await fs.readFile(path.join(root, "platform/events", `${submission.id}.json`), "utf8");
  const saved = (await store.state()).writing.submissions[0];
  const review = await store.append("writing_review", reviewPayload(saved));
  const state = await new Store(root).state(new Date("2027-01-01T00:00:00Z"));
  assert.equal(state.writing.reviews[0].id, review.id);
  assert.equal(state.writing.reviews[0].provisional, true);
  assert.equal(state.writing.reviews[0].provider, "codex_cli");
  assert.equal(state.writing.reviews[0].result.score, 3.5);
  assert.deepEqual(state.writing.submissions[0], saved);
  assert.equal(await fs.readFile(path.join(root, "platform/events", `${submission.id}.json`), "utf8"), rawBefore);
  assert.deepEqual(state.reviews, []);
  for (const overrides of [{ input_hash: "0".repeat(64) }, { provisional: false }, { provider: "ets" }, { submission_id: randomUUID() }, { result: { ...result(), dimensions: [] } }]) {
    await assert.rejects(store.append("writing_review", reviewPayload(saved, overrides)));
  }
  assert.equal((await store.events()).length, 3);
});

test("outline, paragraph and unfinished essay reviews cannot receive whole-essay scores", () => {
  for (const fields of [{ mode: "outline" }, { mode: "paragraph" }, { mode: "full_essay", completed: false }]) {
    const session = begin({ mode: fields.mode });
    const submission = submit(session, { completed: fields.completed ?? true });
    const saved = projectWriting([session, submission]).submissions[0];
    const request = { kind: "writing_review", payload: reviewPayload(saved), id: randomUUID(), recorded_at: at(120), events: [session, submission] };
    assert.throws(() => prepareWritingEvent(request), /完整作文分数/);
    const review = prepareWritingEvent({ ...request, payload: reviewPayload(saved, { result: result(null) }) });
    assert.equal(review.payload.result.score, null);
  }
});

test("projection detects duplicate submission corruption rather than silently overwriting the original", () => {
  const session = begin(), submission = submit(session);
  assert.throws(() => projectWriting([session, submission, { ...submission, id: randomUUID(), recorded_at: at(70) }]), /重复提交/);
  assert.throws(() => projectWriting([session, session]), /编号重复/);
  assert.throws(() => projectWriting([{ ...session, schema_version: 2 }]), /版本/);
  assert.throws(() => projectWriting([session, { ...submission, payload: { ...submission.payload, duration_seconds: 5 } }]), /快照/);
  assert.throws(() => projectWriting([session, { ...submission, payload: { ...submission.payload, score: 6 } }]), /字段/);
  assert.deepEqual(projectWriting([{ id: randomUUID(), kind: "attempt", payload: {}, recorded_at: start }]), { sessions: [], submissions: [], reviews: [], target: null });
  assert.equal(projectWriting([], "3.5").target, null);
  assert.equal(projectWriting([], 3.7).target, null);
});

test("same-millisecond sessions, submissions, reviews and revision parents replay in dependency order rather than UUID order", () => {
  const id = char => `${char.repeat(8)}-${char.repeat(4)}-4${char.repeat(3)}-8${char.repeat(3)}-${char.repeat(12)}`;
  const session = prepareWritingEvent({ kind: "writing_session", payload: sessionPayload(), id: id("f"), recorded_at: start });
  const original = prepareWritingEvent({ kind: "writing_submission", payload: submissionPayload(session, { snapshot_at: start }), id: id("d"), recorded_at: start, events: [session] });
  const saved = projectWriting([original, session]).submissions[0];
  const review = prepareWritingEvent({ kind: "writing_review", payload: reviewPayload(saved), id: id("b"), recorded_at: start, events: [original, session] });
  const revision = prepareWritingEvent({ kind: "writing_session", payload: sessionPayload({ topic: null, parent_id: original.id }), id: id("9"), recorded_at: start, events: [review, original, session] });
  const revised = prepareWritingEvent({ kind: "writing_submission", payload: submissionPayload(revision, { text: "A revised draft.", snapshot_at: start }), id: id("7"), recorded_at: start, events: [revision, review, original, session] });
  const events = [revised, revision, review, original, session];
  const before = structuredClone(events);
  const writing = projectWriting(events);
  assert.deepEqual(projectWriting([...events].reverse()), writing);
  assert.deepEqual(events, before);
  assert.equal(writing.sessions.length, 2);
  assert.equal(writing.submissions.length, 2);
  assert.equal(writing.reviews.length, 1);
  assert.equal(writing.submissions[0].parent_id, original.id);
  assert.equal(writing.reviews[0].submission_id, original.id);
  assert(writing.sessions.every(item => item.submitted));
});

test("dependency replay rejects missing references, cycles and impossible backwards timestamps", () => {
  const session = begin(), submission = submit(session);
  assert.throws(() => projectWriting([submission]), /依赖/);
  const cyclic = { ...session, payload: { ...session.payload, parent_id: submission.id } };
  assert.throws(() => projectWriting([cyclic, { ...submission, recorded_at: start }]), /循环依赖/);
  assert.throws(() => projectWriting([{ ...session, recorded_at: at(100) }, submission]), /时间早于/);
});
