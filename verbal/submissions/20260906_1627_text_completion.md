---
schema_version: 1
date: "2026-09-06"
started_at: "2026-09-06T16:13:03+08:00"
mode: text_completion
source:
  material_id: text_completion_2000
  unit: test1_section1_easy
  question_range: "1-3"
  page_range: "11"
timed: false
duration_min: null
total: 3
answered: 3
correct: 1
accuracy: 0.3333
answer_source: coach_solved
question_types:
  - {type: text_completion_single, total: 1, correct: 0}
  - {type: text_completion_double, total: 1, correct: 1}
  - {type: text_completion_triple, total: 1, correct: 0}
errors:
  - question_id: "1"
    tag: vocab_gap
    user_answer: D
    correct_answer: B
    technique_ids: [v_tc_logic_map]
  - question_id: "3"
    tag: logic_signal
    user_answer: B/E/I
    correct_answer: B/E/G
    technique_ids: [v_tc_logic_map, v_tc_multi_blank_consistency]
technique_ids: [v_tc_logic_map, v_tc_multi_blank_consistency]
verification_sources:
  - https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html
  - https://www.merriam-webster.com/dictionary/cosmopolitan
  - https://www.merriam-webster.com/dictionary/insular
  - https://www.merriam-webster.com/dictionary/capricious
  - https://www.merriam-webster.com/dictionary/mercenary
  - https://www.merriam-webster.com/dictionary/idealistic
  - https://www.merriam-webster.com/dictionary/intransigent
  - https://www.merriam-webster.com/dictionary/dearth
  - https://www.merriam-webster.com/dictionary/presumption
  - https://www.merriam-webster.com/dictionary/detection
  - https://www.merriam-webster.com/dictionary/controversial
  - https://www.merriam-webster.com/dictionary/unambiguous
  - https://www.merriam-webster.com/dictionary/possible
  - https://www.merriam-webster.com/dictionary/effect
  - https://www.merriam-webster.com/dictionary/origin
  - https://www.merriam-webster.com/dictionary/purpose
  - https://www.merriam-webster.com/dictionary/pressure
  - https://www.merriam-webster.com/dictionary/produce
  - https://www.merriam-webster.com/dictionary/suffer
  - https://www.merriam-webster.com/dictionary/beetle
  - https://www.merriam-webster.com/dictionary/eat
  - https://www.merriam-webster.com/dictionary/neutralize
  - https://www.merriam-webster.com/dictionary/poison
---

# 训练概览

首次填空短诊断，材料为 test 1 section 1（easy）第 1–3 题，未计时。整题正确 1/3；第 2 题虽答对，但用户明确表示为猜测，不能作为技巧已掌握的证据。出版社答案尚未取得，本次答案标记为教练依据题干逻辑独立推导。

# 作答记录

| 题号 | 用户答案 | 教练推导答案 | 整题结果 |
| --- | --- | --- | --- |
| 1 | D | B | 错误 |
| 2 | C/E | C/E | 正确（猜测） |
| 3 | B/E/I | B/E/G | 错误；前两空正确 |

# 错题本：逐题与逐选项解析

## 第 1 题

**题意骨架（不抄录完整题干）**：维多利亚时代的人具有一种 `paradox`：他们既 ___，又因帝国扩张而 `cosmopolitan`。

**正确答案：B `insular`。** `paradox` 是决定性逻辑词；`both X and cosmopolitan` 要求 X 与“世界性的、见多识广的”构成明显反差，所以先预测“封闭、狭隘、眼界受限”，再匹配选项。

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| A `capricious` | adj. 受突然而不可预测的念头支配的；反复无常的、任性的 | 语法上可放入，但“反复无常”不与 `cosmopolitan` 构成题干要求的反义轴，排除。 |
| B `insular` | adj. 与其他文化隔绝的；思想狭隘、对新观念不开放的 | 与 `cosmopolitan` 精确对立，且制造 `paradox`，正确。 |
| C `mercenary` | adj. 为金钱或私利所驱使的、唯利是图的；n. 雇佣兵 | “金钱动机”与“世界眼界”不是同一语义维度，排除。 |
| D `idealistic` | adj. 由理想驱动的、理想主义的，有时含“不切实际”色彩 | 用户所选；它与 `cosmopolitan` 可以同时成立，不形成必需的悖论式反差，排除。 |
| E `intransigent` | adj. 拒绝妥协或改变立场的；不妥协的、顽固的 | “立场顽固”与“世界性的”并非明确反义，排除。 |

**推理偏离与修正**：用户因不认识选项和 `cosmopolitan` 而猜 D。真正可迁移的动作是：即使词汇不全，也先把 `paradox` 圈出，写下“X ↔ cosmopolitan”的反义预测，再在选项中寻找“封闭/狭隘”。本轮即时回忆中，用户已正确说出 `insular` = “封闭的、狭隘的”，`cosmopolitan` = “世界性的、见识多广的”；这是词义纠正成功，但还不足以证明计时应用稳定。

## 第 2 题

**题意骨架**：分子氧的 ___ 不能成为 ___ 的生命迹象，因为氧既可能来自生物过程，也可能来自非生物过程。

**正确答案：C `detection` + E `an unambiguous`。** 冒号后的解释给出两个可能来源；因此“检测到氧”是现象，但这个现象不能被唯一解释为生命活动。

第一空：

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| A `dearth` | n. 缺乏、短缺；常见搭配 `a dearth of ...` | 后文讨论“氧气可能成为生命迹象”，前提是氧被发现，而非氧气短缺，排除。 |
| B `presumption` | n. 推定、假设；也可指放肆、自以为是 | `presumption of molecular oxygen` 表示对氧存在的推定，不是题目所说的观测事实；与后文“氧可作为迹象”的关系也弱，排除。 |
| C `detection` | n. 发现、探测到；识别出某物的存在 | “探测到分子氧”自然承接后文关于氧来源的讨论，正确。 |

第二空：

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| D `controversial` | adj. 引发争议的、有争议的 | 句子的问题是证据有两种解释，并非人们是否争论它，排除。 |
| E `unambiguous` | adj. 清楚且只有一种解释的、毫无歧义的 | 在否定结构中正合逻辑：氧气可由两类过程产生，所以它不是“无歧义”的生命迹象，正确。 |
| F `possible` | adj. 可能的、能够发生或成立的 | 若填入则成“不是可能的生命迹象”，过度否定；生物光合作用说明氧仍可能是生命迹象，只是不能单独证明生命，排除。 |

**推理偏离与修正**：用户选择 C/E，整题客观上答对；但当时明确表示“看不懂 A、B，猜 C/E”。这属于“结果正确、过程证据不足”，所以保留 1 个 raw correct，同时纳入错题本作为过程性错题。下次必须能说出：`biotic or abiotic → more than one explanation → not unambiguous`。

## 第 3 题

**题意骨架**：毒蛙皮肤含有毒素；毒素的 (i) 尚不清楚，因为青蛙并不自行 (ii) 它们；某些甲虫含有相同毒素，因此甲虫很可能被青蛙 (iii)。

**正确答案：B `origin` + E `produce` + G `eaten`。** 三空必须形成一条方向一致的因果链：`甲虫含毒素 → 青蛙吃甲虫 → 毒素进入并积累在青蛙体内`。

第一空：

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| A `effect` | n. 由某个原因产生的结果、后果 | 后文在追查毒素从哪里来，不是在讨论毒素造成何种效果，排除。 |
| B `origin` | n. 起源、来源、开端 | “青蛙不自行制造 + 甲虫含相同毒素”都在回答来源问题，正确。 |
| C `purpose` | n. 目的、意图、用途 | 甲虫作为潜在来源不能说明毒素的目的，排除。 |

第二空：

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| D `pressure` | v. 向……施压、迫使；n. 压力 | `pressure the toxins` 无法解释毒素来源，搭配与语义均不成立，排除。 |
| E `produce` | v. 制造、产生 | “青蛙不自行产生毒素”自然引出外部食物来源，正确。 |
| F `suffer from` | phr. 因……受苦、遭受不良影响 | 语法可成立，但只说明青蛙可能抗毒，不能解释毒素如何进入青蛙体内，排除。 |

第三空：

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| G `eaten` | `eat` 的过去分词；被吃、被摄食 | 甲虫被青蛙吃掉，毒素才能从甲虫转移到青蛙，正确。 |
| H `neutralized` | `neutralize` 的过去分词；被抵消作用、被使无效 | 若甲虫或其毒素被中和，就不能解释青蛙为何保有活性毒素，排除。 |
| I `poisoned` | `poison` 的过去分词；被毒害、被投毒 | 用户所选；它表示青蛙使甲虫中毒，颠倒了题目要解释的物质传递方向，也没有解释青蛙如何获得毒素，排除。 |

**推理偏离与修正**：用户前两空 B/E 正确，第三空 I 使整题失败；GRE 多空 Text Completion 不给部分分。错误不是单纯不认识 `poisoned`，而是没有用整句因果链回验最后一空。今后多空题完成每一空后，必须用箭头检查“主语—动作—结果”是否在同一方向。

# 生词本联动

本次按用户指定新增 7 个词；`Beetles` 已规范化为词元、小写单数 `beetle`，以免多设备复习时重复计数。

| 词 | 权威核心义（GRE 常用） | 本题角色 / 易错点 |
| --- | --- | --- |
| `capricious` | adj. 反复无常的、任性的、难以预测的 | 不等于 `insular`；描述行为变化，而非眼界封闭。 |
| `mercenary` | adj. 唯利是图的、受金钱驱使的；n. 雇佣兵 | 注意词性；本题中是形容词。 |
| `idealistic` | adj. 理想主义的、以理想为导向的 | 可含“不切实际”，但不等于“狭隘”。 |
| `intransigent` | adj. 不肯妥协或改变立场的、顽固的 | 强调立场不退让，不等于见识狭窄。 |
| `dearth` | n. 缺乏、短缺 | 高频搭配：`a dearth of evidence/resources`。 |
| `presumption` | n. 推定、假设；放肆、自以为是 | 需靠搭配判断义项，如 `presumption of innocence`。 |
| `beetle` | n. 甲虫 | 原题复数 `beetles`；生词本保存基本词形。 |

# 技巧映射

- `v_tc_logic_map`：更新为 `learned`。用户已能独立复述“甲虫携带同种毒素 → 青蛙吃甲虫 → 青蛙获得毒素”的因果方向；尚无计时应用证据。
- `v_tc_multi_blank_consistency`：更新为 `learned`。用户已解释第三空为什么是 `eaten` 而非 `poisoned`；原表述“才产生毒素”需校准为“获得/积累毒素”，以免与第二空 `does not produce them` 冲突。

# 下次检验

第 1 题词义纠错已通过；第 3 题因果链纠错也已通过。进入 test 1 section 1 第 4–7 题的 Sentence Equivalence 训练；首次检验 `v_se_dual_equivalence`。
