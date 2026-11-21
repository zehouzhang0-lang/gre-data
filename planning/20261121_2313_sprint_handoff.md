---
schema_version: 1
date: "2026-11-21"
recorded_at: "2026-11-21T23:13:08+08:00"
timezone: Asia/Kuala_Lumpur
kind: sprint_handoff
exam_at: "2026-12-17T14:15:00+08:00"
calendar_days_to_exam: 26
status: planning_pending_in_new_chat
---

# 冲刺主线交接

用户最新要求：全面正式的规划与备考准备放到新对话讨论。用户会自行在小红书寻找真实的25天备考经验；这些是待核候选方法，不是已验证适合本人的方案。原任务仍包括制定从今天到考试日的可执行计划、开始计时诊断、持续保存错因和每日证据；当前尚未交付新训练题、未收到新作答，未生成完成事件，未更新技巧等级。

## 已确认约束

- 考试2026-12-17 14:15，Kuala Lumpur APCU-8851；报名和住宿均已确认。
- 目标V+Q 320、AW 3.5，具体V/Q分科目标未知。
- 每周18–24小时；周一至周三各60分钟，周四240–360分钟、周五180分钟、周六和周日各240–360分钟。
- 核对时刻2026-11-21 23:13（吉隆坡UTC+8），相差26个日历日，实际剩余25天15小时约1分钟。11月22日至12月16日为25个考前日期。不要把11月21日晚已过去的时间补排为4小时训练。
- profile.timezone历史值为Asia/Shanghai，与吉隆坡当前均UTC+8；本冲刺使用Asia/Kuala_Lumpur。

## 用户新补充的模考经历

用户回答：“没做过，但是我用https://bibiji.site/进行过模考，成绩现在很一般”。“没做过”指前问中的POWERPREP；不能据此断言没有参加过任何模考。

尚缺：最近模考的日期、卷名、V/Q/AW、各节正确数和用时、是否完整独立计时、有无重复题或查词。平台具体计分规则尚未查阅。本次不登录该第三方服务、不填分数。下一对话先取得必要数据，并检查该网站的模考制式与分数来源；无证据不定量评价“很一般”。第三方推算须标estimated及局限，只有可核实的模考自带换算/成绩报告才能使用对应mock_reported；不得从raw correct固定换算。

## 仓库证据审计

已读取AGENTS.md、完整profile.md/scores.md/SCHEMA.md、技巧卡、mastery与最近Verbal记录；两名只读审计助手检查平台事件和本地题库。

- 平台6000个原事件，其中354条attempt，无attempts_import。TC63次、SE272次、RC10次、Quant9次。全部duration_seconds为null，note为空；不能推导严格计时表现或具体个人推理错因。
- 按material/unit/question取首答：TC63题（当前参考键一致29）、SE266题（一致105）、RC9题（一致2）、Quant9题（无键）。这不是当前能力测试，尚未跨题位按内容去重，不能与旧Markdown简单相加。
- 参考键均为user_provided，不升级为ETS官方答案。无依据换算量表分。
- 最近作答本地2026-11-02 00:36:35，事件abe2a2f3-924d-422b-8d5d-ee6c2c96bd8b；最近RC事件d0390d0b-6259-4ae6-bec0-352a8446a2e1，2026-09-16；最近Quant事件92338302-ddb9-41ee-bcf8-e98aaee73ce9，2026-10-17。
- 最近词汇自评本地2026-11-03 00:15:09，事件c516355c-6410-4aa8-87e6-29cf0a57a43f。仓库此后未见作答，不证明用户离线没有学习。
- vocab_recall455条：362条self_reported、93条locally_checked（涉及90词）；另2262条单词墙自评、23条翻阅保存、599次阶段drill。计数性质不同，不能相加成掌握词数。
- 旧Verbal submissions13篇，均timed:false。Quant/AW/mock目录没有训练提交；平台无writing_session或writing_submission。scores.records为空。
- mastery：TC逻辑、多空一致、SE等价仅learned；RC、Quant、pacing、AW均unknown。旧记录有词汇和整句逻辑错误证据，但不能直接当作11月已确认弱项。

## 已有材料及选题

全部10本catalog PDF本地存在。TC/SE各1001题位、RC893题位、Quant847题位；排除已做内容后分别933、709、884、838个未做题位（题位数不等于独立内容数）。TC/SE及RC有用户提供的出版方参考键。quant_900和quant_170_hard_4_0均缺答案，不虚报Quant正确率；需看完整原页，教练独立推导时标coach_solved，并保留核验过程。平台已有6道coach_original Issue教学题可用，不能标官方。

今晚候选短诊断尚未派发：text_completion_2000 / test10_section2_easy / Q2–4（PDF文件页38，单/双/三空）及test39_section1_hard / Q4–6（PDF文件页112，SE）。均已按平台buildPracticeBank、legacyPractice和Store.state排除已做题位及相同内容，题干与选项完整。可10分钟作答、8分钟提交推理，实际计时须由用户开始，不能从派题时刻推算。SE仍可改选低难度未做组，后续以最新审计为准。原文从忽略缓存.gre-platform/questions-text_completion_2000.json取，不提交整组题库正文；参考键取原keys_import事件，诊断前不揭晓。

## 规则核对（2026-11-21）

- ETS现行标准机考约118分钟，AW30分钟；V12/15题、18/23分钟；Q12/15题、21/26分钟；V/Q按section自适应。来源：https://www.ets.org/gre/test-takers/general-test/prepare/test-structure.html
- ETS当前公开页区分免费POWERPREP 1 untimed与POWERPREP 2 timed；PP1 untimed不提供V/Q分数。尚未确认本人的账户已开通，不能写成已拥有可用模考。来源：https://www.ets.org/gre/test-takers/general-test/prepare/powerprep.html
- Issue任务和官方题池入口：https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing/issue.html

## 新对话应完成

1. 先核对bibiji模考具体证据，不以“很一般”定弱项或分科目标。
2. 将旧strategy中已过期的10月计划切换到新版本；保留历史。以18小时周下限做必做任务，额外6小时作选做，覆盖11月21日至12月17日并留出考前减量与12月16日出行。
3. 每项明确分钟数、已拥有材料、动作、产出、成功标准；缺官方模考访问时安排可执行替代方案，不把自组题当成标准化量表分。
4. 用户要求先在新对话做好全面规划与准备；结合当地时间决定短诊断安排，不假记已开始或完成。
5. 训练后按submissions保存原答与错因四问、technique_ids；mastery只有新证据才升降，planning/events追加完成状态。单题讲解必须完整题干翻译及按原序全部选项讲解。

## 同步状态

本轮在当前codex/vocabulary-standardization分支执行git pull --rebase --autostash：初次沙箱阻止.git写入，提权后发现无upstream；已按sync.ps1既定路径执行git pull --rebase --autostash origin main，结果Already up to date，无冲突。远程已核实为GRE仓库。交接前本轮只修改profile.md并新增本记录；随后审核status并运行sync.ps1 -TargetBranch main。具体推送结果以工具回执为准。
