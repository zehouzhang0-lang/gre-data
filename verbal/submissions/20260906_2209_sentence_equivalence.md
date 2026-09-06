---
schema_version: 1
date: "2026-09-06"
started_at: "2026-09-06T22:09:09+08:00"
mode: sentence_equivalence
source:
  material_id: text_completion_2000
  unit: test1_section2_easy
  question_range: "5"
  page_range: "13"
timed: false
duration_min: null
total: 1
answered: 1
correct: 0
accuracy: 0
answer_source: coach_solved
question_types:
  - {type: sentence_equivalence, total: 1, correct: 0}
errors:
  - question_id: "5"
    tag: vocab_gap
    user_answer: A/F
    correct_answer: C/D
    technique_ids: [v_se_dual_equivalence]
technique_ids: [v_se_dual_equivalence]
verification_sources:
  - https://www.merriam-webster.com/dictionary/disclose
  - https://www.merriam-webster.com/dictionary/reject
  - https://www.merriam-webster.com/dictionary/brook
  - https://www.merriam-webster.com/dictionary/tolerate
  - https://www.merriam-webster.com/dictionary/repudiate
  - https://www.merriam-webster.com/dictionary/weigh
---

# 作答与证据

用户选 A/F，自报题意明白，除 B 外选项基本不认识；未提供具体推理。答案由教练根据原题及权威词典推导，非出版方答案。PDF 第16页，书内第13页。

决定性链条：工会坚持先满足其修改要求才支持方案，说明对这些要求不肯让步。短片段 `_____ no compromise` 已有否定词 no，空格预测“容忍/接受”，C brook 与 D tolerate 均表达不容许妥协。

# 逐项释义与判断

本题六项均作动词，无需套用固定褒贬色彩；语义方向及语境搭配决定答案。

| 选项 | 核心义、语境与搭配 | 判断 |
| --- | --- | --- |
| A disclose | 揭露、公开原本未知的信息；disclose information | 与坚持条件无关，且不等价于 F。 |
| B reject | 拒绝接受；reject a proposal | 加 no 变为不拒绝任何妥协，方向相反。 |
| C brook | 动词容忍、容许；常见 brook no interference；名词另指小溪 | 与 no 连用表示不容妥协，正确。 |
| D tolerate | 容忍、允许；tolerate criticism，不要求赞同 | 同 C，正确。 |
| E repudiate | 拒绝接受、否认有效性或与之断绝关系；repudiate a claim，正式且否定态度较强 | 与 reject 接近，但 no 使本句方向相反。 |
| F weigh | 称重；引申为权衡、仔细考虑；weigh the options | 此处可想到不考虑妥协，但没有等价搭档；不等于 A 的公开。 |

# 错因与下次检验

已知词汇缺口阻碍选项映射；A/F 既不等价，A 也缺少句内支持。没有证据断言用户读反 no 或不理解题干。首次明确自报陌生的 disclose、brook、tolerate、repudiate、weigh 加入难词池，尚未主动回忆复测。

技巧保持 learned，追加失败证据。下次先圈出 no，预测动词“容忍”，再分别代入两项检查整句等价。先主动回忆5个生词及 brook no compromise 的中文义，全部正确后记录本轮纠正成功；之后需新题迁移验证。
