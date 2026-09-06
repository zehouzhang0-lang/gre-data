---
schema_version: 1
date: "2026-09-06"
started_at: "2026-09-06T20:31:06+08:00"
mode: sentence_equivalence
source:
  material_id: text_completion_2000
  unit: test1_section1_easy
  question_range: "4-7"
  page_range: "11-12"
timed: false
duration_min: null
total: 4
answered: 4
correct: 0
accuracy: 0.0
answer_source: coach_solved
question_types:
  - {type: sentence_equivalence, total: 4, correct: 0}
errors:
  - question_id: "4"
    tag: vocab_gap
    user_answer: A
    correct_answer: C/E
    technique_ids: [v_se_dual_equivalence]
  - question_id: "5"
    tag: option_trap
    user_answer: B
    correct_answer: A/B
    technique_ids: [v_se_dual_equivalence]
  - question_id: "6"
    tag: option_trap
    user_answer: E
    correct_answer: E/F
    technique_ids: [v_se_dual_equivalence]
  - question_id: "7"
    tag: vocab_gap
    user_answer: E
    correct_answer: B/C
    technique_ids: [v_se_dual_equivalence]
technique_ids: [v_se_dual_equivalence]
verification_sources:
  - https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html
  - https://www.merriam-webster.com/dictionary/bias
  - https://www.merriam-webster.com/dictionary/partiality
  - https://www.merriam-webster.com/dictionary/overreact
  - https://www.merriam-webster.com/dictionary/deviate
  - https://www.merriam-webster.com/dictionary/succumb
  - https://www.merriam-webster.com/dictionary/recoil
  - https://www.merriam-webster.com/dictionary/yield
  - https://www.merriam-webster.com/dictionary/shrink
  - https://www.merriam-webster.com/dictionary/singular
  - https://www.merriam-webster.com/dictionary/unique
  - https://www.merriam-webster.com/dictionary/archaic
  - https://www.merriam-webster.com/dictionary/counterfeit
  - https://www.merriam-webster.com/dictionary/valuable
  - https://www.merriam-webster.com/dictionary/valueless
  - https://www.merriam-webster.com/dictionary/fake
  - https://www.merriam-webster.com/dictionary/pessimism
  - https://www.merriam-webster.com/dictionary/misinterpretation
  - https://www.merriam-webster.com/dictionary/imprecision
  - https://www.merriam-webster.com/dictionary/vagueness
  - https://www.merriam-webster.com/dictionary/exaggeration
  - https://www.merriam-webster.com/dictionary/hyperbole
  - https://www.merriam-webster.com/dictionary/upheaval
  - https://www.merriam-webster.com/dictionary/imminent
  - https://www.merriam-webster.com/dictionary/stern
  - https://www.merriam-webster.com/dictionary/prescient
  - https://www.merriam-webster.com/dictionary/prophetic
  - https://www.merriam-webster.com/dictionary/indifferent
  - https://www.merriam-webster.com/dictionary/repeated
  - https://www.merriam-webster.com/dictionary/apathetic
---

# 训练概览

Test 1 Section 1（easy）第 4-7 题 Sentence Equivalence，未计时。用户每题只提交一个选项；GRE Sentence Equivalence 要求同时选中两个选项，因此严格整题得分为 0/4。第 5 题命中 B、第 6 题命中 E，说明能利用 `only` 和 `overstatement` 找到一个正确方向，但没有完成等价搭档检验。该样本不能外推为 Verbal 量表分。

# 作答记录

| 题号 | 用户答案 | 正确答案 | 结果 |
| --- | --- | --- | --- |
| 4 | A | C/E | 错误 |
| 5 | B | A/B | 错误；命中一个正确词 |
| 6 | E | E/F | 错误；命中一个正确词 |
| 7 | E | B/C | 错误 |

# 错题证据与逐项解析

## 第 4 题：C `succumb to` + E `yield to`

题意骨架：即使研究者会 ___ 偏见或偏袒，其他人仍可用共同认可的证据框架纠正他们。`bias` 在此是“不公正地偏向一方的判断倾向”，`partiality` 是“偏袒、偏心”；二者并列同义。既然后文说别人可以“纠正”研究者，空格应预测为“研究者屈从于/受到了偏见影响”。

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| A `overreact to` | 对……反应过度 | 用户所选；表示研究者对偏见作出过度反应，不表示研究者本人受到偏见支配，方向错误。 |
| B `deviate from` | 偏离、背离 | `deviate from bias` 反而接近“离开偏见”，与需要被纠正的语境相反。 |
| C `succumb to` | 屈服于、经不住 | 表示屈从偏见，符合；与 E 形成等价对。 |
| D `recoil from` | 因恐惧或厌恶而退缩、回避 | 表示远离偏见，方向相反。 |
| E `yield to` | 向……让步、屈服于 | 表示受偏见支配，符合；与 C 等价。 |
| F `shrink from` | 因害怕或不情愿而回避 | 表示回避偏见，不是屈从偏见。 |

决定性证据：`others can correct them` 说明研究者先出现了可纠正的偏见；正确语义必须是“屈从偏见”，而非“躲开偏见”。

## 第 5 题：A `singular` + B `unique`

题意骨架：作品很美，也很可能 ___，因为它是唯一一首由女性创作的希伯来诗。冒号后的 `the only` 直接定义空格为“独一无二”。原资料的 `reconstruct known work` 疑有排版或原文错误，但不影响 `only` 对答案的决定作用。

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| A `singular` | 非凡的、异常的；本题为独特的、独一无二的 | 正确；与 B 等价。注意不只表示语法中的“单数”。 |
| B `unique` | 独一无二的、无可比拟的 | 用户命中；但还必须选择 A 才能得分。 |
| C `archaic` | 古老的、现已少用或过时的 | “希伯来诗”不自动等于过时；`only` 也没有说明年代。 |
| D `counterfeit` | 伪造的、仿冒的 | 与 F 接近，但题干没有怀疑真伪。 |
| E `valuable` | 有金钱价值的；有用或重要的 | 唯一性可能使作品珍贵，但本题要求直接复述 `only`，而且没有等价搭档。 |
| F `fake` | 假的、非真实的 | 可与 D 构成近义对，但整句无“伪造”证据；两个近义词不等于正确答案。 |

决定性证据：`the only` → “独一无二” → `singular / unique`。

易混词：`valuable = value + able`，表示“有价值”；`valueless = value + less`，表示“没有价值”。另注意 `invaluable` 通常表示“珍贵到无法估价”，并不是“无价值”。

## 第 6 题：E `exaggeration` + F `hyperbole`

题意骨架：在一本倾向于 ___ 的书里，“芭蕾已死”的结语只是又一个 `overstatement`。`one more` 表明该书此前已有同类问题，`overstatement` 直接把空格定义为“夸张”。

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| A `pessimism` | 悲观主义、倾向预期坏结果 | “芭蕾已死”确实悲观，但 `one more overstatement` 指向表达过度，不是悲观态度。 |
| B `misinterpretation` | 误解、错误解释 | 错误理解不一定是夸大，不能复述 `overstatement`。 |
| C `imprecision` | 不精确、不严密 | 范围过宽；不精确可能来自模糊或错误数字，不必是夸张。 |
| D `vagueness` | 模糊、不明确 | 与 C 有一定接近，但“模糊”不等于“言过其实”，不符合直接线索。 |
| E `exaggeration` | 夸张、言过其实 | 用户命中；与 F 等价。 |
| F `hyperbole` | 夸张法、极度夸大的说法 | `extravagant exaggeration`；与 E 等价，必须补选。 |

决定性证据：`overstatement = exaggeration ≈ hyperbole`。不要因某一选项“也能形容这句话”就忽略最直接的同义改写。

## 第 7 题：B `prescient` + C `prophetic`

题意骨架：政治剧变令多数人意外；尽管一些评论者发出 ___ 的警告，人们仍从未觉得它迫在眉睫。`upheaval` 是“剧烈动荡或根本性变化”，`imminent` 是“即将发生、迫在眉睫”。`despite` 构成让步：警告实际上预见了后来发生的剧变，但人们当时没有相信。

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| A `stern` | 严厉的、严格的、态度严肃的 | 严厉不等于预见未来，不能解释让步关系。 |
| B `prescient` | 有先见之明的、预见准确的 | 正确；评论者预见到后来的剧变。 |
| C `prophetic` | 预言性的、能预示后来事件的 | 正确；与 B 形成等价对。 |
| D `indifferent` | 漠不关心的；也可表示一般、平庸的 | 漠不关心的警告语义冲突，也不表示预测准确。 |
| E `repeated` | 反复的、多次发生的 | 用户所选；“多次警告”局部上能读通，但它没有等价搭档，也没有像 B/C 那样精确解释“后来果然发生”。 |
| F `apathetic` | 冷漠的、缺乏兴趣或情感的 | 与“发出警告”的积极行为不协调；虽接近 D，但整句不成立。 |

决定性证据：事后看警告准确，却未被当成即将发生 → `prescient / prophetic`。

# 错因诊断

- 主要：`vocab_gap`。第 4、7 题几乎无法比较六个选项。
- 次要：`v_se_dual_equivalence` 未执行。题目已明确要求选两个，但四题均只提交一个。
- 第 5、6 题显示出可用的句内线索能力：分别抓到 `only → unique`、`overstatement → exaggeration`；这只是局部证据，不计整题正确。
- 尚无证据判断速度或稳定性，因为本组未计时且词汇覆盖不足。

# 技巧映射

- `v_se_dual_equivalence`：保持 `unknown`。当前尚不能完成“预测语义 → 找到第一项 → 强制寻找等价搭档 → 两项分别代回”的完整流程。

# 下次检验

先完成四组等价对的主动回忆，再做 2 道不依赖生词的最小 Sentence Equivalence 迁移题。成功标准：每题明确给出两个答案，并说明两词为何等价、为何符合句意。

# 即时纠错复测

- 用户准确回忆：`yield to / succumb to`、`unique / singular`、`exaggeration / hyperbole`。
- 第四组语义配对正确：`prescient / prophetic`；但将 `prescient` 拼成 `precient`。可用 `pre-`（提前）+ `sci`（知道）固定拼写。
- 弱词池复测：`yield`、`succumb`、`singular`、`hyperbole`、`prophetic` 各累计 1 次正确；`prescient` 记为部分正确，连续正确仍为 0。
- 本次只证明已记住讲解过的四组配对，尚未证明能在新句子里执行 Sentence Equivalence 双重检验；`v_se_dual_equivalence` 暂时保持 `unknown`。
