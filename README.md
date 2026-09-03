# GRE 备考数据仓库

这是一个独立的 GRE General Test AI 教练与学习数据仓库。它与 [`ielts-data`](https://github.com/zehouzhang0-lang/ielts-data) 完全分离，只借鉴其“文本数据 + 明确规范 + Git 多设备同步”的工作模式。

仓库保存可审计的学习记录，不保存受版权保护的整本资料、PDF、截图、音视频、账号信息或密钥。

## 当前状态

基础设施和 30 天计划已经建立。当前目标为 Verbal + Quantitative 合计 320，暑假每天可投入约 6 小时，计划从 2026-09-02 的 Day 1 执行到 2026-10-01 的 Day 30。Day 1 实测 102 词约需 120 分钟后，原图的高负荷计划已降级为来源参考；当前执行 `planning/adaptive-30-day-plan-v4.yaml`。个人档案仍需补充：

- 目标 Verbal / Quantitative / Analytical Writing 分数
- 计划考试日期
- 最近一次正式或完整模考成绩
- 申请方向和优先弱项

未知信息在 `profile.md` 中保持 `null`，不会从雅思项目推断或复制。用户提供的 10 份 PDF 已建立哈希索引，原件保存在仓库外的 `.gre-media` 目录。

## 目录结构

```text
gre-data/
├── AGENTS.md                         # AI 教练的最高优先级工作规则
├── CODEX-KICKOFF.md                  # 新设备接管说明
├── SCHEMA.md                         # 所有学习记录的数据规范
├── profile.md                        # 目标、考期、基线和时间预算
├── scores.md                         # 正式考试与模考分数历史
├── materials/                        # 外置 PDF 的文件名、哈希和可用性
├── verbal/submissions/               # Verbal 分节练习与错题分析
├── quant/submissions/                # Quant 分节练习与错题分析
├── analytical-writing/submissions/   # Analyze an Issue 写作记录
├── mock-tests/                       # 完整模考记录
├── vocab/                            # 词汇日记、难词池和已掌握词
├── techniques/                       # 技巧卡与掌握度证据
├── planning/                         # 策略、每日计划和追加式完成事件
└── knowledge/                        # 自写笔记和合法来源索引
```

## 多设备同步

每次学习开始先拉取，结束后运行同步脚本：

```powershell
./sync.ps1
```

或在 Git Bash / macOS / Linux 中运行：

```bash
./sync.sh
```

不要在两台设备上同时改同一份文件。训练记录优先使用“每次训练一个新文件”的原子模式，减少冲突。

## 30 天计划

`planning/30-day-plan.yaml`、`planning/adaptive-30-day-plan.yaml` 和 `planning/adaptive-30-day-plan-v3.yaml` 均保留为历史版本。当前主计划是 `planning/adaptive-30-day-plan-v4.yaml`：标准日为 330 分钟专注学习加 30 分钟休息；普通日 120 个新词，模考日 60 个，复盘日 80 个，同时保留主动回忆、Verbal、Quant、错题和周期性写作训练。第一次完整模考已按用户要求顺延至 Day 7，次日预留复盘。

`planning/strategy.yaml` 的 `plan_file` 是跨设备接管时唯一的当前计划入口；不得仅凭文件名重新启用旧计划。

当前资料缺口在 `materials/catalog.yaml` 中维护：Day 1–6 所需的 `GRE 小白入门`、`GRE 数学满分宝典`，以及四套题库的独立答案/解析文件尚未提供。

## 官方制式基线

本仓库按 2026-09-02 核对到的 ETS GRE General Test 规则建模：Verbal 和 Quantitative 各为 130–170 分、1 分递增；Analytical Writing 为 0–6 分、0.5 分递增。机考的 Verbal 和 Quantitative 均为 section-level adaptive，原始正确题数不能脱离官方换算直接当成精确量表分。

考试规则会变化。涉及考试结构、报名、费用、送分和证件要求时，以 ETS 当日官方页面为准。
