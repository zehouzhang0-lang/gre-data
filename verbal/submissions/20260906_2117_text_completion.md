---
schema_version: 1
date: "2026-09-06"
started_at: "2026-09-06T21:16:06+08:00"
mode: text_completion
source:
  material_id: text_completion_2000
  unit: test1_section2_easy
  question_range: "1-2"
  page_range: "12"
timed: false
duration_min: null
total: 2
answered: 1
correct: 0
accuracy: 0
answer_source: coach_solved
question_types:
  - {type: text_completion_single, total: 2, correct: 0}
errors:
  - question_id: "1"
    tag: vocab_gap
    user_answer: D
    correct_answer: C
    technique_ids: [v_tc_logic_map]
  - question_id: "2"
    tag: vocab_gap
    user_answer: null
    correct_answer: C
    technique_ids: [v_tc_logic_map]
technique_ids: [v_tc_logic_map]
verification_sources:
  - https://www.merriam-webster.com/dictionary/clamorous
  - https://www.merriam-webster.com/dictionary/invidious
  - https://www.merriam-webster.com/dictionary/numinous
  - https://www.merriam-webster.com/dictionary/empirical
  - https://www.merriam-webster.com/dictionary/sonorous
  - https://www.merriam-webster.com/dictionary/impenetrable
  - https://www.merriam-webster.com/dictionary/immutable
  - https://www.merriam-webster.com/dictionary/proprietary
  - https://www.merriam-webster.com/dictionary/didactic
  - https://www.merriam-webster.com/dictionary/self-perpetuating
---

# 训练概览

Test 1 Section 2（easy）第 1-2 题，未计时。用户明确作答第 1 题 D，答案为 C；第 2 题表示能理解题意且勉强理解第三个选项，但没有明确提交选项，因此不把 C 计作用户答案。本次明确作答 1 题，0/1；来源材料无内置答案，正确答案由题干逻辑和权威词典义独立核定。

# 作答记录

| 题号 | 用户答案 | 教练推导答案 | 结果 |
| --- | --- | --- | --- |
| 1 | D `empirical` | C `numinous` | 错误 |
| 2 | 未明确提交；注意到 C | C `proprietary` | 不计分 |

# 错题证据与推理

## 第 1 题

**题意骨架**：祖母相信各种 ___ 的事物；举例是她坚持童年住所闹鬼。

**决定性证据**：冒号后的 `haunted` 是前半句空格的具体例证。先预测“超自然的 / 神秘灵性的”，再匹配 C `numinous`。D `empirical` 表示基于观察或经验的，和“闹鬼”这一例子不匹配。

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| A `clamorous` | adj. 喧闹的；吵嚷着坚持的 | 描写声音或要求，不是超自然属性。 |
| B `invidious` | adj. 令人反感的；易招致怨恨、敌意或嫉妒的 | 负面评价维度不对应 `haunted`。 |
| C `numinous` | adj. 超自然的、神秘的；令人感到神圣存在的 | 与“闹鬼”完全对应，正确。 |
| D `empirical` | adj. 基于观察、经验或实验的；可由观察验证的 | 用户所选；语义方向与超自然信念不符。 |
| E `sonorous` | adj. 声音洪亮浑厚的；效果庄严有力的 | 声音维度与题干例证无关。 |

**错因**：知识缺口（五个选项均不认识）为主；同时未把 `haunted` 先转写成“supernatural”预测，导致只能随机猜测。

## 第 2 题

**题意骨架**：特定洞穴对应特定传说；这些传说很 ___，因为只有洞穴所有者能分享其秘密。

**决定性证据**：冒号后的 `only the cave owner` 直接定义空格：信息受所有者控制、不是公众共有，因此是 C `proprietary`。

| 选项 | 核心义与词性 | 本题判断 |
| --- | --- | --- |
| A `impenetrable` | adj. 无法穿透的；难以理解的 | “只有所有者能分享”说的是所有权限制，而非内容无法理解。 |
| B `immutable` | adj. 不可改变的 | 题干未说明传说永远不变。 |
| C `proprietary` | adj. 所有者的、专有的；受独占权控制的 | 与 `only the cave owner` 精确对应，正确。 |
| D `didactic` | adj. 旨在教导的；有时含说教意味 | 题干没有教育或道德教训线索。 |
| E `self-perpetuating` | adj. 能使自身持续或不断再生的 | 题干没有“循环维持自身”的因果链。 |

**错因**：词汇覆盖不足。用户已理解句子关系，并对 C 有部分识别，但未明确提交答案，所以本题只记诊断，不计正确。

# 技巧映射

- `v_tc_logic_map`：状态保持 `learned`。两题都能理解大意，但尚未展示“证据词 -> 中文预测 -> 选项匹配”的完整独立过程；本轮主要瓶颈是选项词汇。

# 下次检验

1. 主动回忆 `numinous = supernatural / spiritual`、`proprietary = owner-controlled / exclusive`。
2. 在两个新句子中先写中文预测，再选词；不得只凭“眼熟”选择。
3. 当前训练仍未计时，不能把技巧状态升级为 `applied`。

# 第一轮主动回忆

用户依次回忆 `numinous / empirical / proprietary / immutable / didactic`，五词核心义均可接受，记 5/5；全部进入首次正确连续记录。精确性修正：

- `empirical` 是“基于观察、经验或实验的”，不必然表示结论已经被证明。
- `proprietary` 是“所有者专有或受独占权控制的”，所有者可以是个人或组织，不能只限于“个人专有”。
- `didactic` 的中性核心义是“旨在教导的”；在负面语境中才常译为“说教的”。

这一轮只证明五个词的脱离语境主动回忆成功，不改变填空技巧状态。
