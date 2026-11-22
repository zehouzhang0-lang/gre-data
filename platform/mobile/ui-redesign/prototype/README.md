# GRE 单词墙 · 可交互候选原型

这是 UI 评审原型，尚未选定为正式 App 设计。使用 **168 个独立演示词条**、合成记忆颜色和示例进度。不会读取词库、SQLite、备份、题库、账号或签名材料；不调用 AI 或任何外部 API。

## 查看与重启

独立预览：<http://127.0.0.1:4188/>。这是电脑本机地址，不是手机可直接访问的线上服务。

初次运行位置为 `.gre-platform/ui-redesign-prototype/`。共享候选源码放在 `platform/mobile/ui-redesign/prototype/`。在仓库根目录运行（已安装 Node 与项目依赖）：

```powershell
node node_modules/vite/bin/vite.js --config platform/mobile/ui-redesign/prototype/vite.config.mjs --configLoader native
```

如果运行隔离副本，把 `--config` 后的路径换为 `.gre-platform/ui-redesign-prototype/vite.config.mjs`。固定监听 `127.0.0.1:4188`，端口被占用时退出；不复用正式 App 的 4174 端口。按 Ctrl+C 结束自己启动的服务。

无需安装新依赖。复用仓库 React、Vite、Lucide；不打包到正式 APK。原型缓存单独保存在自己的 `.cache/`。支持从该配置执行 `vite build --configLoader native` 生成本目录 `dist/`。

## 怎么比较

桌面左侧可切 A 清爽白底 / B 纸感阅读、360 / 390 宽度、减少动态效果，以及正常 / 载入中 / 无结果 / 失败。手机窄屏优先显示 App，主题和少动效开关在「设置」。

1. 点「下一页」到第 3 页，输入一个单词，再点搜索框内清空。原页码和同批词回到原位。
2. 点 `fresh 本页`：当前 28 词整批后移最多 3 页，当前页显示后面的词。点反馈条「撤销」可恢复。
3. 轻触词条翻面；长按进入多选。左右滑翻页；双指同向上滑 Fresh。多选期间禁止手势翻页与 Fresh。
4. 切换 A/B，检查同一页、同一组颜色、同一进度；切换主题不重置数据。
5. 打开复习的「温和与坚定」，从第 8 个演示词继续。点击「记得，继续」，切走或刷新，再回来核对断点。
6. 刷题使用三个原创例句交互样本，仅演示前后切题和草稿保留，不是 GRE 正式题库或诊断。

原型数据仅存到该 origin 的 `localStorage`，key 为 `gre-ui-synthetic-prototype-v1`。重置只替换这个 key，不清空其他 origin/存储。UI 会标出本机写入失败，不把失败保存报告为成功。

## 明确的行为边界

- Fresh 不改变记忆颜色，不增加复习数，不触发学习事件。尾页保持独立批次，不将少量尾词重新拼进熟悉的一页。
- 每个「筛选 + 排序 + 搜索词」保存自己的顺序和页码。搜索内 Fresh 只改变本次结果；清空回到主墙原来位置。正式接入前须与主线 Fresh 的作用域对照。
- 一次撤销针对最近一次 Fresh，只在同一作用域提供；不影响复习进度。撤销反馈持续可见，下一次操作才关闭。
- 搜索不等待动画，不重建搜索框；前后翻页为相反方向，Fresh 为垂直方向。系统减少动态效果和原型开关均关闭位移。
- 复习是单阶段认义演示，不能替代正式 App 的多阶段轮次契约。「设置复习任务」只说明接入边界；未实现任务编辑/删除/排期。设置没有账号登录、导入或导出。
- 刷题只是视觉骨架；SE/TC/RC 手势、Quant 图像、阅读分屏及选词必须在正式模块单独验收。

## 文件

- `src/main.jsx`：评审外壳与四个页面，主工作流为单词墙。
- `src/data.mjs`：合成词条状态、分页与批次 Fresh 纯函数。
- `src/style.css`：两套主题、布局、动效与窄屏规则。
- [设计规格](DESIGN.md)：令牌、文案、动效、概念差异。
- [交互验收与跨模块规则](INTERACTION-REVIEW.md)：风险与下一阶段实测方案。
- `REPORT.md`：实际验证、测量和未验收项，以该报告为准。
- `concept.png` 与截图：只含合成内容，图片为本机参考文件，默认不进入 Git。

## 候选 C（Claude 评审后新增）

候选 C 在同一个预览服务里，地址 <http://127.0.0.1:4188/c.html>。它与 A/B 共用 `src/data.mjs`、同一个 `localStorage` key 和同一份状态结构，没有改动 A/B 的任何文件。评审结论、设计规格和接入要求见 [CLAUDE-REVIEW.md](CLAUDE-REVIEW.md)。

- `c.html`、`src/c/main.jsx`、`src/c/c.css`：候选 C 的外壳、四个页面和样式。
- `src/c/sound.mjs`：Web Audio 合成的操作音效，没有音频文件和新依赖。
- `src/c/wall-gestures.mjs`：词墙手势。起点是 `src/main.jsx` 里的手势规则；第二轮改成了跟手翻页，并加了「按住后滑动标记」和双指下滑撤销。
- `src/c/stress.mjs`：28 个手写的长词和长释义，只用于「长词与长释义」演示状态和验证。
- `public/fonts/source-serif-4/`：Source Serif 4 可变字体（429 KB，OFL 1.1，取自 Adobe 官方仓库），许可证文件在同一目录。
- `c-qa.mjs`：候选 C 的验证脚本，结果写入 `C-QA.json` 和 `screenshots/c-*.png`。在仓库根目录运行 `node platform/mobile/ui-redesign/prototype/c-qa.mjs`。
- `search-harness.html`、`src/search-harness/main.jsx`：把正式的词墙组件挂在合成词库上，用来测检索。说明在 `../search/README.md`。

C 自己的数据各有各的 key，不写入共享状态：偏好（外观、记忆状态显示、词墙方向、音效、触感、减少动效）在 `gre-ui-candidate-c-prefs-v1`，手势或多选做的标记在 `gre-ui-candidate-c-marks-v1`。

Claude 提示词沿用共享目录的 `../CLAUDE-PROMPT.md`。Claude Code 当前尚未登录，本次没有把源码或记录发送给 Claude；可以在用户登录后仅提供专用提示词和本原型的脱敏说明。
