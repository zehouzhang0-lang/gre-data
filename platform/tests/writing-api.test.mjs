import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("writing HTTP routes preserve isolation, provenance and original submissions", { timeout: 30000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-writing-api-"));
  await fs.writeFile(path.join(root, "profile.md"), "---\ntimezone: Asia/Shanghai\ntarget:\n  analytical_writing: 3.5\n---\n");
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../server/index.mjs", import.meta.url))], {
    env: { ...process.env, GRE_DATA_ROOT: root, PORT: String(port) }, windowsHide: true, stdio: "ignore",
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once("exit", resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let n = 0; n < 80; n++) {
    try { if ((await fetch(`${base}/api/state`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, "isolated API starts");
  const post = (url, payload, origin) => fetch(base + url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(payload),
  });
  const catalog = await (await fetch(`${base}/api/writing/topics`)).json();
  assert.equal(catalog.topics.length, 6);
  assert(catalog.topics.every(topic => topic.source_kind === "coach_original" && topic.prompt && topic.instructions && topic.translation));
  const initial = await (await fetch(`${base}/api/state`)).json();
  assert.equal(initial.writing.target, 3.5);
  const forged = await post("/api/events", { kind: "writing_review", payload: {} });
  assert.equal(forged.status, 400);
  assert.match((await forged.json()).error, /AI/);
  assert.equal((await post("/api/events", { kind: "writing_session", payload: {} }, "https://example.com")).status, 403);
  const sessionResponse = await post("/api/events", { kind: "writing_session", payload: { topic: catalog.topics[0], mode: "outline", condition: "practice", parent_id: null } });
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();
  const response = await post("/api/events", { kind: "writing_submission", payload: {
    session_id: session.id, text: "", outline: "A learner needs time to reason, but feedback can help when essential knowledge is missing.",
    assistance_used: false, completed: true, snapshot_at: new Date().toISOString(),
  } });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const saved = await response.json();
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.writing.submissions.length, 1);
  assert.equal(state.writing.submissions[0].id, saved.id);
  assert.equal(state.writing.sessions[0].submission_id, saved.id);
  assert.equal(state.attempts.length, 0);
  assert.equal(state.writing.reviews.length, 0);
  assert.equal((await post("/api/sync", {})).status, 400, "test data cannot be synchronized to Git");
});
