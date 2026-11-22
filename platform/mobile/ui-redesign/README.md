# GRE App 全局 UI 优化

这个目录是 Codex 和 Claude 的共享入口。目标是让常用操作更快、更连续，让学习进展更容易看懂。先从单词墙的搜索、翻页和 fresh 本页验证一套视觉与交互规则，再带到复习、刷题和设置。

- [给 Claude 的提示词](CLAUDE-PROMPT.md)可以直接复制到新对话。
- [当前实现与优先验证项](REVIEW.md)区分了代码中能确认的行为、待验证的性能假设和设计建议。

## 从哪里开始

| 场景 | 源码入口 |
| --- | --- |
| 应用框架、返回和底部导航 | [App.jsx](../src/App.jsx)、[Primitives.jsx](../src/components/Primitives.jsx)、[useBack.js](../src/useBack.js) |
| 全局样式、颜色、字号和间距 | [design-tokens.css](../src/design-tokens.css)、[mobile.css](../src/mobile.css) |
| 单词墙、检索、翻页和手势 | [WordWall.jsx](../src/components/WordWall.jsx)、[WordTile.jsx](../src/components/WordTile.jsx)、[model.mjs](../src/model.mjs)、[wall-navigation.mjs](../src/wall-navigation.mjs)、[wordwall-redesign.css](../src/wordwall-redesign.css) |
| 复习入口、轮次和单轮练习 | [Review.jsx](../src/components/Review.jsx)、[WordSession.jsx](../src/components/WordSession.jsx)、[review-redesign.css](../src/review-redesign.css) |
| 刷题、目录和原题按需加载 | [Practice.jsx](../src/components/Practice.jsx)、[practice.css](../src/practice/practice.css)、[loader.mjs](../src/practice/loader.mjs) |
| 设置、词库本地数据和刷题存储 | [Settings.jsx](../src/components/Settings.jsx)、[data/repository.mjs](../src/data/repository.mjs)、[practice/repository.mjs](../src/practice/repository.mjs) |

技术栈为 React、Vite 和 Capacitor。完整 App 开发入口默认在 `127.0.0.1:4174`，运行方式见 [Android 开发说明](../README.md#开发)。`4175` 的 [刷题交互预览](../preview/README.md)只适合在本机读题和试答。

需要可交互对照时，在独立工作副本使用测试夹具或合成数据，分开浏览器配置或预览端口。给 Claude 的材料限于本目录、相关脱敏源码、测试示例和补充说明。任何用于外部审美评审的截图先遮去账号、题库原文和个人进度。完整备份、个人 APK、SQLite、凭据、题库 PDF 和真实作答留在本地。

## 怎么交接

1. 在同一设备与同一数据量下记录现状，保留屏幕尺寸、WebView 或浏览器版本和冷热启动条件。把页面截图、问题复现步骤、实际耗时写在同一个评审记录里。遇到真机不可用的情况明确标注。
2. 用同一组脱敏示例比较两套方向。保留一个主操作和原有高频入口，呈现正常、加载、空、错误及恢复等关键状态。他人读到图或原型时应能复现相同路径。
3. 选出能直接对照验证的切片。首批围绕单词墙工具栏、卡片、分页反馈和搜索性能，在独立分支验证后再扩展。用相同输入比对结果顺序、数量、返回位置及操作成功状态。
4. 记录改动文件、前后录屏或截图、测量方法及结果、剩余真机项目。只有通过设备实测的触控、动画和键盘体验才可标为真机通过。

## 首批验收

| 场景 | 验收动作 |
| --- | --- |
| 单词墙 | 在 360px、390px 宽度检查四列、长词和中文卡面。核对点按、长按、多选、单指纵滚、左右翻页、fresh 的按钮和双指上滑。检查末页、重复 fresh、带筛选及搜索后返回。 |
| 搜索与翻页 | 用相同数据和输入记录输入到结果绘制、翻页到新卡片绘制的中位数与 P95。检查有结果、零结果、连续输入、中文输入法联想、清空和连续翻页。 |
| 动效与可访问性 | 在窄屏、较大系统字号、系统减弱动态效果和 TalkBack 下检查主要控件可达、键盘弹出、焦点、状态提示和触控。用 Android WebView 确认双指与滚动不会造成误选、误翻面或误切页。 |
| 学习完整性 | 核对浏览操作无新增练习事件。验证复习断点及刷题草稿可续接，失败时保留待保存内容，保存成功后才显示相应进度。用脱敏夹具复测导入导出入口。 |
