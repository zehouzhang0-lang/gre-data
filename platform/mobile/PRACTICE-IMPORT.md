# 手机刷题备份接入电脑学习仓

用户在手机导出 `gre-practice-backup`，交给电脑 Codex 并要求导入及同步后，在 GRE 仓库运行：

```powershell
node platform/mobile/scripts/import-practice-backup.mjs --backup "完整备份.json" --dry-run
node platform/mobile/scripts/import-practice-backup.mjs --backup "完整备份.json"
```

可用 `--root <GRE仓库绝对路径>` 指向隔离测试副本。`--dry-run` 不写任何目录、档案或学习记录。普通执行只追加通过校验的事实，**不执行 Git 同步**。导入后平台 `/api/state` 的原始作答 ID、时间、题号及计数即可读取；当前服务按磁盘内容刷新。教练核对无冲突后，再按根目录守则检查 `git status --short`，运行根 `sync.ps1` / `sync.sh`。必须依据远端结果另报推送状态，CLI 的 `gitSynced:false` 不能解释为已同步。

导入保留整个原始事件，包括顶层 `practice` 提交快照；不会调用会生成新时间的 `Store.append()`。同 ID、同内容跳过；同 ID 异内容、同草稿会话两次独立提交、草稿引用失配或损坏校验和都会停止。原始完整备份按原字节归档到忽略目录 `.gre-platform/mobile-backups/<整文件SHA256>.json`。

随 Git 保存的必要事实：

- `platform/events/<原UUID>.json`：原样作答事件，不造新 ID、不替换时间。
- `platform/mobile-imports/drafts/<SHA256(草稿ID)>.json`：所有原始草稿版本，包括未提交草稿；草稿不算完成。
- `platform/mobile-imports/legacy/<内容SHA256>.json`：原旧训练引用；不制造新 attempt。
- `platform/mobile-imports/ai-reviews/<原UUID>.json`：带原题与原作答引用的暂定 AI 解析；不生成作答，不覆盖答案。
- `platform/mobile-imports/imports/<规范payload的SHA256>.json`：版本1的导入清单，保存 dataset_id、seed_revisions、event_ids、草稿/旧训练/AI文件引用及 draft_heads；不复制手机偏好或完整存储。

所有冲突检查在写入前完成。通过后先保存草稿引用，再追加作答，最后保存清单；每个 JSON 使用独占原子发布，避免覆盖既有文件。断电可能留下部分已导入事实或忽略目录中的暂存文件，重试会跳过相同事实并补齐剩余部分。若出现 `.gre-platform/practice-import.lock`，先检查记录的进程是否仍在导入；不得同时从两个进程导入。

新提交的 `question_snapshot.version=2` 保存提交时的正文、选项顺序、作答模式、阅读文本与图片/原书来源引用，不含图片字节；旧快照继续原样兼容。备份包含全部草稿版本、原答案、答案键与判定，原判定不会被后续答案修改覆盖。电脑投影 `submitted_result`、`submitted_answer_key`、`practice` 保留原提交信息；常规 `result` 仍按电脑当前答案键核对。

APK 再导出时自动读取已导入的草稿、旧训练与 AI 引用，再与电脑作答事件和显式 `--backup` 合并。不得删掉 `practice` 或草稿引用来让题库打包通过。解析使用可选 `ai_reviews` 数组；旧备份缺省兼容，恢复和新版本合并都按原 ID 校验。

实现与测试不会自行导入用户真实备份。只有用户明确要求接入该份备份时才执行普通导入；先用 `--dry-run` 检查新增、重复及冲突。


## 0.3.0 接续状态（2026-10-27）

最新真实备份（整文件 SHA-256 前缀 `d29bf`）已完成实际导入：44条新增作答、253条重复事件、186个草稿版本、17条旧训练引用，0冲突。原始事件 ID、时间、答案、提交快照和引用保留；此计数描述入库结果，Git 推送结果由主线同步另行确认。

合格的手机 AI 解析侧车经严格校验后进入电脑 `state.reviews`，标记 `provider: chatgpt_plan`、`provisional: true`。普通作答沿用原事件 ID；批量作答按原题定位映射到电脑逐题 ID，同时保留 `source_attempt_id`。原文件事实不改写，解析不计作答，重复或冲突仍按原 ID 处理。0.3.0 已实现手机原生授权与解析链路，但尚未完成真机 OAuth 或真实订阅推理验收；首次授权和解析仍需在手机确认。
