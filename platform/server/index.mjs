import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Store } from "./store.mjs";
import { syncProgress } from "./sync.mjs";
const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const root = process.env.GRE_DATA_ROOT
  ? path.resolve(process.env.GRE_DATA_ROOT)
  : appRoot;
const store = new Store(root);
const port = Number(process.env.PORT || 4173);
const dev = process.argv.includes("--dev");
const vite = dev
  ? await (
      await import("vite")
    ).createServer({
      configFile: path.join(appRoot, "platform/vite.config.js"),
      server: {
        middlewareMode: true,
        hmr: { port: port + 1, host: "127.0.0.1" },
      },
      appType: "spa",
    })
  : null;
let busy = false;
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function body(req, limit = 2 * 1024 * 1024) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("请使用JSON上传");
  let result = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("上传内容过大，请分批导入");
    result += chunk;
  }
  return JSON.parse(result);
}
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowed.includes(host))
      return json(res, 403, { error: "仅限本机访问" });
    if (
      req.headers.origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
        req.headers.origin,
      )
    )
      return json(res, 403, { error: "请求来源不匹配" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return json(res, 403, { error: "不接受跨站请求" });
    const url = new URL(req.url, `http://${host}`);
    if (req.method === "GET" && url.pathname === "/api/state") {
      const state = await store.state();
      return json(
        res,
        200,
        url.searchParams.get("revision") === state.revision
          ? { unchanged: true }
          : state,
      );
    }
    if (
      req.method === "POST" &&
      ["/api/events", "/api/sync", "/api/upload-pdf"].includes(url.pathname)
    ) {
      if (busy) return json(res, 409, { error: "正在保存或同步，请稍后重试" });
      busy = true;
      try {
        const data = await body(
          req,
          url.pathname === "/api/upload-pdf" ? 42 * 1024 * 1024 : undefined,
        );
        if (url.pathname === "/api/upload-pdf") {
          if (
            typeof data.filename !== "string" ||
            !/\.pdf$/i.test(data.filename) ||
            data.filename.length > 300 ||
            typeof data.content !== "string"
          )
            throw new Error("请选择PDF文件");
          const buffer = Buffer.from(data.content, "base64");
          if (
            buffer.length > 30 * 1024 * 1024 ||
            buffer.subarray(0, 5).toString() !== "%PDF-"
          )
            throw new Error("需要有效PDF，单份最大30MB");
          const id = randomUUID();
          const relative = `materials/uploads/${id}.pdf`;
          await fs.mkdir(path.join(root, "materials/uploads"), {
            recursive: true,
          });
          await fs.writeFile(path.join(root, relative), buffer, { flag: "wx" });
          const event = await store.append("material_upload", {
            id,
            filename: data.filename,
            repo_path: relative,
          });
          return json(res, 201, event);
        }
        if (url.pathname === "/api/sync") {
          if (root !== appRoot) throw new Error("隔离测试模式不允许同步Git");
          return json(res, 200, await syncProgress(root));
        }
        if (data.kind === "material_upload")
          throw new Error("请通过PDF上传入口添加资料");
        return json(
          res,
          201,
          await store.append(data.kind, data.payload, data.id),
        );
      } finally {
        busy = false;
      }
    }
    if (req.method === "GET" && url.pathname === "/api/record") {
      const file = url.searchParams.get("path");
      const state = await store.state();
      if (!state.history.some((r) => r.path === file))
        return json(res, 404, { error: "记录不存在" });
      return json(res, 200, { text: await store.read(file) });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/material/")) {
      const state = await store.state();
      const material = state.materials.find(
        (m) => m.id === decodeURIComponent(url.pathname.slice(14)),
      );
      if (!material?.available)
        return json(res, 404, { error: "本机尚无此教材，请拉取仓库资料" });
      const filename = path.resolve(root, material.repo_path);
      if (
        !["materials/files", "materials/uploads"].some((dir) =>
          filename.startsWith(path.join(root, dir) + path.sep),
        )
      )
        return json(res, 403, { error: "材料路径不合法" });
      const { size } = await fs.stat(filename);
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      res.writeHead(range ? 206 : 200, {
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      createReadStream(filename, { start, end })
        .on("error", () => res.destroy())
        .pipe(res);
      return;
    }
    if (url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "接口不存在" });
    if (vite) return vite.middlewares(req, res);
    const base = path.join(appRoot, "platform/dist");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let filename = path.resolve(base, relative || "index.html");
    if (filename !== base && !filename.startsWith(base + path.sep))
      return json(res, 403, { error: "路径不合法" });
    try {
      if (!(await fs.stat(filename)).isFile())
        filename = path.join(base, "index.html");
    } catch {
      filename = path.join(base, "index.html");
    }
    const content = await fs.readFile(filename);
    res.writeHead(200, {
      "Content-Type":
        {
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".css": "text/css",
          ".html": "text/html; charset=utf-8",
          ".svg": "image/svg+xml",
        }[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message });
    else res.destroy();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `GRE 学习工作台 http://127.0.0.1:${port} (${dev ? "开发" : "本地"}模式)`,
  ),
);
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `端口${port}已被使用，请检查已有平台或设置PORT`
      : e,
  );
  process.exitCode = 1;
});
