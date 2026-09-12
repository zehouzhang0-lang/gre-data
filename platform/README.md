# GRE 学习工作台

现有GRE数据的本地网页入口。React + Vite负责界面，Node负责读取仓库与追加记录；基础学习功能无需数据库或付费服务，可选AI使用本机Codex订阅额度。

## 使用

安装Node.js 22+和Git，克隆或拉取本仓库。Windows运行 `./start-platform.ps1`，macOS/Linux运行 `bash ./start-platform.sh`，打开 http://127.0.0.1:4173 。首次自动安装依赖，每次启动重新构建；设置PORT可更换端口。启动脚本不会弹出命令窗口。也可让项目内的 `$gre-platform` skill 启动。

- **刷题**：默认从已有填空2000、阅读440、数学900三份PDF自动定位题目。选择题型后点选答案、提交、继续；不需要输入页码、单元或题号。TC多空分组选择，SE选择两项，Reading自动关联文章，选句题直接点选句子。数学保留完整原页图表；无法提取选项的题目填写实际答案。草稿保存在当前浏览器，正式作答保存在仓库。无计时证据的作答保持未计时。
- **资料库**：默认接入materials/catalog.yaml中的全部10份PDF，可直接看、按页跳转、单独打开。新增PDF最大30MB，存入materials/uploads；用户主动上传的PDF会随同步提交GitHub。
- **题目与答案导入**：支持JSON；答案另支持TXT，每行 `题号 答案 | 解析`。先预览再确认。上传我的作答与标准答案分别选择，避免把自答误当答案。导入的标准答案统一标记user_provided。
- **生词本**：查询、新增、编辑、移除与恢复；原记录不会被删除。部分旧词只有名单没有独立释义，显示尚未整理，可在词条查看历史批改或补充。
- **回忆**：翻卡或默写，每组最多20词，已练词按最近记录排后。自评与核验区分；不修改原主序停点或自动授予掌握等级。
- **历史**：新作答、事件和既有Markdown训练均可查阅；导出当前平台作答和自评JSON。
- **AI讲解与复盘**：作答后点击“AI讲解这道题”；学习记录中也可打开已做题目，或在“AI复盘”汇总最近练习。系统自动读取题干、参考答案和原作答，不必复制粘贴。结果作为暂定分析单独保存并可同步，不覆盖原作答、参考答案或技巧掌握等级。

## AI连接

本机安装Codex CLI并通过 `codex login` 登录ChatGPT账号，`codex login status` 应显示 `Logged in using ChatGPT`。平台自动查找CLI；Windows也查找Codex桌面应用附带的可执行文件。已验证CLI 0.153.4。其他设备需在本机单独登录，登录凭据不会随仓库同步。

服务端调用官方 `codex exec`，复用ChatGPT登录和订阅额度；Pro的20x用量不等于API余额，API按量计费与订阅独立。此入口强制ChatGPT登录并移除API密钥环境变量，不会自动改用付费API。模型默认gpt-6-astra，可在启动前通过 `GRE_AI_MODEL` 改为账号支持的Codex模型；CLI不在默认路径时使用 `GRE_CODEX_BIN` 指向其可执行文件。

只有点击分析按钮才发起模型请求。同一时间运行一个分析，最长等待5分钟，可以停止；失败时保留已有作答。模型接收本次题目/必要原图区域和学习记录，使用只读临时目录、结构化输出，关闭命令执行、插件及多agent；由平台后端校验并追加结果。临时文件随后清理，不把凭据或CLI日志写入Git。近期复盘只读取最近20次作答和60条词汇自评，不凭自评推断正式成绩。

官方依据：[登录与计费方式](https://learn.chatgpt.com/docs/auth)、[非交互调用](https://learn.chatgpt.com/docs/non-interactive-mode)、[订阅用量](https://learn.chatgpt.com/docs/pricing)。

## 跨设备

点击“同步进度”：保存平台事件和主动上传的PDF → 拉取并rebase origin/main → 普通push HEAD:main → 页面自动读取新记录。只有事件和平台上传的PDF会被自动提交；其他修改必须先人工检查。冲突会保留现场并报错。换设备前同步，在另一设备pull并启动；不要两台同时写同一仓库。数据变化每5秒读取一次；代码更新后重新启动，依赖改变时启动脚本传 `--install`。浏览器草稿尚未提交，不随Git同步。

本机服务只监听127.0.0.1，并检查Host/Origin。手机尺寸可用；直接在手机上使用需另行配置访问，不会把本地服务自动暴露到公网。

## 导入格式

每题最多保留必要题目片段或用户明确提供的题目，不自动复制整套题库。

```json
[
  {
    "material": "text_completion_2000",
    "unit": "test2_section1_easy",
    "question": "6",
    "type": "tc",
    "prompt": "填写实际题干",
    "options": [],
    "answer": null,
    "explanation": ""
  }
]
```

题型为tc/se/rc/quant。题目导入需要prompt；答案导入需要answer，省略prompt/options。答案和解析可后补，既有作答按最新答案重算显示，但原作答及历次答案事件不覆盖。TC多空按顺序，SE/RC/Quant多选按集合；数字支持十进制和简单分数；Reading选句键指定answer_format为sentence后比较完整句子；其他自由文字不自动判分。没有答案或无法可靠比较时result=null，不换算GRE量表分。

## 开发与迭代

- `platform/server/store.mjs`：旧数据适配、事件校验和投影；新增模块只扩展事件类型，不覆写累计文件。
- `platform/server/index.mjs`：本地HTTP、PDF流、同源检查。
- `platform/server/sync.mjs`：有限路径的Git同步，串行写入。
- `platform/server/question-bank.mjs`：从默认PDF提取位置和作答方式，按资料文件变化自动重建本地缓存；读取历史训练和平台作答推荐下一题。
- `platform/server/ai-coach.mjs`：本机Codex订阅连接、后台分析任务及结构化结果；答案导入和规则判分独立于模型。
- `platform/web/src/`：按刷题、生词本、回忆、资料、历史拆分组件；共享样式与API。
- `.agents/skills/gre-platform/`：随仓库分发的启动维护skill。

`npm run dev` 开发，`npm run build` 构建，`npm start`前台运行，`npm test`运行隔离存储与判分边界测试。测试可设置GRE_DATA_ROOT到临时目录，隔离模式禁止Git同步。

题目定位缓存位于被忽略的 `.gre-platform/questions-*.json`，换设备首次打开时自动重建，不把派生题库重复提交。Verbal可识别文本重新排版；粗体证据题和复杂版式保留原文区域，所有题目都有“查看原题”。数学保留原页并滚动标记当前题目。自动索引按可识别版式接入，不宣称覆盖每道题；其余资料仍可在资料库直接阅读，也可导入结构化题目。缓存版本变更后会重新生成。定位使用原书题号；补充数学套题重编号时用起始文件页形成稳定单元ID。

无答案的题目只记录“待核对”，不生成正确率或虚构解析。上传答案后按原定位回填核对。已接入2026-09-12用户提供的填空/SE与阅读答案长图，来源及覆盖数量见materials/answer-sources；原图保留在用户本机，结构化答案随Git同步。网页暂不提供任意图片OCR上传；仍支持JSON/TXT答案导入。新的中文词义由用户编辑，待词典核验。同步失败保留本地数据，页面“重试同步”会重新执行同步，成功后清除旧报错。

视觉参考：shadcn/ui Sidebar Blocks、satnaing/shadcn-admin和Linear的界面重设计文章。仅借鉴信息层级和布局，不引入整套后台字段。
