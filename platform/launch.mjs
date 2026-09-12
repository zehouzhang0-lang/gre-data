import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 4173),
  url = `http://127.0.0.1:${port}`;
async function runNpm(args) {
  const cli = path.join(
    path.dirname(process.execPath),
    "node_modules/npm/bin/npm-cli.js",
  );
  const exists = await fs.access(cli).then(
    () => true,
    () => false,
  );
  await new Promise((resolve, reject) => {
    const child = exists
      ? spawn(process.execPath, [cli, ...args], {
          cwd: root,
          stdio: "inherit",
          windowsHide: true,
        })
      : spawn("npm", args, { cwd: root, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`npm ${args.join(" ")} failed (${code})`)),
    );
  });
}
try {
  const response = await fetch(`${url}/api/state`, {
    signal: AbortSignal.timeout(1500),
  });
  if (response.ok && (await response.json()).vocabulary) {
    console.log(`平台已运行：${url}`);
    process.exit(0);
  }
  throw new Error(`端口${port}被其他程序占用`);
} catch (e) {
  if (e.message.includes("被其他程序")) throw e;
}
if (
  process.argv.includes("--install") ||
  !(await fs.access(path.join(root, "node_modules")).then(
    () => true,
    () => false,
  ))
)
  await runNpm(["ci"]);
await runNpm(["run", "build"]);
await fs.mkdir(path.join(root, ".gre-platform"), { recursive: true });
const log = openSync(path.join(root, ".gre-platform/server.log"), "a");
const child = spawn(
  process.execPath,
  [path.join(root, "platform/server/index.mjs")],
  {
    cwd: root,
    env: process.env,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  },
);
child.unref();
await fs.writeFile(
  path.join(root, ".gre-platform/server.json"),
  JSON.stringify({ pid: child.pid, port, root }),
);
for (let i = 0; i < 30; i++) {
  try {
    const r = await fetch(`${url}/api/state`);
    if (r.ok) {
      console.log(`GRE学习工作台已启动：${url}`);
      process.exit(0);
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 300));
}
throw new Error("启动失败，请查看 .gre-platform/server.log");
