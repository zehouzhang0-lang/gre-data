---
schema_version: 1
date: "2026-10-19"
recorded_at: "2026-10-19T15:48:57+08:00"
kind: platform_feature_discussion
status: proposed
implementation_authorized: false
---

# 写作模块：待讨论方案

用户要求先讨论在现有学习平台增加 GRE 写作功能；本次不开发、不修改平台或学习成绩。以下是教练建议，尚非用户确认的功能清单。

## 现有证据

- analytical-writing/submissions 目前只有 .gitkeep；平台没有写作作答类型。未找到可评估的作文样本。
- profile.md 的写作目标与当前分数均为空，scores.md 没有成绩记录。不能推断个人写作短板或分数。
- 已有四张写作技巧卡：立场、段落推理、反方与边界、计时校订；掌握记录均缺证据。
- 资料目录没有已导入的写作题池；SCHEMA 中的 ets_issue_pool 是示例，不代表资料已接入。

## 建议首版

1. 在电脑学习平台增加独立“写作”入口，不扩展手机离线词库 APK。
2. 题目入口保留官方来源、完整任务要求和练习状态；可手动输入题目。相同话题但不同任务要求保持独立，不套用客观题去重判断。
3. 分步训练支持提纲、段落、全文；训练模式可按需查看题意和提示，先独立尝试再请求帮助。训练时长可调整，提示使用情况单独记录。
4. 限时实战采用当前标准的30分钟Issue任务，无平台AI提示或拼写语法纠错；本地草稿恢复，刷新不重置计时。到时保存独立快照，继续修改另存为修订，不能冒充原限时作答。
5. 批改仅由用户主动触发，围绕任务回应、立场、论证展开、结构与语言控制提供原文证据和建议，先集中处理最重要的2–3项。完整作文可给AI暂定估分；提纲/单段不打完整作文分。诊断维度不冒充ETS官方分项成绩，不用简单平均伪造总分。
6. 原稿、批改、局部重写与完整重写分别保留，可并排比较。AI不覆盖用户原稿，不默认整篇代写；提示后改好与独立计时表现分开记录。

第二阶段候选：个人论据/表达收藏、常见错误的针对训练、不同题目上的迁移复测。素材需区分真实依据与假设示例，不将生僻词密度当作写作水平。

## 技术边界（仅评估）

复用现有保存、同步、历史页面框架和显式AI请求流程；需新增独立写作提交、版本关系、计时与评审结构。普通attempt只适用于tc/se/rc/quant，不将作文强塞其中而污染题目统计及复习排期。离线可写作和保存，AI批改仍依赖现有联网服务。没有实施代码修改或创建训练事件。

## 待用户确认

- 写作目标分及既往独立/计时作文经历。
- 首版更侧重分步指导，还是完整限时写作与详细批改，或两者兼有。
- 自报最想解决的问题：构思、论证展开、英文表达、时间管理；需后续样本验证，不能直接记为能力结论。

## 官方规则核对

核对日期：2026-10-19（UTC+8）。当前标准任务为30分钟Analyze an Issue；ETS编辑器没有拼写/语法检查。必须针对随题具体任务要求作答，不能将全部Issue当成一种模板。写作量表为0–6、0.5递增；平台AI估分不等于ETS成绩。旧制Analyze an Argument不纳入现行实战。

- https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing.html
- https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing/issue.html
- https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing/scoring.html
