---
schema_version: 1
date: "2026-09-06"
started_at: "2026-09-06T21:45:03+08:00"
mode: text_completion
source:
  material_id: text_completion_2000
  unit: test1_section2_easy
  question_range: "4"
  page_range: "12"
timed: false
duration_min: null
total: 1
answered: 1
correct: 0
accuracy: 0
answer_source: coach_solved
question_types:
  - {type: text_completion_triple, total: 1, correct: 0}
errors:
  - question_id: "4"
    tag: vocab_gap
    user_answer: B/E/G
    correct_answer: A/E/G
    technique_ids: [v_tc_logic_map, v_tc_multi_blank_consistency]
technique_ids: [v_tc_logic_map, v_tc_multi_blank_consistency]
verification_sources:
  - https://www.merriam-webster.com/dictionary/auction
  - https://www.merriam-webster.com/dictionary/tedious
  - https://www.merriam-webster.com/dictionary/fickle
  - https://www.merriam-webster.com/dictionary/antiquarian
  - https://www.merriam-webster.com/dictionary/legitimate
  - https://www.merriam-webster.com/dictionary/intensification
  - https://www.merriam-webster.com/dictionary/competitive
  - https://www.merriam-webster.com/dictionary/wide-ranging
  - https://www.merriam-webster.com/dictionary/comprehensive
---

# 训练概览

Test 1 Section 2（easy）第 4 题，三空，未计时。用户选择 B/E/G；正确组合由全段逻辑和权威词典义核定为 A/E/G。第二、三空命中，但 GRE 多空 Text Completion 不给部分分，本题记 0/1。用户表示从最后一句大致理解全文，并明确列出 6 个生词：`auctions`、`tedious`、`fickle`、`antiquarian`、`legitimate`、`intensification`。

# 作答记录

| 题号 | 用户答案 | 教练推导答案 | 整题结果 |
| --- | --- | --- | --- |
| 4 | B/E/G | A/E/G | 错误；第二、三空正确 |

# 错题证据与推理

## 三段逻辑链

1. 摄影作品成为热门收藏领域，新收藏者进入，拍卖活动出现某种 `intensification`。参与竞拍的人增加，首先预测第一空为“竞争更激烈”，对应 A `competitive`。
2. 老收藏者过去只专注十九世纪先驱或二十世纪现代主义者中的一类，现在兴趣范围变广，第二空对应 E `wide-ranging`。
3. 兴趣从单一时期扩展到多个时期，因此他们想建立覆盖更全面的收藏，第三空对应 G `comprehensive`。

## 逐项判断

第一空：

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| A `competitive` | 竞争性的、竞争激烈的 | `popular + new collectors + intensification` 表明竞拍者增多、竞争加强，正确。 |
| B `tedious` | 因冗长或乏味而令人厌烦的 | 用户所选；新收藏者进入不能推出拍卖更无聊，排除。 |
| C `exclusive` | 排他的；只限少数人的；高档专有的 | 新收藏者进入反而说明参与者增加，不能推出更排他。 |

第二空：

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| D `fickle` | 反复无常的、容易变化而不可靠的 | 后文说兴趣扩展，不是无规律地变来变去。 |
| E `wide-ranging` | 范围广泛的 | 与从单一时期扩展到更多作品直接对应，正确。 |
| F `antiquarian` | 古物研究或收藏相关的；旧书、珍本书相关的 | 只会把兴趣限制在古物方向，与跨十九、二十世纪的扩大不符。 |

第三空：

| 选项 | 核心义 | 判断 |
| --- | --- | --- |
| G `comprehensive` | 全面覆盖的、广泛完整的 | 承接 `wide-ranging interests`，正确。 |
| H `legitimate` | 合法的；真实正当的；合理有效的 | 文中没有合法性或真伪问题。 |
| I `impressive` | 令人印象深刻的 | 可能符合常识，但文本明确描述的是收藏范围扩大，不是令人赞叹。 |

# 推理偏离与错因

用户从最后一句正确抓住“兴趣范围扩大 -> 收藏更全面”，所以 E/G 有明确文本支持。第一空失误主要来自 `auction` 和 `intensification` 的词汇缺口：没有把“新收藏者进入热门拍卖市场”转写为“竞拍竞争加剧”，于是选择了与因果无关的 `tedious`。

错误类型以 `vocab_gap` 为主，同时需要加强段落内三句之间的因果回代。

# 生词精确定义

- `auction`：拍卖；财物卖给最高出价者。
- `intensification`：加强、加剧；变得更强烈的过程或结果。
- `tedious`：因冗长或枯燥而令人厌烦的。
- `fickle`：缺乏稳定性、反复无常且不可靠的。
- `antiquarian`：古物研究或收藏相关的；也可指经营旧书、珍本书的。
- `legitimate`：合法的；真实而非伪造的；合理、正当或有效的。具体语境决定译法。

# 技巧映射

- `v_tc_logic_map`：本题证据为 `mixed`。最后两句关系识别正确，但第一句未用 `popular / new collectors / intensification` 完成因果预测；状态保持 `learned`。
- `v_tc_multi_blank_consistency`：本题证据为 `mixed`。E/G 能形成“范围广 -> 收藏全面”的一致链，但 B 无法与新收藏者和竞争加剧衔接；状态保持 `learned`。

# 下次检验

1. 主动回忆本题 6 个生词。
2. 复述三段链：`新竞拍者增加 -> 竞争加剧；兴趣范围扩大 -> 收藏更全面`。
3. 再做一道三空迁移题，并显式写出三个中文预测。

# 主动回忆复测

用户依次回忆 `auction / tedious / fickle / antiquarian / legitimate / intensification`：5 个正确，`antiquarian` 部分正确。

- `auction`、`tedious`、`fickle`、`legitimate`、`intensification` 的核心义正确，进入首次正确连续记录。
- `antiquarian` 回忆为“古典相关的”，方向接近但范围过宽；它特指“古物、古代遗存的研究或收藏相关”，也常指旧书、珍本书相关。它不同于泛指古希腊罗马或传统经典风格的 `classical`，本次不累计正确连续次数。

本轮只验证词义，不改变填空技巧状态。

# 近义易混词迁移复测

用户完成 `antiquarian / classical / antique` 三空搭配辨析，作答为 `classical / antiquarian / antique`；正确顺序为 `antiquarian / classical / antique`，结果 1/3。

- `an antiquarian bookseller`：经营旧书、珍本书的书商。`antiquarian` 强调古物、古代遗存的研究、收藏或交易。
- `classical music`：古典音乐。`classical` 可指古希腊罗马文化，也可指传统、经典的艺术风格或特定古典时期。
- `an antique desk`：一张古董桌。`antique` 作名词指有收藏价值的古物，作形容词指古老且常有收藏价值的。

前两空正好互换，说明用户尚未稳定区分“与古物/珍本交易有关”和“古典艺术传统”；`antiquarian` 的正确连续次数维持 0，并把 `classical` 纳入易混词复测。第三空 `antique` 正确，暂不加入生词表。

下一步要求用户不看释义复述固定搭配 `antiquarian bookseller / classical music / antique desk`，并分别给出中文义；三项全对才记为本轮纠正成功。
