# 全库释义与分类整理

日期：2026-10-13（Asia/Kuala_Lumpur）。用户要求全部单词采用常见词典式排布，以 Merriam-Webster、Oxford、Cambridge 为依据，不限定每词两个义项。

## 覆盖范围

- 合并词库共 2730 条，含已移除记录；有效词条 2710 条。
- 2727 条有效拼写记录形成结构化释义：2408 条沿用既有词典核验证据，319 条本次重新查证。历史核验没有冒充本次逐词重新查询。
- 3 条截断摘词按原题语境确认归入正确拼写：`alfeasance → malfeasance`、`nullifie → nullify`、`sagaciou → sagacious`。保留旧记录与来源历史。
- 当前可见词条缺释义 0，未分类 0；共 18 个主题。补充此前未分类词条的 216 项主题归属，保留已有人工分类优先级。

## 编订原则与交付

核心义按词性分组、独立义项逐条排列，词性间换行；不将同义中文强拆为固定数量。优先保留 GRE 常见核心义和已收录的有效扩展义，不声称穷尽权威词典全部历史义项。

例如 reserve 增补“矜持、寡言”等义，yield 补充分词性义项；pilgrim 移除未取得支持的旧罕用动词义。具体人工修订见 `vocab/definition-edits.json`，本次逐词出处见 `vocab/definition-checks.json`，全量结果见 `vocab/standardized.json`。

前端详情采用词性标签与编号义项，附核验状态、词典链接和辨析说明；列表保留紧凑的分号与换行格式。新增词性、核验状态、单词/短语和单义/多义筛选，可与主题、来源和记忆状态叠加。

手机导出与投影支持同一规范层。后续用户修改不被旧规范层覆盖。此次整理不计为训练、回忆或掌握证据。

## 验证

- 全量结构校验及有效词条释义、分类覆盖检查。
- 桌面与手机构建；词汇事件、分类、规范层和手机存储回归测试。
- 手机导出校验：2710 个有效词、2730 条总记录、18 个主题、255 个关系组；372 条回忆、519 个到期项目、1 个练习轮次与桌面一致。
- 浏览器检查搜索与词性筛选，reserve 的两个词性分组与六个义项；桌面和窄屏详情实际渲染检查。

来源为各词条具体页面，例如 [Cambridge reserve](https://dictionary.cambridge.org/dictionary/english/reserve)、[Cambridge yield](https://dictionary.cambridge.org/dictionary/english/yield)、[Merriam-Webster jejune](https://www.merriam-webster.com/dictionary/jejune)。完整来源随词条保存。
