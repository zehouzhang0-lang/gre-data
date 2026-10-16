# 逐义项原例句

按用户选择，只收录可以追溯的 ETS／Oxford 英文原句；中文译文为本项目自译。当前保留3947个义项原句：ETS 37、Oxford 3910。其中Oxford Advanced Learner’s Dictionary 3710、Oxford Advanced American Dictionary 165、Oxford Learner’s Dictionary of Academic English 35。来源中区分具体词典版本、ETS题目/解析、官方逐字稿、研究报告或其他公开材料；中文不是官方译文，也不冒称New Oxford Dictionary原文。

ETS 官方 Verbal Reasoning 要求结合语境理解词义与句意，官方题目出现时优先依据其完整语境。第二轮检索12个ETS公开来源；第三轮另查28个官方来源（27个可读），为剩余3303义项补入236个原句，其中23个ETS、213个Oxford。未能为每个义项取得合适原句，其余3067项继续留空；不声称 Oxford 是 ETS 指定的词典。

- ETS 依据：https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html
- 每句具体 ETS／Oxford 来源：见 `verified-*.json` 的 `source.url`，应用内可直接打开。
- `source-lookups.json`：第一轮 2727 个词的 Oxford 英语条目地址检索结果；2543 次 HTTP 200、184 次 HTTP 404。404 仅表示该次地址未取得页面，不表示 Oxford 各版本、屈折词形或其他词条下不存在用例。
- `second-pass-lookups.json`、`second-pass-sense-reviews.json`、`supplement-review.json`：第二轮历史记录，包括当时4463个待补义项和今日108词的整理。
- `third-pass-lookups.json`：第三轮公开来源查阅记录及学术词典未登录浏览器可见性核验。记录可能包含同一URL在不同词的查阅，不等同于独立来源数量。
- `third-pass-sense-reviews.json`：0.1.5版剩余3303义项全部复核的逐项结果；236项补齐、3067项保留空值。
- `third-pass-review.json`：本轮统计、222条Oxford候选的独立语义审查、ETS优先选用及撤回记录。定语分词不足以清楚示范动词的候选未采用；英美词典只有微小拼写/措辞差异时，不通过另换URL增加摘录额度。
- `source-verification.json`：当前2651个引用来源中全部3947条原句的逐句定位；ETS PDF还核对具体物理页码。
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
