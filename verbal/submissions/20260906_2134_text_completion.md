---
schema_version: 1
date: "2026-09-06"
started_at: "2026-09-06T21:33:42+08:00"
mode: text_completion
source:
  material_id: text_completion_2000
  unit: test1_section2_easy
  question_range: "3"
  page_range: "12"
timed: false
duration_min: null
total: 1
answered: 1
correct: 0
accuracy: 0
answer_source: coach_solved
question_types:
  - {type: text_completion_double, total: 1, correct: 0}
errors:
  - question_id: "3"
    tag: logic_signal
    user_answer: B/D
    correct_answer: A/F
    technique_ids: [v_tc_logic_map, v_tc_multi_blank_consistency]
technique_ids: [v_tc_logic_map, v_tc_multi_blank_consistency]
verification_sources:
  - https://www.merriam-webster.com/dictionary/sterling
  - https://www.merriam-webster.com/dictionary/ad%20hoc
  - https://www.merriam-webster.com/dictionary/gainsay
  - https://www.merriam-webster.com/dictionary/superficial
  - https://www.merriam-webster.com/dictionary/spontaneous
  - https://www.merriam-webster.com/dictionary/exhaustive
---

# 训练概览

Test 1 Section 2（easy）第 3 题，双空，未计时。用户选择 B/D，正确答案由整句逻辑和权威词典义核定为 A/F，整题 0/1。用户自报题意能理解，但不认识 `sterling` 和 `ad hoc existence of`。

# 作答记录

| 题号 | 用户答案 | 教练推导答案 | 结果 |
| --- | --- | --- | --- |
| 3 | B/D | A/F | 错误 |

# 错题证据与推理

**题意骨架**：考虑到委员会的某项特征和调查的某种性质，乍看之下，否定委员会结论是不合理的。

**决定性逻辑**：`gainsay` 是“否定、反驳”；`unreasonable to gainsay` 即“不应轻易否定”。因此前两个空必须共同提供信任委员会结论的正面理由：声誉极佳 + 调查全面彻底。

第一空：

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| A `sterling reputation of` | 极佳的、过硬的声誉 | 强化委员会可信度，正确。 |
| B `lack of finding of` | 缺少发现、没有调查结果 | 语义为负面且搭配生硬，不能支持“不应否定结论”。 |
| C `ad hoc existence of` | 为特定临时目的而存在/成立 | 临时设立本身不证明委员会可靠，排除。 |

第二空：

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| D `superficial` | 表面的、肤浅的、不深入的 | 用户所选；会削弱结论，方向相反。 |
| E `spontaneous` | 自发的、未经筹划的 | 不能说明调查可靠或全面。 |
| F `exhaustive` | 详尽全面的、穷尽所有可能的 | 强化调查可信度，正确。 |

**推理偏离**：B/D 都在削弱委员会。如果前提真是“没有发现 + 调查肤浅”，那么否定结论反而很合理，与主句冲突。用户虽然能理解大意，但作答没有完成“两个空 -> 主句结论”的全句回代；也可能未把 `gainsay` 的方向稳定转写为“否定”。

**错误类型**：以策略错误 `logic_signal` 为主，叠加 `sterling`、`ad hoc` 的知识缺口。

# 技巧映射

- `v_tc_logic_map`：状态保持 `learned`。应先固定 `unreasonable to gainsay = 不应否定`，预测两个空均为正向支持。
- `v_tc_multi_blank_consistency`：状态保持 `learned`。两个所选词必须彼此一致，还必须与主句结论一致；B/D 虽同为负面，却与主句冲突。

# 下次检验

1. 主动回忆 `gainsay / sterling / ad hoc / exhaustive`。
2. 口头完成逻辑链：`不应否定结论 <- 委员会声誉好 + 调查很全面`。
3. 再做一道不含本题生词的双空迁移题，检验是否能完成全句回代。

# 主动回忆复测

用户依次回忆 `gainsay / sterling / ad hoc / exhaustive` 为“否定、反驳 / 达到高标准的 / 临时专门的 / 详尽的”，核心义 4/4。

- `sterling` 在本题搭配 `reputation` 时应落实为“极佳的、过硬的”。
- `ad hoc` 的精确核心是“为当前特定目的或需要而设的”；它经常是临时的，但“临时”不是所有语境的唯一核心。
- `gainsay` 与 `exhaustive` 此前未被用户声明为生词，本轮仅记正确复测，不新增到难词池。

这一轮只验证词义；是否修复全句回代问题，仍需原创双空迁移题检验。
