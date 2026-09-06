---
schema_version: 1
date: "2026-09-06"
started_at: "2026-09-06T22:53:47+08:00"
mode: sentence_equivalence
source:
  material_id: text_completion_2000
  unit: test1_section2_easy
  question_range: "7"
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
  - question_id: "7"
    tag: vocab_gap
    user_answer: E/F
    correct_answer: D/F
    technique_ids: [v_se_dual_equivalence]
technique_ids: [v_se_dual_equivalence]
verification_sources:
  - https://www.merriam-webster.com/dictionary/instrumental
  - https://www.merriam-webster.com/dictionary/lens
  - https://www.merriam-webster.com/dictionary/depict
  - https://www.merriam-webster.com/dictionary/sanguinity
  - https://www.merriam-webster.com/dictionary/verisimilitude
  - https://www.merriam-webster.com/dictionary/realism
---

# 作答与决定性证据

用户选E/F，自报大致理解题意，但E/F不认识、lenses不确定、depict不认识，询问instrumental是否为乐器义。未提交中文预测或具体选择理由。D/F为教练结合原题及词典的推导答案，非出版方标准答案。PDF第16页。

关键短片段：accurately observe and depict；in other words。后者要求同义重述：准确观察并描绘外部世界，意味着画面具有写实性、逼真感，D realism与F verisimilitude在本句等价。E表示乐观，既无证据也不等价于F。

# 逐项释义与搭配

六项本题均为名词；艺术风格与性质通常描述性，不宜机械按褒贬选词。

| 选项 | 核心义、语境与搭配 | 判断 |
| --- | --- | --- |
| A idealism | 理想主义；艺术语境可指理想化表现；artistic idealism | 不符合强调准确再现外部世界。 |
| B optimism | 乐观、乐观主义；optimism about the future，通常正向 | 未讨论乐观情绪。 |
| C ambition | 雄心、抱负、强烈追求；artistic ambition，褒贬依语境 | 未讨论艺术家的抱负。 |
| D realism | 现实主义；本题为写实性、逼真再现；realism in painting | 正确。 |
| E sanguinity | 乐观、自信、充满希望的状态；与optimism接近，通常正向 | 与B构成不合语境的近义对。 |
| F verisimilitude | 逼真性、貌似真实；the verisimilitude of a painting | 正确；不必意味着对象实际上真实存在。 |

# 题干词义

- lens（n.）透镜、镜片；lenses是复数，本题optical lenses为光学透镜。中性。
- depict（v.）描绘、刻画、描述；本题depict the external world是描绘外部世界。中性；可用图画或语言。
- instrumental（adj.）起重要作用的；be instrumental in doing表示在促成某事上发挥重要作用。另有器乐的义，如instrumental music；用户联想到音乐有词义依据，但本句搭配要求作用义。instrument是可表示乐器的名词，不把instrumental直接释为名词乐器。作用义本身不保证结果正面。

# 错因、技巧与下次检验

词汇缺口覆盖题干和选项，尚无证据证明用户已用in other words完成语义预测。不能把命中F记为掌握该词，也不臆测选E的原因。SE保持learned，追加失败证据。

先圈出in other words，将前文压缩为“准确描绘现实”，再找两项均表示写实/逼真的词，并排除虽近义但无文本依据的B/E。下次回忆lens、depict、be instrumental in、sanguinity、verisimilitude五项；核心义5/5且能复述“准确描绘 -> 写实/逼真”才算本轮纠正通过。尚未复测。
