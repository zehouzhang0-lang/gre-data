# 学习资料索引

`catalog.yaml` 是可同步的资料目录，只记录文件名、版本、页数、SHA-256、用途与答案状态，不包含 PDF 内容。

PDF 原件存放在仓库外。当前主力机的稳定目录是：

```text
C:\Users\Administrator\.gre-media\materials
```

本机路径写在仓库根目录的 `.gre-materials.local.yaml`，该文件被 Git 忽略。新设备复制资料后，从 `.gre-materials.local.example.yaml` 新建本机配置并校验哈希。

## 使用规则

- 乱序词表用于按日学习；正序词表只作查词索引。
- 阅读、填空和数学题库的答案/解析不在现有 PDF 中。补齐独立答案文件前，记录必须标记 `answer_source: unavailable` 或由教练逐题独立求解，不能假装已对照官方/出版方答案。
- `GRE 小白入门` 与 `GRE 数学满分宝典` 尚未提供。30 天计划保留对应任务，但不能用其他文件冒充。
- 不把 PDF、截图、答案原件或长段题目文本提交到公开仓库。
