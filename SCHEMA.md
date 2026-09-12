# GRE 数据规范

> 版本：1.0.0（2026-09-02）
> 本规范只服务 GRE General Test，不复用 IELTS 的分数、科目或题型字段。

## 学习平台扩展（2026-09-12）

用户授权在本仓库建设可迭代本地平台；平台源码、锁文件、启动脚本、skill与学习数据一起同步。`platform/events/<uuid>.json` 为追加式原子记录，包含 `schema_version: 1`、`id`、ISO UTC `recorded_at`、`kind`、`payload`。事件按时间再按ID重放；同ID同内容重试不重复创建，不同内容拒绝。

- `vocab_upsert`：word、meaning、pos、note。词形小写且合并连续空格；短语完整保存。释义标记用户编辑待核验。
- `vocab_delete` / `vocab_restore`：word。仅控制平台展示，不删除旧词库与历史。
- `vocab_recall`：word、answer原文、self_rating（remembered/partial/forgotten）、mode（recall/flashcard）、assessment固定self_reported。跳过不写记录；自评不自动更新difficult/mastered、旧作业覆盖数或技巧等级。教练核对后须另写原子记录并注明事件ID，防止重复计数。
- `attempt` / `attempts_import`：教材material、单元unit、题号question共同定位，type（tc/se/rc/quant）、answer原文、duration_seconds（未知null）、note。批量导入使用items数组。
- `questions_import` / `keys_import`：items数组，含共同定位、type、answer、explanation，answer_source固定user_provided；题目导入另含prompt与options文本数组。无答案或自由文本不能可靠比较时result=null。原始作答保留，显示核对按最新答案计算；历史答案事件均保留。不换算GRE量表分。
- `material_upload`：id、filename、repo_path、pages（未知null）、answer_status。用户主动上传的PDF保存为 `materials/uploads/<uuid>.pdf`，单份≤30MB。此目录为本次用户授权新增同步范围，现有materials/files资料与catalog保持原样。仅接收PDF，不扩大到其他任意二进制或隐私文件。

浏览器草稿只在本机暂存，不算完成。平台只读适配现有源文件，CRUD与自评从事件叠加，不静默重写旧训练证据。教练接续平台训练须同时读取平台事件。页面定期读取磁盘；跨设备通过显式Git同步，源码更新后重启服务。

## 核心原则

1. 每次训练一个原子文件；计划完成状态也采用追加式事件。
2. 原始题库、PDF、图片和答案文件可以在仓库内；Git 只保存来源定位、作答、错因和自写摘要和用户要求上传的资料。
3. 未知值使用 `null`，不得用 0、空字符串或猜测代替。
4. 原始正确数、正确率和量表分是不同概念，禁止无依据换算。
5. 所有 AI 作文分数和非官方 GRE 量表分必须明确标记为暂定或估算。

## 通用约定

- 日期：`YYYY-MM-DD`。
- 时间：ISO 8601，必须含时区或使用 UTC `Z`。
- 文件名：`YYYYMMDD_HHMM_来源简述.md`；同一分钟冲突时追加短 UUID。
- 标签与 ID：小写英文、数字和下划线。
- `accuracy`：0–1 小数，保留不超过 4 位；当 `correct` 不可验证时为 `null`。
- `answer_source`：`official | publisher | coach_solved | user_provided | unavailable`。
- `score_kind`：`official | mock_reported | estimated | raw_only`。
- 受版权保护的题干只保存必要短片段；优先保存材料 ID、题号、页码和用户自己的推理。

## 目录

```text
profile.md
scores.md
materials/catalog.yaml
verbal/submissions/*.md
quant/submissions/*.md
analytical-writing/submissions/*.md
mock-tests/*.md
vocab/days/*.md
vocab/difficult.yaml
vocab/mastered.yaml
techniques/mastery.yaml
planning/strategy.yaml
planning/30-day-plan.yaml
planning/days/*.yaml
planning/events/*.yaml
```

## `profile.md`

```yaml
---
schema_version: 1
created_at: "2026-09-02"
updated_at: "2026-09-02"
timezone: Asia/Shanghai
exam: gre_general
exam_date: null
exam_date_note: null
target:
  combined_vq: 325
  verbal: null
  quantitative: null
  analytical_writing: null
current:
  verbal: null
  quantitative: null
  analytical_writing: null
baseline_source: null
weekly_hours: null
focus: []
application_direction: null
---
```

约束：

- `target.verbal` / `target.quantitative`：130–170 的整数或 `null`。
- `target.combined_vq`：260–340 的整数或 `null`。
- `target.analytical_writing`：0–6、0.5 步进或 `null`。
- `current` 只用正式成绩或至少两次可比完整模考更新。
- `focus` 可选：`verbal | quantitative | analytical_writing | vocabulary | pacing`。

## `scores.md`

```yaml
---
schema_version: 1
records:
  - date: "2026-10-01"
    type: mock
    verbal: 158
    quantitative: 166
    analytical_writing: null
    combined_vq: 324
    score_kind: mock_reported
    source: powerprep_online_1
    conditions: full_timed
---
```

- `type`：`official | mock | diagnostic | partial`。
- `conditions`：`full_timed | section_timed | untimed | unknown`。
- `combined_vq` 在两项都有量表分时等于二者之和，否则为 `null`。
- 分节练习不写入此文件，写入对应 submissions。

## `materials/catalog.yaml`

每项至少包含：

```yaml
- id: reading_440
  filename: 张巍GRE阅读机经440篇.pdf
  pages: 397
  sha256: 64位十六进制
  role: primary_reading_drill
  answer_status: external_not_present
```

- `filename` 不含本机绝对路径。
- 本机资料根路径放在被忽略的 `.gre-materials.local.yaml`。
- 同内容不同排序用 `duplicate_content_group` 标记。
- `answer_status`：`included | external_available | external_not_present | not_applicable`。

## Verbal 训练记录

路径：`verbal/submissions/YYYYMMDD_HHMM_来源.md`

```yaml
---
schema_version: 1
date: "2026-09-08"
started_at: "2026-09-08T09:00:00+08:00"
mode: text_completion
source:
  material_id: text_completion_2000
  unit: sequential
  question_range: "1-35"
  page_range: null
timed: true
duration_min: 42
total: 35
answered: 35
correct: 27
accuracy: 0.7714
answer_source: publisher
question_types:
  - {type: text_completion, total: 25, correct: 18}
  - {type: sentence_equivalence, total: 10, correct: 9}
errors:
  - question_id: "12"
    tag: contrast_missed
    user_answer: B
    correct_answer: D
    technique_ids: [v_tc_logic_map]
technique_ids: [v_tc_logic_map, v_tc_multi_blank_consistency]
---
```

`mode`：`text_completion | sentence_equivalence | reading_comprehension | mixed | high_frequency_review`。

`question_types[].type`：

- `text_completion_single`
- `text_completion_double`
- `text_completion_triple`
- `sentence_equivalence`
- `rc_single_choice`
- `rc_multiple_choice`
- `rc_select_in_passage`

常用 `errors[].tag`：`vocab_gap | logic_signal | contrast_missed | scope | unsupported_inference | author_view | passage_structure | option_trap | misread | time_pressure`。

若答案不可得：

- `correct: null`
- `accuracy: null`
- `answer_source: unavailable`
- errors 只能记录用户不确定点，不能写伪造的 `correct_answer`。

正文建议：

```markdown
# 训练概览
# 作答记录
# 错题证据与推理
# 技巧映射
# 下次检验
```

## Quant 训练记录

路径：`quant/submissions/YYYYMMDD_HHMM_来源.md`

```yaml
---
schema_version: 1
date: "2026-09-08"
started_at: "2026-09-08T10:00:00+08:00"
mode: mixed
source:
  material_id: quant_900
  question_range: "1-35"
  page_range: null
timed: true
duration_min: 48
total: 35
answered: 35
correct: 31
accuracy: 0.8857
answer_source: publisher
question_types:
  - {type: quantitative_comparison, total: 14, correct: 12}
  - {type: single_choice, total: 15, correct: 14}
  - {type: multiple_choice, total: 3, correct: 2}
  - {type: numeric_entry, total: 3, correct: 3}
content_areas:
  - {area: arithmetic, total: 8, correct: 8}
  - {area: algebra, total: 10, correct: 8}
  - {area: geometry, total: 8, correct: 7}
  - {area: data_analysis, total: 9, correct: 8}
errors:
  - question_id: "19"
    tag: edge_case
    user_answer: A
    correct_answer: D
    technique_ids: [q_qc_counterexample]
calculator_used: true
technique_ids: [q_translate_constraints, q_error_checklist]
---
```

`question_types[].type`：`quantitative_comparison | single_choice | multiple_choice | numeric_entry | data_interpretation`。

`content_areas[].area`：`arithmetic | algebra | geometry | data_analysis`。

常用错因：`concept_gap | setup_error | calculation | misread | edge_case | unit | percent_base | time_pressure | calculator_misuse`。

答案不可得时的规则与 Verbal 相同。

## Analytical Writing 记录

路径：`analytical-writing/submissions/YYYYMMDD_HHMM_issue.md`

```yaml
---
schema_version: 1
date: "2026-09-28"
started_at: "2026-09-28T14:00:00+08:00"
task: analyze_an_issue
source:
  material_id: ets_issue_pool
  topic_id: null
  source_url: https://www.ets.org/pdfs/gre/issue-pool.pdf
mode: outline
timed: true
duration_min: 8
word_count: null
score:
  overall: null
  provisional: true
dimensions:
  position: null
  development: null
  organization: null
  language_control: null
  task_fulfillment: null
errors: []
technique_ids: [aw_issue_position, aw_paragraph_reasoning]
---
```

- `task` 固定为 `analyze_an_issue`；旧制 Argument 不写为现行模考任务。
- `mode`：`outline | full_essay | revision`。
- `score.overall`：0–6、0.5 步进或 `null`。
- AI 评分必须 `provisional: true`。
- 正文保留题目定位、用户大纲/作文、证据化反馈和下一次动作。

## 完整模考记录

路径：`mock-tests/YYYYMMDD_HHMM_来源.md`

```yaml
---
schema_version: 1
date: "2026-09-28"
source: powerprep_online_1
conditions: full_timed
started_at: "2026-09-28T08:00:00+08:00"
duration_min: 118
sections:
  analytical_writing: {completed: true, score: null, score_kind: raw_only}
  verbal_1: {total: 12, correct: 9}
  verbal_2: {total: 15, correct: 10, adaptive_level: null}
  quantitative_1: {total: 12, correct: 11}
  quantitative_2: {total: 15, correct: 13, adaptive_level: null}
reported_scores:
  verbal: null
  quantitative: null
  analytical_writing: null
  combined_vq: null
score_kind: raw_only
answer_source: official
---
```

- 模考若不是自适应官方平台，不得把自组题的 raw correct 当成官方量表分。
- `duration_min` 记录实际用时，不自动写标准时长。

## 词汇日记

路径：`vocab/days/dayNN.md`

```yaml
---
schema_version: 1
day: 1
date: "2026-09-02"
source:
  material_id: core3000_random_2026
  units: [list1, list2, list3]
target_count: 300
reviewed_count: 300
recall_test:
  total: 60
  correct: 44
  wrong: [word_a, word_b]
difficult_added: [word_a, word_b]
mastered_today: []
duration_min: 95
---
```

- `reviewed_count` 是实际接触数量；`recall_test` 才是记忆证据。
- 只看完 300 个词不能记为掌握 300 个词。
- `vocab/difficult.yaml`：

```yaml
schema_version: 1
items:
  - {word: example, added_on: "2026-09-02", review_count: 1, correct_streak: 0, last_review: "2026-09-02", source: core3000_random_2026}
```

- 连续 3 次在主动回忆测试中正确后移至 `vocab/mastered.yaml`。

## 词汇导入与释义库

`vocab/imports/YYYYMMDD_HHMM_来源.{json,md}` 保存手写或其他材料的原子导入记录；`vocab/lexicon.json` 按规范词形去重，保存词性、中文核心义、例搭配、语体或褒贬说明、词典核验 URL 与日期、来源批次与图片序号、词形修订说明及复测证据。没有原例句时 `original_context` 为 `null`，核心义不冒充原句语境义。图片本身不随文本导入自动上传。

手写不清的条目放在导入文件的 `pending_transcriptions`，确认前不进入正式抽测池。复数或屈折变化归到词元；有独立用法的派生词可以单列并保存关联。已有词保留原复测历史，只追加来源；新接触而未测试的词 `initial_result: null`、`review_count: 0`、`correct_streak: 0`、`last_review: null`。新增与复现分开计数。

## 手机词汇作业

路径：`vocab/homework/YYYYMMDD_HHMM_来源简述.{md,json,html}`。Markdown 保存任务范围、操作与验证；JSON 保存 `schema_version`、`assignment_id`、含时区的 `generated_at`、`scope`、`counts`、`items`、`instructions`；HTML 为用户请求的可离线使用文本页面。

每个词条保留 `word`、`pos`、`meaning`、`collocation`、`note`、`source_records`、`evidence`、`category`、`priority`、`dictionary_url` 与释义来源说明。原记录没有的复测证据为 `null`，新增与旧词再暴露分开计数。

页面导出的结果包含作业 ID、导出时间及每项回忆与 `self_rating`（`remembered | partial | forgotten | null`）。自评只作复盘线索；生成作业不记为完成训练，不自动更新掌握度。

## 技巧掌握度

`techniques/mastery.yaml` 状态：

- `unknown`：不知道。
- `learned`：可复述，尚无计时证据。
- `applied`：有计时成功证据。
- `reliable`：至少 3 次、跨至少 2 天的计时成功证据。

证据格式：

```yaml
evidence:
  - date: "2026-09-08"
    record: verbal/submissions/20260908_0900_text_completion.md
    result: success
    note: 5 道转折题 5/5，均先预测再选项
```

`result`：`success | failure | mixed`。状态升降必须有证据。

## 30 天主计划

`planning/30-day-plan.yaml` 是用户提供图片计划的规范化原始版本，需保留以便审计。当前实际执行的计划由 `planning/strategy.yaml.plan_file` 指向；若基于训练证据改版，可以使用新的计划文件（例如 `planning/adaptive-30-day-plan.yaml`），不得覆盖或删除原始版本。每个活动计划的 day 至少包含：

- `day`：1–30，唯一。
- `date`：与 `starts_on` 连续对应。
- `phase`：`foundation | volume | high_frequency | simulation`。
- 当日任务与数量、材料 ID、顺序范围。

原图使用范围时，规范化文件必须在 `execution_rules` 中记录取值规则，不得每日随意改变。

## 每日计划快照

路径：`planning/days/YYYY-MM-DD.yaml`

```yaml
schema_version: 1
date: "2026-09-02"
timezone: Asia/Shanghai
strategy_id: gre-30d-325-20260902-v1
source_day: 1
generated_at: "2026-09-02T13:00:00+08:00"
tasks:
  - id: 2026-09-02-01-vocab
    order: 1
    key: vocab
    target: 300词
    material_id: core3000_random_2026
    material_status: available
    evidence_required: [实际学习数量, 主动回忆测试结果, 难词列表]
notes: []
```

快照生成后不得静默漂移。用户明确要求改版时可以修订，但必须增加 `revision`、`revised_at` 和 `revision_reason`，并保留被替代任务及其 disposition。缺失材料仍保留任务，并写 `material_status: missing`；若任务因用户要求正式退出计划，则记录为 superseded，不算 debt。

## 完成事件

路径：`planning/events/YYYYMMDD_UUID.yaml`

```yaml
schema_version: 1
event_id: 123e4567-e89b-42d3-a456-426614174000
plan_date: "2026-09-02"
task_id: 2026-09-02-01-vocab
status: done
recorded_at: "2026-09-02T15:00:00+08:00"
actual_min: 95
note: 完成300词；抽测60题44对；16词进入难词池
evidence_records:
  - vocab/days/day01.md
```

- `status`：`todo | done | skipped | blocked`。
- 每次状态变化新增事件，不改旧事件。
- `done` 必须有正整数 `actual_min`、非空 `note` 和至少一个证据记录。
- `blocked` 必须写明缺失材料或其他客观原因。
- 聚合时按 `recorded_at`、再按 `event_id` 取最后状态。

## 隐私、版权与同步校验

提交前必须确认：

1. 没有密钥。
2. 没有成绩单原件、证件、账号信息或申请隐私。
3. 没有大段复制题库或解析。
4. 所有来源 ID 能在 `materials/catalog.yaml` 找到，或标为官方 URL。
5. 答案不可得时没有虚构正确率。
6. `git status --short` 中只有预期文本数据。
