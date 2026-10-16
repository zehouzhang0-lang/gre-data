# 逐义项原例句

本次按用户选择，只收录可以追溯的 ETS／Oxford 英文原句；中文译文为本项目自译。已收录的英文均来自 Oxford Advanced Learner’s Dictionary 具体条目页面，不冒称 ETS 原题、官方译文或 New Oxford Dictionary 的原文。

ETS 官方 Verbal Reasoning 要求结合语境理解词义与句意，官方题目出现时优先依据其完整语境。本轮没有为每个词找到 ETS 官方题目，故使用 Oxford 词条核对例句与既有义项；不声称 Oxford 是 ETS 指定的词典。

- ETS 依据：https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html
- 每句具体 Oxford 来源：见 `verified-*.json` 的 `source.url`，应用内可直接打开。
- `source-lookups.json`：本轮 2727 个词的 Oxford 英语条目地址检索结果；2543 次 HTTP 200、184 次 HTTP 404。404 仅表示该次地址未取得页面，不表示 Oxford 各版本、屈折词形或其他词条下不存在用例。
- `coverage.json`：生成词库中的真实配句与待补充数量，以义项为计数单位；同一原句用于同词近义表述时仍分别计数。

每个词逐组核对词性、原义项和候选完整句。句子必须能说明对应的具体意思，不能仅因含有该单词就配上。原页面只有搭配片段、句子提取不完整、词性或意义不吻合、暂未找到页面，或者受到摘录额度限制时，义项保留 `null`，应用显示“例句待补充”。这不是已经穷尽 ETS／Oxford 全部材料的结论。

保留的英文按实际来源页面复核，可在原页面定位。不同单词和不同义项对同一规范化 URL 的引用累计最多 25 个英文词；重复展示也计入。词典全文及检索候选不进入正式数据包。

修改时保留原始词条输入指纹；`pos` 和 `meanings` 与规范词库严格一致，`examples` 数组与义项等长。每一项只允许完整来源对象或 `null`。运行：

```powershell
node platform/scripts/standardize-vocabulary.mjs
node platform/scripts/audit-sense-examples.mjs
node platform/mobile/scripts/export-vocabulary.mjs
```

规范层、手机导出、升级与备份均传递同一组例句。用户在手机上自行改过的不同释义仍保留，避免套用到错误义项；阅读例句不会产生回忆或掌握记录。
