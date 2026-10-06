import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { createRefreshQueue } from "../shared/refresh-queue.mjs";
import { projectRelations } from "../server/word-relations.mjs";

test("cached reads see external replacements, additions, deletions and do not retain caller mutations", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gre-cache-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root);
  await fs.writeFile(path.join(root, "data.json"), '{"value":"old"}');
  const old = await store.json("data.json");
  old.value = "caller mutation";
  assert.equal((await store.json("data.json")).value, "old");
  const stat = await fs.stat(path.join(root, "data.json"));
  await fs.writeFile(path.join(root, "replacement"), '{"value":"new"}');
  await fs.utimes(path.join(root, "replacement"), stat.atime, stat.mtime);
  await fs.rename(path.join(root, "replacement"), path.join(root, "data.json"));
  assert.equal((await store.json("data.json")).value, "new");
  await fs.writeFile(path.join(root, "data.json"), '{"value":"edited externally"}');
  assert.equal((await store.json("data.json")).value, "edited externally");
  await fs.writeFile(path.join(root, "data.json"), '{invalid');
  await assert.rejects(store.json("data.json"), SyntaxError);
  await fs.unlink(path.join(root, "data.json"));
  assert.deepEqual(await store.json("data.json"), {});
  assert.deepEqual(await store.yaml("new.yaml"), {});
  await fs.writeFile(path.join(root, "new.yaml"), "items: [new]\n");
  assert.deepEqual(await store.yaml("new.yaml"), { items: ["new"] });

  await store.append("attempt", { material: "test", unit: "one", question: "1", answer: "A", type: "tc" });
  assert.equal((await store.state()).attempts.length, 1);
  const external = new Store(root);
  const event = await external.append("attempt", { material: "test", unit: "one", question: "2", answer: "B", type: "tc" });
  assert.equal((await store.state()).attempts.length, 2);
  await fs.unlink(path.join(root, "platform/events", `${event.id}.json`));
  assert.equal((await store.state()).attempts.length, 1);
});

test("slow polling cannot overlap or discard a completed snapshot; post-save refresh reads again", async () => {
  const pending = [], applied = [];
  const queue = createRefreshQueue(() => new Promise((resolve, reject) => pending.push({ resolve, reject })).then(value => applied.push(value)));
  const first = queue.refresh();
  await Promise.resolve();
  await queue.poll();
  await queue.poll();
  assert.equal(pending.length, 1);
  const afterWrite = queue.refresh();
  pending[0].resolve("before write");
  await first;
  await Promise.resolve();
  assert.deepEqual(applied, ["before write"]);
  assert.equal(pending.length, 2);
  pending[1].resolve("after write");
  await afterWrite;
  assert.deepEqual(applied, ["before write", "after write"]);

  const failed = queue.refresh();
  await Promise.resolve();
  pending[2].reject(new Error("offline"));
  await assert.rejects(failed, /offline/);
  const recovered = queue.poll();
  await Promise.resolve();
  pending[3].resolve("recovered");
  await recovered;
  assert.equal(applied.at(-1), "recovered");
});

test("fast spelling filter preserves full edit-distance suggestions", () => {
  function distance(a, b) {
    const table = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    table[0] = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
    return table[a.length][b.length];
  }
  const words = new Set(["abcdefgh", "abxdxfgh", "xbcdefgh", "bcdefgh", "abcefgh", "abcdefghi", "abcdxfghi", "accdxfgh"]);
  for (let n = 0; n < 81; n++) {
    const word = n.toString(3).padStart(4, "0").replaceAll("0", "a").replaceAll("1", "b").replaceAll("2", "c");
    words.add(word); words.add(word + "a");
  }
  const candidates = [...words].sort(), expected = [];
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const a = candidates[i], b = candidates[j], d = distance(a, b);
    if (Math.abs(a.length - b.length) <= 1 && (d <= 1 || d === 2 && Math.min(a.length, b.length) >= 8 && a.slice(0, 2) === b.slice(0, 2)))
      expected.push({ pair: `${a}|${b}`, words: [a, b], distance: d });
  }
  expected.sort((a, b) => a.distance - b.distance || a.pair.localeCompare(b.pair));
  assert.deepEqual(projectRelations(candidates.map(word => ({ word })), {}, []).suggestions, expected);
});
