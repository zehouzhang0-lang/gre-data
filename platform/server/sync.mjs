import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export const EXPECTED_REMOTE =
  "https://github.com/zehouzhang0-lang/gre-data.git";
export async function git(root, args) {
  try {
    const out = (
      await exec("git", args, {
        cwd: root,
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
    ).stdout;
    return args.includes("-z") ? out : out.trim();
  } catch (e) {
    throw new Error((e.stderr || e.message).trim());
  }
}
export async function syncProgress(root) {
  if ((await git(root, ["remote", "get-url", "origin"])) !== EXPECTED_REMOTE)
    throw new Error("仓库地址不匹配，已停止同步");
  const branch = await git(root, ["branch", "--show-current"]);
  if (!branch)
    throw new Error("当前工作副本未挂在分支上，请让教练处理后再同步");
  if (await git(root, ["diff", "--name-only", "--diff-filter=U"]))
    throw new Error("存在合并冲突，请让教练处理；两侧记录均保留");
  // NUL-separated porcelain avoids quoting/unicode problems. Only append-only events may be committed here.
  const status = await git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const rows = status.split("\0").filter(Boolean);
  const permitted = (f) =>
    /^(platform\/events\/[0-9a-f-]+\.json|materials\/uploads\/[0-9a-f-]+\.pdf)$/.test(
      f,
    );
  if (
    rows.some(
      (row) =>
        !["??", " A", "A "].includes(row.slice(0, 2)) ||
        !permitted(row.slice(3)),
    )
  ) {
    throw new Error(
      "检测到平台记录以外的修改，请先由教练检查并提交，再同步进度",
    );
  }
  if (rows.length) {
    await git(root, ["add", "--", ...rows.map((row) => row.slice(3))]);
    await git(root, ["diff", "--cached", "--check"]);
    await git(root, [
      "commit",
      "-m",
      "practice: save workbench learning events",
    ]);
  }
  await git(root, ["fetch", "origin"]);
  const ahead = await git(root, ["diff", "--name-only", "origin/main...HEAD"]);
  if (
    ahead
      .split("\n")
      .filter(Boolean)
      .some((f) => !permitted(f))
  )
    throw new Error("分支包含尚未发布的代码修改，请先由教练完成发布");
  await git(root, ["rebase", "origin/main"]);
  await git(root, ["push", "origin", "HEAD:main"]);
  return {
    message: "进度已同步到 GitHub，已读取远端最新记录",
    synced_at: new Date().toISOString(),
  };
}
