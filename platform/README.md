# GRE 学习工作台

现有GRE数据的本地网页入口。React + Vite负责界面，Node负责读取仓库与追加记录；无需数据库或付费服务。

## 使用

安装Node.js 22+和Git，克隆或拉取本仓库。Windows运行 `./start-platform.ps1`，macOS/Linux运行 `bash ./start-platform.sh`，打开 http://127.0.0.1:4173 。首次自动安装依赖，每次启动重新构建；设置PORT可更换端口。启动脚本不会弹出命令窗口。也可让项目内的 `$gre-platform` skill 启动。

- **刷题**：直接阅读已有PDF，在同屏填写教材、单元、题号对应的答案。可计时、保存思路、保存并下一题。草稿保存在当前浏览器，正式作答保存在仓库。
- **资料库**：默认接入materials/catalog.yaml中的全部10份PDF，可直接看、按页跳转、单独打开。新增PDF最大30MB，存入materials/uploads；用户主动上传的PDF会随同步提交GitHub。
- **题目与答案导入**：支持JSON；答案另支持TXT，每行 `题号 答案 | 解析`。先预览再确认。上传我的作答与标准答案分别选择，避免把自答误当答案。导入的标准答案统一标记user_provided。
- **生词本**：查询、新增、编辑、移除与恢复；原记录不会被删除。部分旧词只有名单没有独立释义，显示尚未整理，可在词条查看历史批改或补充。
- **回忆**：翻卡或默写，每组最多20词，已练词按最近记录排后。自评与核验区分；不修改原主序停点或自动授予掌握等级。
- **历史**：新作答、事件和既有Markdown训练均可查阅；导出当前平台作答和自评JSON。

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

题型为tc/se/rc/quant。题目导入需要prompt；答案导入需要answer，省略prompt/options。答案和解析可后补，既有作答按最新答案重算显示，但原作答及历次答案事件不覆盖。TC多空按顺序，SE/RC/Quant多选按集合；数字支持十进制和简单分数；自由文字不自动判分。没有答案或无法可靠比较时result=null，不换算GRE量表分。

## 开发与迭代

- `platform/server/store.mjs`：旧数据适配、事件校验和投影；新增模块只扩展事件类型，不覆写累计文件。
- `platform/server/index.mjs`：本地HTTP、PDF流、同源检查。
- `platform/server/sync.mjs`：有限路径的Git同步，串行写入。
- `platform/web/src/`：按刷题、生词本、回忆、资料、历史拆分组件；共享样式与API。
- `.agents/skills/gre-platform/`：随仓库分发的启动维护skill。

`npm run dev` 开发，`npm run build` 构建，`npm start`前台运行，`npm test`运行隔离存储与判分边界测试。测试可设置GRE_DATA_ROOT到临时目录，隔离模式禁止Git同步。

当前解析来自既有训练记录或用户上传，尚未接入自动AI/OCR。PDF原文可读，无需先结构化；直接点选选项需导入结构化题目。新的中文释义由用户编辑，待词典核验。

视觉参考：shadcn/ui Sidebar Blocks、satnaing/shadcn-admin和Linear的界面重设计文章。仅借鉴信息层级和布局，不引入整套后台字段。
