# GRE 安卓 App 功能盘点

盘点对象为 2026-11-22 当前工作副本的正式 App 源码。候选 C 对照采用 platform/mobile/ui-redesign/prototype/CLAUDE-REVIEW.md 第三、六节以及同目录 src/c 原型，正式行为以 App 的实际接线为准。**代码证据**后的完整路径以仓库根目录为基准，以 src/、ui-redesign/ 或 android/ 开头的简写路径相对于 platform/mobile/。表中**推断**标记界面取舍、用户理解成本或移除影响。入口步数按代码反推，以首次进入已完成启动的词库为 0，点击、长按或一次滑动各计一步，滚动、填字、等待加载和 Android 外部流程另注。

覆盖安卓正式页面与网页预览的代码分支，未运行 App、登录、联网联调，也未打开实际词库、SQLite、备份、答题记录、题库正文、账号凭据或签名材料。所有数量、账号、内容和错误均按代码里的字段或分支记录。

[词库与详情](#词库首页与分组词墙) · [复习与会话](#复习) · [刷题与 AI 解析](#刷题模块) · [设置与备份](#设置文件导入预览与-chatgpt-连接) · [常见问题](#跨页面答复) · [改版卡点](#候选-c-接入卡点与讨论项)

## 页面地图总览

| 页面或视图 | 从启动进入 | 空、加载、出错及隐藏状态 | 证据 |
| --- | --- | --- | --- |
| 启动 | 0，打开应用自动进入 | 首次/常规读取、超过 15 秒的慢读、无可用状态时的失败三种界面，慢读可继续等待或重新读取，失败可重新读取。 | 代码证据 src/App.jsx:66–69，src/useRepository.js:5–16、28–47 |
| 词库 | 0，其他标签切回 1 步 | 已载入后默认页，查询空、空词库、普通页、关系组页、多选、翻面、快捷条与弹层分支见词库表。 | 代码证据 src/App.jsx:30、79，src/components/WordWall.jsx:415–478 |
| 复习 | 1，底栏「复习」 | 单页内有当天任务与复习记录、空状态、任务表单及轮次管理，进入复习会话时保留底层状态但隐藏底栏。 | 代码证据 src/components/Review.jsx:59–80，src/App.jsx:80、88–90 |
| 复习会话 | 通常 2，「复习」→未完成轮次，从词库启动会话另见复习表 | 可出现开轮配置、若干作答阶段、保存失败并重试、结束汇总，且独立接管返回。 | 代码证据 src/App.jsx:63–65、88–90，src/components/WordSession.jsx:13–97 |
| 刷题 | 1，底栏「刷题」 | 首次懒加载，随后题库载入，题型首页、恢复题位、导航弹层、空集、题目加载/错误、提交反馈及 AI 见刷题表。 | 代码证据 src/App.jsx:15–25、47、81–85，src/components/Practice.jsx:97–119、325–387 |
| 设置 | 1，底栏「设置」 | 同页含声音、词墙显示、词库与数据、刷题记录、AI 题目解析、离线使用和操作提示，备份与外部账号相关动作按条件显示。 | 代码证据 src/components/Settings.jsx:48–89 |
| Android 文件选择/保存界面 | 通常 2，「设置」→相应导入/导出 | App 通过原生桥打开系统文件流程，网页走文件选择框/下载，用户取消不作为这两组设置的错误提示。 | 代码证据 src/data/storage.mjs:36–59，src/components/Settings.jsx:19–41，src/components/PracticeDataSettings.jsx:14–38 |
| ChatGPT 授权浏览器 / 管理额度 | 通常 2，进入「设置」再点相应按钮，授权步骤由外部浏览器决定 | Android 可进入授权，前台轮询、刷新超时、模型加载、取消和重试在 App 设置内，网页预览连接按钮不可用。 | 代码证据 src/components/ChatGPTSettings.jsx:15–37、70–89，src/ai/client.mjs:3–25，android/app/src/main/java/cn/grestudy/vocabulary/ChatGPTPlanPlugin.java:136–154 |
| 全局反馈与返回 | 0，随当前动作自动出现 | 提示挂到最上层弹层的反馈位，或进入页面正常布局，Esc/Android 返回优先关闭弹层或子流程，无更高优先级则回词库。 | 代码证据 src/App.jsx:36–45、70–90，src/components/Primitives.jsx:24–47，src/mobile.css:131–138，src/useBack.js:4–27 |

### 应用壳与启动

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议和理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 启动与读失败重试 | 自动 0，异常「重新读取」另 1 | 监视同一次初始化并区分慢读与失败。 | 代码证据 src/App.jsx:66–69，src/useRepository.js:5–16、28–47 | 本地 repository 及随包词库更新流程。 | C 里没有 | 推断：移除异常分支会丢失恢复入口和原数据状态说明。 | 推断：保留重试和慢读，缩短常规加载文案。 |
| 四标签、后台视图和返回 | 0 看底栏，各标签 1，Android 返回或 Esc 1 | 保持各标签组件状态，按优先级关闭界面，复习会话全屏。 | 代码证据 src/App.jsx:30–37、79–90，src/components/Primitives.jsx:24–28、54–56，src/useBack.js:4–27 | React 标签状态、原生返回桥、弹层焦点恢复。 | 已按 C 改（仅词库文字底栏），其余未改 | 推断：丢失跨模块直达、恢复的浏览上下文或系统返回行为。 | 推断：保留导航层次，后续统一四页视觉。 |
| 保存及提示 | 自动，关闭/提示内撤销另 1 | 防重复写，等待写入并刷新，成功和错误用同一提示组件呈现。 | 代码证据 src/App.jsx:38–45、52–62、70–75、89，src/mobile.css:131–138 | 成功提示约 4.5 秒、带撤销提示约 8.5 秒、错误需关闭，浮层反馈进入流式布局。 | 已按 C 改（行为修正），非词墙页面视觉未改 | 推断：移除会让用户无法区分成功、失败和已写入但显示未刷新。 | 推断：保留结果与重试，合并相邻页面的重复消息。 |
| 刷题懒载与应急恢复 | 「刷题」1，错误时「重新打开」再 1 | 首次动态加载，渲染异常由专用边界处理。 | 代码证据 src/App.jsx:15–25、47、81–85 | React lazy/Suspense 与 Browser reload。 | C 里没有 | 推断：删掉保护会使刷题渲染异常影响整个应用壳。 | 推断：保留。 |
| 通用弹层和确认 | 由各页动作触发，关闭 1 | 支持遮罩、关闭按钮、返回、Tab 焦点圈，以及将反馈就近挂载。 | 代码证据 src/components/Primitives.jsx:24–51 | 焦点管理、返回优先级 100、忙时确认禁用。 | 未改（共用原控件，已改提示位置） | 推断：键盘、返回和危险动作确认将失去一致行为。 | 推断：保留行为，统一样式。 |

| 显示字段 | 必要性判断 | 证据 |
| --- | --- | --- |
| 「正在打开词库」 | 推断：必要，避免启动时误认为白屏。 | 代码证据 src/App.jsx:69 |
| 「首次打开会将词库保存到手机」 | 推断：仅首次有用，可在首次场景显示。 | 代码证据 src/App.jsx:69 |
| 「词库打开耗时较长」、等待超过 15 秒、继续等待与数据保护说明 | 推断：慢读状态和是否会动数据必要，秒数可次要展示。 | 代码证据 src/App.jsx:68 |
| 「本地词库暂时无法读取」、具体错误和重开说明 | 推断：状态、可行动错误和数据说明必要，重复重开说明可压缩。 | 代码证据 src/App.jsx:66 |
| 「重新读取」「刷题页面暂时无法打开」「重新打开」「正在打开刷题…」 | 推断：各自承担重新进入操作或等待/故障反馈，需保留。 | 代码证据 src/App.jsx:21–23、66–68、82 |
| 词库、复习、刷题、设置四个文字入口、当前标签和非词墙页图标 | 推断：文字和当前状态必要，图标可随 C 统一。 | 代码证据 src/components/Primitives.jsx:54–56 |
| 提示正文、危险/成功样式、「撤销」「关闭提示」 | 推断：正文和动作必要，成功样式可弱于错误。 | 代码证据 src/App.jsx:70–74，src/mobile.css:133–138 |
| 弹层标题、关闭、确认、取消、处理中 | 推断：必要，分别承担上下文、返回、提交、终止和异步状态。 | 代码证据 src/components/Primitives.jsx:43–51 |

## 词库首页与分组词墙

### 页面、路径与状态

| 页面或弹层 | 从打开 App 起的路径 | 空、加载、错误状态 |
| --- | --- | --- |
| 普通词墙 | 0 步，启动完成后直接进入，代码证据 platform/mobile/src/App.jsx:28–30、66–79。 | 无结果显示「没有匹配的单词」、减少筛选或导入的建议及「清除筛选」，没有单独搜索加载页，启动与写入异常走全局，代码证据 platform/mobile/src/components/WordWall.jsx:24–44、451，platform/mobile/src/components/Primitives.jsx:53，platform/mobile/src/App.jsx:52–73。 |
| 分组词墙 | 3 步，「筛选 → 选关系类型或指定关系组 → 应用」，原生下拉选取按一次选择计，代码证据 platform/mobile/src/components/WallSheets.jsx:19–26，platform/mobile/src/components/WordWall.jsx:52、441–449、468–469。 | 与普通词墙共用空态和保存提示，界面按关系分区并保留上一页和下一页按钮，代码证据 platform/mobile/src/components/WordWall.jsx:441–459。 |
| 状态筛选结果 | 1 步，首页点任一记忆状态计数，再次点同档可清除该条件，代码证据 platform/mobile/src/components/WordWall.jsx:425–434。 | 与词墙共用空结果，代码证据 platform/mobile/src/components/WordWall.jsx:451。 |
| 筛选弹层 | 1 步，状态行右端「筛选」，多选或保存时禁用，代码证据 platform/mobile/src/components/WordWall.jsx:434、468–469。 | 没有关系组时省略指定组，无独立加载或错误提示，代码证据 platform/mobile/src/components/WallSheets.jsx:12–30。 |
| 词库操作 | 1 步，工具栏「⋯」，从多选入口先点「多选」，共 2 步，代码证据 platform/mobile/src/components/WordWall.jsx:412–424、470–481。 | 依据选中数量、释义、末页与撤销状态显示或禁用动作，写入反馈走全局通知，代码证据 platform/mobile/src/components/WordWall.jsx:74–85、470–481，platform/mobile/src/App.jsx:52–73。 |
| 长按操作条 | 普通词墙长按卡片，0 点击加 1 手势，批量标记为 2 点击加 1 手势，「多选 → 点卡片 → 长按已选卡」，代码证据 platform/mobile/src/components/WallTrack.jsx:144–159，platform/mobile/src/components/WordWall.jsx:329–355、412–465。 | 未选中的卡不会打开批量操作条，滑出取消，释义不齐直接报「请先补齐释义，再标记」，代码证据 platform/mobile/src/components/WordWall.jsx:287–294、329–365。 |
| 选全部结果确认 | 3 步，「多选 → ⋯ → 选全部结果」，第四步确认，代码证据 platform/mobile/src/components/WordWall.jsx:383–388、421–423、475、489。 | 没有结果时入口禁用，确认不需要另行加载，代码证据 platform/mobile/src/components/WordWall.jsx:383–388、475。 |
| 更换筛选确认 | 防御分支，仅在已有选中词却进入更改筛选时出现，常规多选会隐藏搜索并禁用筛选入口，空态「清除筛选」仍可调用同一处理器，代码证据 platform/mobile/src/components/WordWall.jsx:137–146、412–434、451、489。 | 保留或清空选中词，不请求数据写入，代码证据 platform/mobile/src/components/WordWall.jsx:137–146。 |
| 分组表单 | 最短 0 点击加 1 次长按滑到「分组」，多选路径为 4 步，「多选 → 点卡片 → ⋯ → 为当前多选单词分组」，代码证据 platform/mobile/src/components/WordWall.jsx:323–355、478–485。 | 名称为空时「创建」禁用，保存显示「保存中…」，失败保留表单并反馈，代码证据 platform/mobile/src/components/WordWall.jsx:278–285、482–486，platform/mobile/src/App.jsx:52–61。 |
| 复习轮命名表单 | 4 步，「多选 → 点有释义的卡片 → ⋯ → 为当前选中单词设置复习轮」，代码证据 platform/mobile/src/components/WordWall.jsx:77–78、412–423、479–485。 | 所选词必须都有释义，名称必填，保存中锁定，失败保留表单，代码证据 platform/mobile/src/components/WordWall.jsx:77–78、278–285、479–486。 |
| 组内辨析 | 4 步，进入分组词墙后点「词组 NN」，代码证据 platform/mobile/src/components/WallSheets.jsx:19–26，platform/mobile/src/components/WordWall.jsx:441–444、488。 | 仅有分组时可打开，成员缺释义时显示「待补释义」，没有额外加载状态，代码证据 platform/mobile/src/components/WordWall.jsx:441–444、488。 |
| 词条详情 | 2 步「翻面 → 卡片角上的 ⋯」，或普通词墙长按滑到「详情」，多选恰好 1 词时是 4 步「多选 → 选词 → ⋯ → 查看所选词详情」，代码证据 platform/mobile/src/components/WordTile.jsx:144–145、217–219、249，platform/mobile/src/components/WordWall.jsx:351–355、477、487。 | 词性、释义、例句及来源支持缺失占位，音标异步加载，播放故障有就地提示，代码证据 platform/mobile/src/components/WordDetail.jsx:23–28、44–57，platform/mobile/src/components/Pronunciation.jsx:23–29。 |
| 词条编辑 | 3 步，「翻面 → 卡片角上的 ⋯ → 编辑词条」，代码证据 platform/mobile/src/components/WordTile.jsx:249，platform/mobile/src/components/WordDetail.jsx:36–42、54。 | 中文释义必填，保存禁用编辑按钮，失败保留草稿并走全局错误通知，代码证据 platform/mobile/src/components/WordDetail.jsx:37–42，platform/mobile/src/components/WordWall.jsx:487，platform/mobile/src/App.jsx:52–61。 |
| 词墙直达的词汇会话 | 2 步，「⋯ → 背诵筛选词」，进入复习会话的开始界面，代码证据 platform/mobile/src/components/WordWall.jsx:479，platform/mobile/src/App.jsx:63、88。 | 只带有释义且去重的结果，无合格词时禁用，进入后的分步界面见复习，代码证据 platform/mobile/src/components/WordWall.jsx:74–78、479，platform/mobile/src/components/WordSession.jsx:8–20。 |
| 隐藏旧尺寸弹层 | 无可达入口，尺寸组件仍有导出，正式设置直接复用字号控件，代码证据 platform/mobile/src/components/WallSheets.jsx:33–45，platform/mobile/src/components/Settings.jsx:6、57–68，platform/mobile/src/components/WordWall.jsx:10、468–486。 | 留存的「尺寸与排布」含字号、固定 4×7 提示和「完成／保存中…」，推断：这些字段仅属未挂载组件，代码证据 platform/mobile/src/components/WallSheets.jsx:40–45。 |

### 词墙功能

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 行内搜索与原位返回 | 首页 0 步可见，点框开始输入。 | 实时搜词形、释义和笔记，输入法组词期间先不触发，清空恢复搜索前状态。 | 代码证据 platform/mobile/src/components/WordWall.jsx:24–44、155–158、418–420，platform/mobile/src/wall-search.mjs:4–12、82–100。 | 查询之前的筛选、页、滚动、随机种子和 Fresh 顺序与数据集视图关联。 | 已按 C 改 | 推断：失去跨页快速查词与原位续读。 | 推断：保留，搜索框应一直在首页。 |
| 页序、页码与视图记忆 | 普通墙拖动或键盘聚焦翻页控制，分组墙可点页按钮。 | 普通 4×7 使用跟手页轨，可左右或上下，分组仍左右手势并保留页按钮。 | 代码证据 platform/mobile/src/components/WordWall.jsx:107–119、147–154、252–277、436–459，platform/mobile/src/components/WallTrack.jsx:87–99、320–328，platform/mobile/src/wall-track.css:1–31。 | 本地浏览状态、分页以及滚动隔离，普通页相邻预览不接收点击，并排除在可滚动范围外。 | 已按 C 改，分组按验收取舍沿用原版 | 推断：容易丢页位或把普通滚动误当翻页。 | 推断：保留，普通页继续保留键盘翻页。 |
| 状态行直筛 | 1 步，四档计数各自可点。 | 选单档或取消，筛选面板仍支持多档。 | 代码证据 platform/mobile/src/components/WordWall.jsx:17–22、88–95、425–434，platform/mobile/src/components/WallSheets.jsx:27。 | 当前筛选范围下的去重单词及已保存的记忆标记。 | 已按 C 改 | 推断：按记住程度挑词变慢。 | 推断：保留四个带可读标签的控件。 |
| 翻卡、图例与可读状态 | 1 步点词卡，释义同位展开。 | 英文显示一面并自动排字，填色只在有标记的释义面，圆点模式在有标记的两面，翻到释义面记录草稿。 | 代码证据 platform/mobile/src/components/WordTile.jsx:129–168、217–249，platform/mobile/src/components/WordWall.jsx:122–128，platform/mobile/src/word-tile-c.css:13–18、62–74。 | 词性释义与记忆状态，翻阅草稿待人工提交。 | 已按 C 改并含最新验收取舍 | 推断：失去主动回忆及翻阅草稿的采集来源。 | 推断：保留，缺释义仍允许查详情和补释义。 |
| 多选、全选本页与清空 | 1 步进入多选，然后点词或「全选本页」，「清空选择」在菜单中。 | 选择按词形去重并可批量处理，「取消」退出，「清空选择」留在多选。 | 代码证据 platform/mobile/src/components/WordWall.jsx:75–86、120–136、383–388、412–423、475–478。 | 选择集与筛选结果中的去重键。 | 已按 C 改，按验收取消底部三档按钮 | 推断：无法批量分组、标记或建轮。 | 推断：保留，明确「取消」和「清空」的区别。 |
| 本页与跨页全选 | 「多选 → 全选本页」2 步，跨页全选完成需 4 步。 | 本页并入当前选中集，跨页全选先确认，并提示关系组重复词只选一次。 | 代码证据 platform/mobile/src/components/WordWall.jsx:383–388、415–416、475、489。 | 当前页词形及所有过滤结果的唯一词形。 | 已按 C 改并保留主线确认 | 推断：大批分组或提交补充整理费力，去掉确认易选过量。 | 推断：保留本页入口，跨页全选留在二级。 |
| 快速单词及批量标记 | 普通词墙长按滑到三档色标，详情还可以点按钮。 | 所选任一词无释义则整批挡下，保存后才播放成功反馈、翻回并退出选择。 | 代码证据 platform/mobile/src/components/WordWall.jsx:287–307、329–355、462–466，platform/mobile/src/components/WordDetail.jsx:48。 | repository 的 rate() 校验并写 vocab_quick_review。 | 已按 C 改 | 推断：失去回忆自评和与筛选、排期关联的学习记录。 | 推断：保留手势和详情的可点替代。 |
| 撤销标记 | 普通或分组词墙双指下滑，或「⋯ → 撤销上次标记」2 步。 | 撤销已有标记事件，手势有更新的可撤销 Fresh 时可优先撤销 Fresh。 | 代码证据 platform/mobile/src/components/WordWall.jsx:308–322、480，platform/mobile/src/data/repository.mjs:175。 | undoQuickReview() 和其事件目标，与 Fresh 的本地快照各自独立。 | 已按 C 改并遵循页脚去冗余取舍 | 推断：误标难纠正，尤其是整批标记。 | 推断：保留手势与二级明示入口。 |
| Fresh 与撤销后移 | 双指上滑或「⋯ → fresh 本页」2 步，双指下滑或菜单撤销。 | 保持当前页号并以之后一页补位，把本页原卡片搬到后最多三页，保留短页边界。 | 代码证据 platform/mobile/src/components/WordWall.jsx:84–85、159–192、193–238、471–472，platform/mobile/src/wall-navigation.mjs:23–51，platform/mobile/src/components/WallTrack.jsx:219–257。 | 浏览顺序按数据集保存，筛选切换清除当前顺序，搜索另起顺序且清空时恢复原浏览快照。 | 已按 C 改，但保留主线作用域 | 推断：熟词页会反复阻挡继续浏览，去掉撤销会增加误滑代价。 | 推断：保留手势和二级入口。 |
| 分区标题、组内辨析 | 应用关系筛选后点击「词组 NN」。 | 同类组相邻分区，点标题看组名、词义差异和例句。 | 代码证据 platform/mobile/src/wall-search.mjs:108–139，platform/mobile/src/components/WordWall.jsx:441–444、488。 | 关系组成员、用法、例句与显式筛选范围。 | C 里没有，正式保留原版 | 推断：只知道词同组，难了解关系适用义项。 | 推断：保留二级辨析页，分组页仍走原翻页。 |
| 记录本轮卡片状态 | 2 步，「⋯ → 记录本轮卡片状态」。 | 合并翻面草稿与当前标记状态，成功后一次写入并开新一轮，清空翻面。 | 代码证据 platform/mobile/src/components/WordWall.jsx:122–128、366–381、473，platform/mobile/src/card-reading-draft.mjs:1–35，platform/mobile/src/data/repository.mjs:146–154。 | 受 quickRound ID、失败后保持原 ID 与内容的批次、vocab_card_reading 校验约束。 | C 里没有，原型占位，正式保留 | 推断：未提交的翻阅草稿无法写入，词墙改标计次边界也失去入口。 | 推断：保留在二级，解释它何时改变轮次。 |
| 补充整理 | 4 步，「多选 → 点词 → ⋯ → 补充整理」。 | 为选中词加入去重的待整理请求，成功后退出选中状态。 | 代码证据 platform/mobile/src/components/WordWall.jsx:390–396、474，platform/mobile/src/data/repository.mjs:158–168。 | vocab_curation_request、词库范围的待整理结果与详情标记。 | C 里没有，原型占位，正式保留 | 推断：收集疑难、待核验释义要改走外部流程。 | 推断：留在多选二级，名称可具体为「标为待整理」。 |
| 为当前多选单词分组 | 4 步，「多选 → 选词 → ⋯ → 为当前多选单词分组」。 | 为一组词建立自定义语义主题或关系，经筛选找回。 | 代码证据 platform/mobile/src/components/WordWall.jsx:278–285、323–325、478、482–486，platform/mobile/src/data/repository.mjs:142–144。 | vocab_word_group、组名、归属与去重词形。 | 已按 C 改，正式持久化保留 | 推断：用户主动建立的联系无法补充。 | 推断：保留菜单入口，单词长按捷径使用同一表单。 |
| 为当前选中单词设置复习轮 | 4 步到表单，填名或接受日期后点创建。 | 把所有选中且释义完整的词创建为命名轮次，仍留在词墙，可到复习列表打开。 | 代码证据 platform/mobile/src/components/WordWall.jsx:77–78、278–285、479–486，platform/mobile/src/data/repository.mjs:103–106。 | createReviewRound() 保存会话和轮次，冻结训练内容。 | C 里没有，原型占位，正式保留 | 推断：用户无法从亲选词构建可续接的练习轮。 | 推断：保留在多选二级，区分建立一轮和建立长期任务。 |
| 背诵筛选词 | 2 步，「⋯ → 背诵筛选词」。 | 拿当前筛选中有释义的去重词启动自由会话，由下一屏选择数量和遍数后开始。 | 代码证据 platform/mobile/src/components/WordWall.jsx:75–78、479，platform/mobile/src/App.jsx:63、88，platform/mobile/src/components/WordSession.jsx:8–20、63–67。 | 只有开始后才通过 vocab_session 保存训练。 | C 里没有，原型占位，正式保留 | 推断：无法用当前筛选快速开始临时训练。 | 推断：与创建命名轮继续并列于二级，保留各自的启动意图。 |

### 筛选、辅助弹层与词条详情的功能

| 页面／功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 筛选／范围、主题、关系、指定组、状态、首字母、来源 | 1 步打开筛选，编辑再应用。 | 同维度条件取并集，跨维度取交集，指定组会清掉已选择的关系类型。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:5–30，platform/mobile/src/wall-search.mjs:84–137。 | 主题、关系、来源、排期、状态与本地目录索引。 | 筛选入口已按 C 改，完整维度 C 里没有 | 推断：教学和查找无法精确收窄。 | 推断：保留全套能力，常用条件优先，其他折叠展示。 |
| 筛选／排序、重新随机 | 1 步打开筛选，选 A–Z、Z–A、随机并应用，已是随机时可独立重排。 | 切换顺序，重新随机增加种子，查询保持当前文本。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:15–22，platform/mobile/src/components/WordWall.jsx:137–145、468–469。 | 当前筛选与种子，首页没有独立排序按钮。 | 已按 C 改并并入筛选 | 推断：无法回到字母顺序或换随机样本。 | 推断：保留在筛选面板。 |
| 筛选／重置与应用 | 打开后点「重置筛选」改变草稿，点「应用筛选」生效。 | 重置只清其他维度，保留搜索和排序，空态独立的「清除筛选」则把所有条件恢复默认。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:12–20，platform/mobile/src/components/WordWall.jsx:409、451，platform/mobile/src/model.mjs:6。 | draft 与已生效条件分开。 | 未改，原主线交互保留 | 推断：改筛选要逐项清除，误点重置更难修复。 | 推断：保留两个入口，说明各自影响范围。 |
| 组内辨析／分组信息 | 从分组页点击词组标题，通常 4 步。 | 展示组名、备注及成员用法，词义可回退为词条释义。 | 代码证据 platform/mobile/src/components/WordWall.jsx:441–444、488。 | 关系成员与词条实时资料。 | C 里没有 | 推断：失去组内语义辨析。 | 推断：保留在二级。 |
| 详情／词义、双语例句、关联词 | 翻面后点角标，通常 2 步。 | 用词性组织义项，例句强调目标词并标注来源，缺例句显式提示。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:9–19、30–47。 | senses、结构化例句、标准释义与关系组，编辑未触及旧轮答案快照。 | 入口和卡片已按 C 改，完整详情未改 | 推断：卡片简短释义不足以核验用法，多义词更难区分。 | 推断：保留首要义项及例句，关联词按需展开。 |
| 详情／英美发音与来源 | 详情后点一侧扬声器，通常 3 步。 | 先读取随包音频，再尝试随包合成备用，最后尝试系统语音，退出或转后台时停止。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:23–28、44、57，platform/mobile/src/components/Pronunciation.jsx:10–29，platform/mobile/src/pronunciation.mjs:14–55。 | 本地音标索引、音频资源及系统英语语音，引用外链另需联网。 | C 里没有 | 推断：失去核对口音及听音入口。 | 推断：保留播放，授权信息收进可展开的来源。 |
| 详情／记忆标记和记录 | 详情后点击相应档位，通常 3 步。 | 沿用统一 rate()，显示已保存的记忆状态、复习次数和翻阅时间。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:48–53，platform/mobile/src/components/WordWall.jsx:287–307、487。 | 当前词有释义才可标记，翻阅、复习分别取投影。 | 标记已有实装但完整详情未改 | 推断：删除按钮会失去组内和无长按场景的标记替代，删统计则难分辨看过和练过。 | 推断：保留标记，统计收进二级。 |
| 详情／编辑词条 | 详情后点击「编辑词条」，通常 3 步。 | 保存词性、必填中文释义和笔记，成功后退出编辑。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:29、36–43、54，platform/mobile/src/components/WordWall.jsx:487。 | vocab_upsert 和用户编辑标识，旧轮词义快照保留。 | C 里没有 | 推断：手机端无法纠正词义或记录个人联想。 | 推断：保留为详情内的二级动作。 |
| 详情／词义说明、收录与发音来源 | 详情中向下浏览，点「词义说明」或来源链接加 1 步。 | 展示释义质量、用户笔记、收录文本以及音标与录音的出处和许可。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:49–57，platform/mobile/src/components/Pronunciation.jsx:33–39。 | 释义状态、来源、采集上下文和引用元数据。 | C 里没有 | 推断：失去核验入口，录音归属也不易找到。 | 推断：收进二级，保留缺释义及拼写指引在学习路径。 |

### 显示字段

| 页面 | 字段 | 是否必要 | 依据 |
| --- | --- | --- | --- |
| 词墙 | 「搜索单词」与输入文本 | 推断：必要，清楚表达搜索入口及当前查询。 | 代码证据 platform/mobile/src/components/WordWall.jsx:41–44、418。 |
| 词墙 | 清空搜索 × | 推断：必要，一步恢复浏览位置。 | 代码证据 platform/mobile/src/components/WordWall.jsx:419，platform/mobile/src/wall-navigation.mjs:23–26。 |
| 词墙 | 「多选」「取消」 | 推断：必要，明确进出选择模式。 | 代码证据 platform/mobile/src/components/WordWall.jsx:412–421。 |
| 词墙 | 「已选 N 词」「全选本页」 | 推断：必要，批量动作前要知道范围。 | 代码证据 platform/mobile/src/components/WordWall.jsx:414–416。 |
| 词墙 | 「⋯」 | 推断：必要，承载被收起的低频动作并有无障碍名称。 | 代码证据 platform/mobile/src/components/WordWall.jsx:423。 |
| 词墙 | 四档记忆色标、数量及筛选选中态 | 推断：必要，同时用于图例和筛选，需要保留档位文字朗读。 | 代码证据 platform/mobile/src/components/WordWall.jsx:17–22、425–431。 |
| 词墙 | 「N 词」及范围／排序／组名 tooltip | 推断：总词数必要，tooltip 作为可访问性补充，不必加入常驻说明。 | 代码证据 platform/mobile/src/components/WordWall.jsx:398–399、433。 |
| 词墙 | 「筛选」及已启用条件数字 | 推断：入口必要，条件数可简化成激活标志。 | 代码证据 platform/mobile/src/components/WordWall.jsx:434，platform/mobile/src/model.mjs:69。 |
| 词墙 | 英文、词性、简释与「待补释义」 | 推断：必要，前后两面承担回忆和核对。 | 代码证据 platform/mobile/src/components/WordTile.jsx:99–116、222–243。 |
| 词墙 | 卡片圆点或释义面填色、屏幕阅读器记忆标签 | 推断：必要，分别承担可扫读反馈与不靠颜色的辨认。 | 代码证据 platform/mobile/src/components/WordTile.jsx:119–138、234–248。 |
| 词墙 | 勾选 ✓ 和详情 ⋯ | 推断：必要，分别确认批量选择与提供明确可点的详情入口。 | 代码证据 platform/mobile/src/components/WordTile.jsx:245–249。 |
| 词墙 | 「当前页 / 总页数」、边界提示 | 推断：必要，提供位置认知和到边界的反馈。 | 代码证据 platform/mobile/src/components/WordWall.jsx:449、454–461。 |
| 词墙 | 普通墙键盘可见的「上一页」「下一页」 | 推断：必要，给不能使用手势的人替代入口。 | 代码证据 platform/mobile/src/components/WordWall.jsx:454–458，platform/mobile/src/wall-candidate.css:61–62。 |
| 分组词墙 | 「词组 NN」、关系类别 | 推断：关系类别必要，序号可以让位给实际组名。 | 代码证据 platform/mobile/src/components/WordWall.jsx:441–444。 |
| 分组词墙 | 「上一页」「下一页」「N 张卡片」 | 推断：翻页动作必要，卡片数在组成员可能重复时才有独立意义。 | 代码证据 platform/mobile/src/components/WordWall.jsx:453，platform/mobile/src/components/Primitives.jsx:58。 |
| 词墙空态 | 「没有匹配的单词」、缩小条件或导入建议、「清除筛选」 | 推断：状态和清除按钮必要，导入提示可在确实无词时再显示。 | 代码证据 platform/mobile/src/components/WordWall.jsx:451，platform/mobile/src/components/Primitives.jsx:53。 |
| 长按操作条 | 三档色标、「分组」「详情」及档位名称的读屏文本 | 推断：必要，图形负责扫读且需有文字辅助，批量只需要三档。 | 代码证据 platform/mobile/src/components/WordWall.jsx:17–22、462–466。 |
| 筛选 | 「筛选词库」、可多选和同组排列说明 | 推断：标题必要，说明可缩入关系或筛选规则旁。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:16–21。 |
| 筛选 | 排序和 A–Z／Z–A／随机选项 | 推断：必要，明确结果顺序。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:22。 |
| 筛选 | 全部单词、今日待复习、待首轮回忆、待补释义、待补充整理 | 推断：必要，各自对应不同工作范围，可用更直接名称说明差异。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:23，platform/mobile/src/wall-search.mjs:98–100。 |
| 筛选 | 语义主题、待分类、关系类型、指定组与全部关系组 | 推断：必要，保留面向自定义组和缺分类词的入口。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:24–26，platform/mobile/src/model.mjs:4，platform/web/src/word-wall-model.mjs:2。 |
| 筛选 | 记忆状态四档及每组「全部」开关 | 推断：必要，支持多档组合以及单维清除。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:5–10、27。 |
| 筛选 | A–Z 单字母和收录来源列表 | 推断：必要但可放低频组，列表过长时折叠。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:28–29。 |
| 筛选 | 「重置筛选」「应用筛选」「重新随机」 | 推断：必要，区分清草稿、应用、换随机列表三个动作。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:15–20。 |
| 词库操作 | 标题和菜单动作、选全部结果及背诵的词数、缺释义说明 | 推断：动作与动态数量必要，长动作名可收短并保留其语义。 | 代码证据 platform/mobile/src/components/WordWall.jsx:470–480。 |
| 词库操作 | 本轮改标及自动开新轮说明、三条手势帮助 | 推断：行为解释必要，可合并到帮助区并在首次使用时按需出现。 | 代码证据 platform/mobile/src/components/WordWall.jsx:481，platform/mobile/src/components/WallSheets.jsx:47–52，platform/mobile/src/components/Settings.jsx:81。 |
| 确认弹层 | 两种标题、影响数、跨组去重／保存标记保留说明、取消、确认、处理中 | 推断：必要，避免将改变筛选或跨页选择误当成本页操作。 | 代码证据 platform/mobile/src/components/WordWall.jsx:143–145、387–388、489，platform/mobile/src/components/Primitives.jsx:50–51。 |
| 创建表单 | 表单标题、当前单词或「已选 N 词」、分组归属两选项、分组／复习轮名称、创建／保存中 | 推断：必要，让用户知道对象、归属与保存状态。 | 代码证据 platform/mobile/src/components/WordWall.jsx:482–485。 |
| 组内辨析 | 标题、实际组名、组备注、成员、用法／释义、例句、SE 关系提示 | 推断：必要，备注或例句为空时可按需折叠，关系不等于 SE 等价这条值得保留在该语境。 | 代码证据 platform/mobile/src/components/WordWall.jsx:488。 |
| 详情 | 标题词形、词性、按词性归纳的释义、词性／释义缺失占位 | 推断：必要，构成最小词条。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:36、45。 |
| 详情 | 「英」「美」、音标、加载 …／音标待核验、播放／停止、合成、播放错误 | 推断：必要，保留可用性与出处区分，失败后要能重试按钮。 | 代码证据 platform/mobile/src/components/Pronunciation.jsx:18–29。 |
| 详情 | 「关联词组」、组名、成员和组笔记 | 推断：有用，可折叠后再查。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:46。 |
| 详情 | 「双语例句」、英文及目标词高亮、中文、词性和义项、例句出处／定位或自拟日期、待补提示 | 推断：例句、义项、来源类型必要，日期与定位可降到次级。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:9–19、47。 |
| 详情 | 「按刚才的回忆标记」与三档按钮 | 推断：必要，动作含义清楚并提供手势替代。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:48，platform/web/src/word-wall-model.mjs:1。 |
| 详情 | 「待补充整理」与「词义说明」、释义状态、自带说明及个人笔记 | 推断：必要但低频，保留已进入整理流程与拼写纠正的可见性。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:49–51。 |
| 详情 | 当前记忆状态、复习 N 次、翻阅 N 次、最近翻阅时间 | 推断：可收进二级，但应保留计数名称来区分练习与阅读。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:52–53。 |
| 详情 | 「收录来源」、来源名／未记录来源、材料／单元／采集上下文 | 推断：查出处时必要，平时可展开查看。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:56。 |
| 详情 | 音标发布者、抽取日期、录音作者与链接、许可、转码、合成模型 | 推断：授权和归属重要，可集中放在发音来源二级。 | 代码证据 platform/mobile/src/components/Pronunciation.jsx:33–39。 |
| 编辑 | 「词性」「中文释义」「笔记」、待核验且保留历史快照说明、取消／保存按钮 | 推断：三个字段及操作必要，历史快照说明只需在编辑时显示。 | 代码证据 platform/mobile/src/components/WordDetail.jsx:37–42。 |
| 各弹层 | 右上角「关闭」与 Android 返回、遮罩返回、忙时状态 | 推断：必要，确保能退出，保存时保有状态提示。 | 代码证据 platform/mobile/src/components/Primitives.jsx:24–51，platform/mobile/src/components/WordWall.jsx:482，platform/mobile/src/components/WordDetail.jsx:36。 |
| 操作反馈 | 标记结果、撤销、后移页数／边界、补充整理结果、保存新轮、词条和分组保存失败 | 推断：成功信息可短且就地，失败内容对重试必要。 | 代码证据 platform/mobile/src/components/WordWall.jsx:159–181、278–322、366–396、461、487，platform/mobile/src/App.jsx:52–73。 |

### 词墙的裁剪、歧义与改版讨论项

| 项目 | 当前行为与建议 | 依据 |
| --- | --- | --- |
| 「补充整理」是否会自动补释义 | 只登记待整理词并能在详情或筛选找回，推断：命名宜显式为「标为待整理」。 | 代码证据 platform/mobile/src/components/WordWall.jsx:390–396、474，platform/mobile/src/components/WallSheets.jsx:23，platform/mobile/src/components/WordDetail.jsx:50，platform/mobile/src/data/repository.mjs:158–168。 |
| 「记录本轮卡片状态」与复习轮、学习计数的区别 | 翻面写本地草稿，确认后提交翻阅事件并开新 quickRound，不能把该状态读为一次练习完成，推断：提示里用「词墙标记轮」说明作用域。 | 代码证据 platform/mobile/src/components/WordWall.jsx:122–128、366–381，platform/mobile/src/data/repository.mjs:146–154、169–175，platform/mobile/src/data/card-reading.mjs:32–54。 |
| 命名建轮与背诵筛选词 | 前者保存选中词的命名轮且留在词墙，后者把符合条件的筛选词交给自由会话立刻设定并开始，推断：同属词汇练习，可在文案上区分「保存为复习轮」「立即背诵筛选词」。 | 代码证据 platform/mobile/src/components/WordWall.jsx:278–285、479，platform/mobile/src/App.jsx:63、88，platform/mobile/src/components/WordSession.jsx:63–67。 |
| Fresh 适用场景 | 适合一页多为已经熟悉的单词、想马上浏览后一页时，短尾页也仍作为批次移动，推断：按钮留在菜单和允许撤回有助于处理误触。 | 代码证据 platform/mobile/src/wall-navigation.mjs:28–51，platform/mobile/src/components/WordWall.jsx:159–192、471–472。 |
| 过滤结果的稳定与即时更新 | 记忆标记或释义修改后，卡面与统计会刷新，而结果列表只按筛选、种子、成员词形变化重算，推断：同一筛选下词可能暂留，标为待整理后范围结果也可能延迟到重新应用，属于验收讨论项。 | 代码证据 platform/mobile/src/components/WordWall.jsx:68–95，platform/mobile/src/wall-search.mjs:82–100。 |
| 重复入口 | 状态行是单档快筛、筛选弹层是多档，详情和撤销在手势外各有菜单备用，手势说明同时出现于菜单与设置，推断：保留任务操作替代路径，合并重复说明。 | 代码证据 platform/mobile/src/components/WordWall.jsx:425–434、470–481，platform/mobile/src/components/WallSheets.jsx:27、47–52，platform/mobile/src/components/Settings.jsx:81。 |
| 无入口旧控件 | SizeSheet 未被词库或设置挂载，原卡片高度控制已不在 UI，startQuickRound() 仍留 repository 而词墙结束轮用 finishWallRound()，推断：只从后续前端清理评估不再引用的 SizeSheet，不安排修改 repository。 | 代码证据 platform/mobile/src/components/WallSheets.jsx:33–45，platform/mobile/src/components/WordWall.jsx:10、366–381、468–486，platform/mobile/src/data/repository.mjs:146–154、174。 |
| 分组与普通墙设计边界 | 分组页有可变版式、显式分页并用老手势，普通墙可改方向、剪裁相邻页、支持长按标记，推断：分组视图不能直接套普通墙原型，保留详情可点标记和原布局是前端改版约束。 | 代码证据 platform/mobile/src/components/WordWall.jsx:401–407、436–459，platform/mobile/src/components/WordTile.jsx:185–219，platform/mobile/src/wall-track.css:1–31，platform/mobile/ui-redesign/prototype/CLAUDE-REVIEW.md:339–353。 |
| 词墙网络依赖 | 搜索、筛选、翻卡、持久化标记及会话构建均走本地，随包音频可本地播，Android 系统语音优先选离线声线，网络声线是同口音的兜底，查看外链来源需联网，未要求登录词墙。 | 代码证据 platform/mobile/src/components/WordWall.jsx:68–73、107–111、278–307，platform/mobile/src/pronunciation.mjs:3–15、24–55，platform/mobile/src/pronunciation-native.js:10–27，platform/mobile/android/app/src/main/java/cn/grestudy/vocabulary/PronunciationPlugin.java:69–86，platform/mobile/src/components/Pronunciation.jsx:33–39。 |

## 复习

### 页面地图

| 界面 | 从 App 初始词库到达 | 空、加载、出错状态 |
|---|---|---|
| 「复习」标签／复习记录 | 底栏「复习」1 次点按（代码证据 `platform/mobile/src/App.jsx:30`、`platform/mobile/src/App.jsx:80`，`platform/mobile/src/components/Primitives.jsx:54`）。 | 初次加载共用全局打开词库，全部为空、未完成为空、已完成为空有不同标题，列表没有独立加载或出错页（代码证据 `platform/mobile/src/App.jsx:66`、`platform/mobile/src/App.jsx:80`，`platform/mobile/src/components/Review.jsx:49`、`platform/mobile/src/components/Review.jsx:64`）。 |
| 「设置复习任务」表单 | 「复习」→「设置复习任务」2 次（代码证据 `platform/mobile/src/components/Review.jsx:60`、`platform/mobile/src/components/Review.jsx:69`）。 | 可练 0 词仍可保存任务，表单无效禁用提交，提交中显示「保存中…」，失败走弹层内共享提示（代码证据 `platform/mobile/src/components/Review.jsx:33`、`platform/mobile/src/components/Review.jsx:44`、`platform/mobile/src/components/Review.jsx:58`，`platform/mobile/src/App.jsx:52`、`platform/mobile/src/App.jsx:89`）。 |
| 「复习任务」管理列表 | 「复习」→「管理任务」2 次（代码证据 `platform/mobile/src/components/Review.jsx:61`、`platform/mobile/src/components/Review.jsx:77`）。 | 无任务时有「暂无复习任务」说明，已有任务倒序列出且包含已取消及已截止条目，无独立加载页（代码证据 `platform/mobile/src/components/Review.jsx:55`、`platform/mobile/src/components/Review.jsx:77`）。 |
| 轮次管理弹层 | 「复习」→轮次卡右上角「⋯」2 次，或 1 次点按＋1 次长按轮次卡（代码证据 `platform/mobile/src/components/Review.jsx:7`、`platform/mobile/src/components/Review.jsx:24`、`platform/mobile/src/components/Review.jsx:70`）。 | 需有轮次，所选轮次若有关联且未取消的任务则追加任务操作，保存期间相关按钮禁用（代码证据 `platform/mobile/src/components/Review.jsx:56`、`platform/mobile/src/components/Review.jsx:70`）。 |
| 「调整复习任务」表单 | 「复习」→「管理任务」→「调整」，或从轮次菜单点「调整所属任务」，两条均为 3 次（代码证据 `platform/mobile/src/components/Review.jsx:69`、`platform/mobile/src/components/Review.jsx:73`、`platform/mobile/src/components/Review.jsx:77`）。 | 复用创建表单与保存失败提示，修改缺省字段来源于原任务，既有轮次保留（代码证据 `platform/mobile/src/components/Review.jsx:28`、`platform/mobile/src/components/Review.jsx:43`、`platform/mobile/src/components/Review.jsx:69`，`platform/mobile/src/data/repository.mjs:115`）。 |
| 「修改轮次名称」表单 | 「复习」→轮次菜单→「修改轮次名称」3 次（代码证据 `platform/mobile/src/components/Review.jsx:72`、`platform/mobile/src/components/Review.jsx:76`）。 | 空名称禁用提交，保存失败保留表单和现名（代码证据 `platform/mobile/src/components/Review.jsx:58`、`platform/mobile/src/components/Review.jsx:76`，`platform/mobile/src/App.jsx:52`）。 |
| 删除当前轮／取消后续任务确认 | 「复习」→轮次菜单→「归档并删除本轮」或「取消后续任务」3 次，「管理任务」中「取消任务」也是 3 次，确认再 1 次（代码证据 `platform/mobile/src/components/Review.jsx:73`、`platform/mobile/src/components/Review.jsx:78`）。 | 确认期间显示「处理中…」并禁用取消且关闭不生效，失败由共享提示显示并保留确认弹层（代码证据 `platform/mobile/src/components/Primitives.jsx:50`，`platform/mobile/src/components/Review.jsx:58`、`platform/mobile/src/components/Review.jsx:78`，`platform/mobile/src/App.jsx:60`）。 |
| 折叠帮助「复习步骤与颜色」 | 「复习」→展开说明 2 次，入口在轮次表底部（代码证据 `platform/mobile/src/components/Review.jsx:66`）。 | 静态说明（代码证据 `platform/mobile/src/components/Review.jsx:67`）。 |
| 复习会话（全屏、隐藏底栏） | 「复习」→点未完成轮次卡 2 次，「词库操作」→「背诵筛选词」2 次到另一路的会话设置，填完点「开始复习」后进入会话（代码证据 `platform/mobile/src/components/Review.jsx:18`、`platform/mobile/src/components/Review.jsx:63`，`platform/mobile/src/components/WordWall.jsx:479`，`platform/mobile/src/App.jsx:63`、`platform/mobile/src/App.jsx:88`，`platform/mobile/src/components/WordSession.jsx:83`）。 | 已创建轮次直接依据已保存步骤运行，临时设置可显示「没有可练的单词」（正常词库入口无可练时已禁用），写入与刷新失败走不同就地恢复操作（代码证据 `platform/mobile/src/components/WordWall.jsx:479`，`platform/mobile/src/components/WordSession.jsx:17`、`platform/mobile/src/components/WordSession.jsx:56`、`platform/mobile/src/components/WordSession.jsx:84`、`platform/mobile/src/components/WordSession.jsx:95`）。 |
| 最后结算／完成结果 | 「复习」→点已完成卡 2 次，另可经未完成会话全部练完并成功结算进入，步数随词数和重练变化（代码证据 `platform/mobile/src/components/Review.jsx:18`、`platform/mobile/src/components/Review.jsx:21`，`platform/mobile/src/components/WordSession.jsx:74`、`platform/mobile/src/components/WordSession.jsx:84`、`platform/mobile/src/components/WordSession.jsx:92`）。 | 待结算状态给「保存本轮结果」，未通过或待保存时留在相应流程，完成列表逐词显示结果（代码证据 `platform/mobile/src/components/WordSession.jsx:20`、`platform/mobile/src/components/WordSession.jsx:84`、`platform/mobile/src/components/WordSession.jsx:92`、`platform/mobile/src/components/WordSession.jsx:95`，`platform/shared/word-session.mjs:46`）。 |
| 未保存退出确认 | 最短「词库操作」→「背诵筛选词」→开始→发生保存失败→返回（至少 4 次导航／提交点按，另需一次触发会话内保存失败或暂存输入的操作），或从运行中的会话输入未提交内容后点返回，系统返回同样会触发（代码证据 `platform/mobile/src/components/WordWall.jsx:479`，`platform/mobile/src/components/WordSession.jsx:32`、`platform/mobile/src/components/WordSession.jsx:83`、`platform/mobile/src/components/WordSession.jsx:96`）。 | 保存进行中先提示等待，失败或未提交文本才确认，已保存步骤保留（代码证据 `platform/mobile/src/components/WordSession.jsx:32`、`platform/mobile/src/components/WordSession.jsx:96`）。 |

### 「复习」及其任务管理功能

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议及理由 |
|---|---|---|---|---|---|---|---|
| 具名轮次与续接 | 「复习」→卡片，2 次。 | 点卡进入当前轮，通过历史事件找回已保存进度，已完成卡打开结果。 | 代码证据 `platform/mobile/src/components/Review.jsx:13`、`platform/mobile/src/components/Review.jsx:63`，`platform/mobile/src/App.jsx:64`、`platform/mobile/src/App.jsx:88`。 | 轮次以 `session_id` 对应固定词列表与阶段，进度由事件还原（代码证据 `platform/mobile/src/data/model.mjs:248`、`platform/mobile/src/data/model.mjs:280`）。 | 未改，现有独立复习样式（代码证据 `platform/mobile/src/components/Review.jsx:5`，候选 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1099`）。 | 推断：无可见续接入口且看不到已有成果。 | 保留，用名称作标题并给最明确的继续动作（推断）。 |
| 状态筛选与分页 | 「复习」→状态（2 次打开，3 次选项）或「上一页／下一页」2 次。 | 默认全部，可看未完成或已完成，切换回第一页，每页最多 4 轮。 | 代码证据 `platform/mobile/src/components/Review.jsx:50`、`platform/mobile/src/components/Review.jsx:62`、`platform/mobile/src/components/Review.jsx:65`。 | 前端纯展示状态，应用 `orderedReviewRounds` 排序（代码证据 `platform/mobile/src/data/review-tasks.mjs:108`）。 | 未改，候选将已完成收起且示例无分页（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1109`、`platform/mobile/ui-redesign/prototype/src/c/main.jsx:1127`）。 | 推断：记录多时会失去查找与已完成入口。 | 合并为当前列表与可展开的完成记录，保留各自按需分页（推断）。 |
| 紧急颜色与置顶排序 | 「复习」1 次即可看到。 | 已完成、逾期、今天、其他有不同文案和色阶，先置顶，再按紧急程度和最新记录排序。 | 代码证据 `platform/mobile/src/data/review-tasks.mjs:99`、`platform/mobile/src/data/review-tasks.mjs:108`，`platform/mobile/src/review-redesign.css:14`。 | 单词真实到期状态、轮次截止日及置顶元数据（代码证据 `platform/mobile/src/data/review-tasks.mjs:23`、`platform/mobile/src/data/review-tasks.mjs:99`）。 | 未改，C 有今日／逾期标签样式（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1118`）。 | 推断：难以识别先练哪轮。 | 保留优先顺序与到期文字，颜色作为辅助（推断）。 |
| 创建按日任务 | 「复习」→「设置复习任务」→提交，3 次另加填写。 | 保存日上限、截止与范围，最多为该任务生成今日一轮，今后在有效日期读取状态时再生成当日轮次。 | 代码证据 `platform/mobile/src/components/Review.jsx:28`、`platform/mobile/src/components/Review.jsx:69`，`platform/mobile/src/data/repository.mjs:82`、`platform/mobile/src/data/repository.mjs:95`、`platform/mobile/src/data/repository.mjs:107`。 | 默认都可练、每天 10 词，截止默认今日，用主题和关系筛选，先到期再按分配时间和字母顺序选词（代码证据 `platform/mobile/src/components/Review.jsx:29`，`platform/mobile/src/data/review-tasks.mjs:85`）。 | C 里没有真实表单，按钮提示沿用正式流程（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1140`）。 | 推断：失去按天自动生成和启动入口，只能单次建轮。 | 保留真实表单，收拢到简明次级入口，继续是首页主操作（推断）。 |
| 调整／取消后续任务 | 「复习」→「管理任务」→「调整」或「取消」，提交 4 次，轮次菜单有重复入口。 | 可调整未来筛选/词量/期限，取消停止后续生成，既有轮次和进度保留。 | 代码证据 `platform/mobile/src/components/Review.jsx:73`、`platform/mobile/src/components/Review.jsx:77`，`platform/mobile/src/data/repository.mjs:115`。 | 任务更新和取消事件，不改已保存轮次词表与任务来源（代码证据 `platform/mobile/src/data/review-tasks.mjs:17`、`platform/mobile/src/data/review-tasks.mjs:74`，`platform/mobile/src/data/repository.mjs:119`）。 | C 里没有任务管理（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1127`、`platform/mobile/ui-redesign/prototype/src/c/main.jsx:1140`）。 | 推断：任务建错后不能控制持续生成。 | 收进二级，以任务管理为主入口，轮次关联入口可合并为「查看所属任务」（推断）。 |
| 置顶、改名与归档删除当前轮 | 「复习」→轮次菜单→动作 3 次，改名或删除再保存／确认 1 次。 | 更新该轮名称或置顶，归档是逻辑删除，移出列表，保留已写入证据与任务的未来安排。 | 代码证据 `platform/mobile/src/components/Review.jsx:70`、`platform/mobile/src/components/Review.jsx:76`、`platform/mobile/src/components/Review.jsx:78`，`platform/mobile/src/data/repository.mjs:126`、`platform/mobile/src/data/repository.mjs:134`。 | 轮次元数据事件，允许修改名称和置顶，删除是 `deleted`，已归档的任务轮仍阻止同日重建（代码证据 `platform/mobile/src/data/repository.mjs:86`、`platform/mobile/src/data/repository.mjs:129`、`platform/mobile/src/data/repository.mjs:139`，`platform/mobile/src/data/review-tasks.mjs:110`）。 | C 里没有管理菜单或长按档案功能（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1115`、`platform/mobile/ui-redesign/prototype/src/c/main.jsx:1133`）。 | 推断：无法整理轮次列表，误建轮次无法移除。 | 保留轮次菜单和删除确认，把「删除本轮」与「停止后续任务」分别标清（推断）。 |
| 回词墙和机制帮助 | 「复习」→「从单词墙选词」或展开帮助，2 次。 | 前者切到词库，后者解释步骤、颜色和每日生成。 | 代码证据 `platform/mobile/src/components/Review.jsx:61`、`platform/mobile/src/components/Review.jsx:67`，`platform/mobile/src/App.jsx:80`。 | 切标签，不修改复习状态，帮助为静态文案（代码证据 `platform/mobile/src/App.jsx:80`，`platform/mobile/src/components/Review.jsx:67`）。 | C 里没有原入口（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1099`）。 | 推断：底栏仍可到词库，删帮助会弱化任务和轮次区别。 | 合并重复的词库导航，把规则放在对应表单和必要帮助里（推断）。 |

### 全屏复习会话功能

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议及理由 |
|---|---|---|---|---|---|---|---|
| 立即背诵会话设置 | 「词库操作」→「背诵筛选词」2 次，提交后第 3 次。 | 只取当前结果里可练的词，从头取指定数量，默认不超过 10 词，可选认义 1 或 2 遍，提交后写入独立会话。 | 代码证据 `platform/mobile/src/components/WordWall.jsx:479`，`platform/mobile/src/App.jsx:63`，`platform/mobile/src/components/WordSession.jsx:8`、`platform/mobile/src/components/WordSession.jsx:62`、`platform/mobile/src/components/WordSession.jsx:84`。 | `vocab_session` 冻结词、释义、词性和选项，旧式无轮次元数据的会话也在复习记录投影成日期命名轮次（代码证据 `platform/mobile/src/data/model.mjs:280`，`platform/mobile/src/data/review-tasks.mjs:70`）。 | C 里没有正式设置表单（代码证据 `platform/mobile/ui-redesign/prototype/CLAUDE-REVIEW.md:338`）。 | 推断：失去立即开练及认义遍数入口，但现有记录仍有投影。 | 保留在词墙二级，明确命名为「立即复习筛选词」（推断）。 |
| 英文认义选择或自检 | 进入轮次后自动到下一阶段，点选项 1 次，无足量互异选项时先看释义再自评，共 2 次。 | 认识选项时按快照核对，自检可记得／没记住，认义可按设置练一或两遍。 | 代码证据 `platform/mobile/src/components/WordSession.jsx:27`、`platform/mobile/src/components/WordSession.jsx:68`、`platform/mobile/src/components/WordSession.jsx:86`，`platform/shared/word-session.mjs:25`。 | `vocab_drill.response_mode` 是 `choice` 或 `self_check`，并保存可验证程度（代码证据 `platform/mobile/src/data/model.mjs:228`、`platform/mobile/src/data/model.mjs:292`）。 | 未改，正式界面仍支持两种，C 里没有正式选择题（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1182`）。 | 推断：所有回合将无法按原阶段与响应方式完成。 | 保留选择和自检，统一主按钮位置与进度层级（推断）。 |
| 补全拼写／中文默写 | 认义通过后自动进入，输入＋「核对答案」。 | 根据中文和缺字英文补全，或只看中文写完整英文。 | 代码证据 `platform/mobile/src/components/WordSession.jsx:86`、`platform/mobile/src/components/WordSession.jsx:89`，`platform/shared/word-session.mjs:2`、`platform/shared/word-session.mjs:37`。 | 补全可输缺失部分或全词，阶段顺序和判定由共享函数校验（代码证据 `platform/shared/word-session.mjs:4`、`platform/shared/word-session.mjs:37`，`platform/mobile/src/data/model.mjs:228`）。 | C 里没有补全或默写界面（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1182`）。 | 推断：删除会卡住现有会话并破坏完成条件。 | 保留，为软键盘、安全区和重试留位置（推断）。 |
| 反馈、揭示、补练与结算 | 提交、选「暂时想不起」或点反馈区「继续」／「保存本词，继续」。 | 保存后反馈正误，错误或揭示加入本阶段队尾，每词所有阶段通过后再写结算，最后给逐词结果。 | 代码证据 `platform/mobile/src/components/WordSession.jsx:43`、`platform/mobile/src/components/WordSession.jsx:74`、`platform/mobile/src/components/WordSession.jsx:84`、`platform/mobile/src/components/WordSession.jsx:90`，`platform/shared/word-session.mjs:46`。 | 错误/揭示是已记录练习但不是通过，轮次完成依据已存在的多阶段回忆事件（代码证据 `platform/shared/word-session.mjs:46`，`platform/mobile/src/data/model.mjs:293`）。 | 未改，C 有简化反馈与完成画面但不是正式状态机（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1174`、`platform/mobile/ui-redesign/prototype/src/c/main.jsx:1187`）。 | 推断：会丢补练、解释与恢复结算路径。 | 保留，把词级结算与题级反馈视觉分层（推断）。 |
| 保存失败、刷新失败及安全退出 | 错误时出现「重试保存」或「重新读取」，点返回或系统返回检查未保存回答。 | 写后更新本地反馈，保存失败保持同一操作可重试，刷新失败保留已保存状态，待保存时先等，未提交或失败退出前确认。 | 代码证据 `platform/mobile/src/components/WordSession.jsx:32`、`platform/mobile/src/components/WordSession.jsx:38`、`platform/mobile/src/components/WordSession.jsx:95`，`platform/mobile/src/App.jsx:52`，`platform/mobile/src/mobile.css:131`。 | 存储成功后才替换 repository 当前数据，相同事件 UUID 的同一操作可重试（代码证据 `platform/mobile/src/data/repository.mjs:56`、`platform/mobile/src/data/repository.mjs:157`，`platform/mobile/src/data/model.mjs:257`）。 | 先写后显及可重试已按 C 行为核验，操作布局未改（代码证据 `platform/mobile/src/components/WordSession.jsx:43`、`platform/mobile/src/components/WordSession.jsx:56`、`platform/mobile/src/components/WordSession.jsx:95`，`platform/mobile/ui-redesign/prototype/CLAUDE-REVIEW.md:51`）。 | 推断：会错误承诺已保存或让用户无从恢复。 | 保留就地恢复、已保存但刷新失败的明确反馈和退出确认（推断）。 |
| 保存、再练与完成音效 | 答案保存成功后自动触发。 | 连续正确逐级播放，错答重置连胜，轮次结束后播放完成音。 | 代码证据 `platform/mobile/src/components/WordSession.jsx:21`、`platform/mobile/src/components/WordSession.jsx:38`、`platform/mobile/src/components/WordSession.jsx:49`，`platform/mobile/src/App.jsx:49`。 | 使用全局音效开关与本次会话内存里的连胜计数（代码证据 `platform/mobile/src/components/WordSession.jsx:16`，`platform/mobile/src/App.jsx:49`）。 | 已按 C 接入音效（代码证据 `platform/mobile/src/components/WordSession.jsx:3`，`platform/mobile/ui-redesign/prototype/CLAUDE-REVIEW.md:222`）。 | 推断：无音频反馈，进度和学习契约可保持。 | 保留作为可关闭的辅助反馈（推断）。 |

### 复习与会话显示字段

| 界面 | 显示字段 | 是否必要 |
|---|---|---|
| 复习首页 | 「复习」（代码证据 `platform/mobile/src/components/Review.jsx:59`）。 | 必要，确定当前模块（推断）。 |
| 复习首页 | 「按自己的节奏」「从保存的步骤继续，让每一轮都有着落」（代码证据 `platform/mobile/src/components/Review.jsx:60`）。 | 口号和规则混写，可删口号并在续接 CTA 体现保存行为（推断）。 |
| 复习首页 | 「N 轮等待复习／准备好下一轮」（代码证据 `platform/mobile/src/components/Review.jsx:57`、`platform/mobile/src/components/Review.jsx:60`）。 | 有数量价值，如果写成「今天」，计数需与正式的时效定义对得上（推断）。 |
| 复习首页 | 「设置复习任务」「管理任务」与活跃任务数、「从单词墙选词」（代码证据 `platform/mobile/src/components/Review.jsx:60`、`platform/mobile/src/components/Review.jsx:61`）。 | 前两项操控排期必要，数字可选，词库直达重复底栏（推断）。 |
| 复习首页 | 「复习记录」「全部轮次／未完成／已完成」（代码证据 `platform/mobile/src/components/Review.jsx:62`）。 | 标题可与页头合并，完成与未完成区分必要（推断）。 |
| 轮次卡 | 轮次名称、已完成／未完成、置顶（仅置顶轮显示）（代码证据 `platform/mobile/src/components/Review.jsx:19`）。 | 名称必留，状态和置顶用行分区或安静的标记仍须可辨（推断）。 |
| 轮次卡 | 总词数／已完成词数，「点击开始／继续上次步骤／查看本轮结果」（代码证据 `platform/mobile/src/components/Review.jsx:21`）。 | 保留简明的已完成／总数，行动提示可并入按钮，重复点击说明可删（推断）。 |
| 轮次卡 | 「已到期 · 优先复习」「今天复习」「截止 日期」「待开始」「已完成」与对应颜色、右上管理图标（代码证据 `platform/mobile/src/components/Review.jsx:22`，`platform/mobile/src/data/review-tasks.mjs:99`）。 | 保留逾期或今天的识别和可点击管理，普通待开始与已完成可由分区体现（推断）。 |
| 复习记录 | 「还没有完成的轮次／暂无未完成轮次／为今天设置一轮复习」和「创建任务后，轮次会出现在这里。点击卡片开始。」（代码证据 `platform/mobile/src/components/Review.jsx:64`）。 | 需保留分状态可行动空页面，后一句已有任务或筛选无结果时应简化（推断）。 |
| 复习记录 | 「上一页／下一页」、当前页／总页与总轮数，「长按卡片管理轮次，也可点击卡片右上角」（代码证据 `platform/mobile/src/components/Review.jsx:65`）。 | 分页方向与当前位置必要，总轮数可藏，长按教学宜首次显示，常驻显得重复（推断）。 |
| 复习帮助 | 认义遍数、补全和默写、自动续接、通过才结算、颜色释义、排期规则与选词优先级（代码证据 `platform/mobile/src/components/Review.jsx:67`）。 | 行为说明可移到上下文，固定“两遍”应随一遍／两遍配置显示，颜色说明需与真实到期级别相符（推断）。 |
| 创建／调整 | 「设置复习任务／调整复习任务」「当前轮次名称／任务名称」、每天词数与截止日期（代码证据 `platform/mobile/src/components/Review.jsx:36`、`platform/mobile/src/components/Review.jsx:39`）。 | 名称、词数、截止必要，创建时“当前轮次名称”同样保存为任务名，建议明确会沿用到后续轮（推断）。 |
| 创建／调整 | 「筛选范围」三档（全部可练单词、现在到期、待首轮回忆）、「语义主题」「关系组」与各自「全部」（代码证据 `platform/mobile/src/components/Review.jsx:40`）。 | 都有明确筛选语义，可放进高级筛选以减轻表单（推断）。 |
| 创建／调整 | 「当前可练 N 词」与不足说明、按日生成／既有进度保留、提交态「保存中…／保存调整／创建今日轮次／保存任务，等待可练单词」（代码证据 `platform/mobile/src/components/Review.jsx:43`）。 | 可练数量、缺词分支与保存回执必要，关于错过日期的说明可只在创建时提示（推断）。 |
| 管理任务 | 「复习任务」「暂无复习任务」及如何创建说明、任务名、每天最多词数、截止日期、已取消／已截止／进行中、调整／取消任务（代码证据 `platform/mobile/src/components/Review.jsx:77`）。 | 保留计划状态和可操作动作，已结束任务可收起（推断）。 |
| 轮次管理 | 轮次名、置顶轮次／取消置顶、修改轮次名称、调整所属任务、取消后续任务、归档并删除本轮（代码证据 `platform/mobile/src/components/Review.jsx:70`）。 | 标题及动作必要，「归档并删除」可简化为「删除本轮」，确认仍解释证据保留（推断）。 |
| 轮次改名 | 「修改轮次名称」「轮次名称」、当前输入值、「保存名称」（代码证据 `platform/mobile/src/components/Review.jsx:76`）。 | 保留字段与保存按钮，可减少重复标题（推断）。 |
| 确认与提示 | 删除／取消的标题、影响说明、「取消／删除本轮／取消任务／处理中…」，关闭图标以及成功／失败提示（代码证据 `platform/mobile/src/components/Review.jsx:69`、`platform/mobile/src/components/Review.jsx:78`，`platform/mobile/src/components/Primitives.jsx:43`、`platform/mobile/src/components/Primitives.jsx:50`，`platform/mobile/src/App.jsx:70`）。 | 风险后果和动作需保留，取消后续任务的按钮和普通取消的文案宜区分（推断）。 |
| 临时会话设置 | 「开始一轮」「先认得，再想得出」「英文认义 → 补全拼写 → 中文默写」「本轮词数（最多 N）」「英文认义 2 遍／1 遍」「开始复习」「没有可练的单词／请先补充释义」（代码证据 `platform/mobile/src/components/WordSession.jsx:83`、`platform/mobile/src/components/WordSession.jsx:84`）。 | 轮次参数、阶段预期和空状态必要，口号可以删（推断）。 |
| 进行中的会话 | 返回、轮次名或「记忆与背诵」、阶段文案（认词两遍／补全拼写／中文 → 英文／保存本轮）、单词轮才有 N/M 步和进度条（代码证据 `platform/mobile/src/components/WordSession.jsx:27`、`platform/mobile/src/components/WordSession.jsx:83`、`platform/mobile/src/components/WordSession.jsx:85`，`platform/shared/word-session.mjs:3`）。 | 保留返回、轮名和阶段，单词阶段数与整轮词数分别标清（推断）。 |
| 提示与答题 | 认义英文原词，选项序号与中文义，自检按钮、核对后的词性与义项、「没记住／记得」及缺选项说明，补全的词性、释义、缺字英文与输入提示，默写词性、释义、输入提示，「核对答案」「暂时想不起」（代码证据 `platform/mobile/src/components/WordSession.jsx:86`、`platform/mobile/src/components/WordSession.jsx:91`）。 | 题面、输入提示和分支动作必要，选项序号可视为辅助定位，自检说明可缩短（推断）。 |
| 作答反馈 | 「答对了／记住这个词，稍后再试」、原词与词性、释义和错误时「你的回答」，「保存本词，继续／继续」（代码证据 `platform/mobile/src/components/WordSession.jsx:90`）。 | 反馈、正确义项、误答对照和后续动作有实用价值，可压缩占位（推断）。 |
| 待结算与统计 | 「本轮练习已完成」「保存结果，安排下次复习」「保存本轮结果」，本轮词数、已完成词数、已保存作答次数（代码证据 `platform/mobile/src/components/WordSession.jsx:92`、`platform/mobile/src/components/WordSession.jsx:93`）。 | 待结算须与已完成区分，计数优先显示已结算／总词数，作答次数可入详情（推断）。 |
| 完成页 | 「本轮已完成」、词数、作答与补练次数，逐词「本轮顺利／10 分钟后再练／明天再练」、「返回复习」（代码证据 `platform/mobile/src/components/WordSession.jsx:84`）。 | 保留完成确认与返回，把补练统计或逐词状态放可展开结果（推断）。 |
| 错误与离开 | 保存失败／已保存但刷新失败／刷新仍失败的消息，「重试保存／重新读取」，「正在保存，请稍候」，「还有未保存的回答」及原因、取消和「放弃并返回」（代码证据 `platform/mobile/src/components/WordSession.jsx:32`、`platform/mobile/src/components/WordSession.jsx:57`、`platform/mobile/src/components/WordSession.jsx:95`、`platform/mobile/src/components/WordSession.jsx:96`，`platform/mobile/src/components/Primitives.jsx:50`）。 | 必须明确内容是否写入以及能够恢复的方式（推断）。 |

### 复习相关的默认值

| 项目 | 默认值 | 谁会改 | 建议 |
|---|---|---|---|
| 任务参数（局部表单） | 名称和截止日期取词库时区的今天，每天 10 词，范围全部可练且主题及关系不限，新任务认义 2 遍且表单未提供次数（代码证据 `platform/mobile/src/components/Review.jsx:29`、`platform/mobile/src/components/Review.jsx:37`）。 | 要按日持续练、定向背主题或控制每日负荷的人（推断）。 | 保留可见的名称、每日词数、截止，筛选可收进高级项（推断）。 |
| 临时会话参数 | 默认词数为可练数量与 10 的较小值，默认认义 2 遍，允许设 1 遍（代码证据 `platform/mobile/src/components/WordSession.jsx:8`、`platform/mobile/src/components/WordSession.jsx:84`）。 | 想快速补认义或重复巩固的人（推断）。 | 保留可调，帮助反映实际遍数（推断）。 |
| 轮次列表状态 | 「全部轮次」与第一页，筛选状态在复习组件中保留，改筛选会回到第一页，重新启动回到默认（代码证据 `platform/mobile/src/components/Review.jsx:50`、`platform/mobile/src/components/Review.jsx:62`，`platform/mobile/src/App.jsx:80`）。 | 想清未完成或回顾以前结果的人（推断）。 | 首屏优先显示当前待办，保留完成记录的访问（推断）。 |

### 复习的重复入口、半成品与候选 C 讨论项

| 项目 | 观察与建议 |
|---|---|
| 「轮次」是什么 | 它是一组创建时固定的有义词条快照及有序练习，已保存的练习与最终回忆证据从 `session_id` 恢复，用户只需知道“点一组词开始或继续，做完各阶段才算完成”（代码证据 `platform/mobile/src/data/model.mjs:248`、`platform/mobile/src/data/model.mjs:280`，`platform/shared/word-session.mjs:46`，后半句为推断）。 |
| 任务、复习轮与词墙批次 | 任务是一条带日上限、筛选和截止的生成规则，复习轮是固定会话，词墙「记录本轮卡片状态」结束的是 `quickRound` 并保存翻阅批次（代码证据 `platform/mobile/src/data/repository.mjs:76`、`platform/mobile/src/data/repository.mjs:82`、`platform/mobile/src/data/repository.mjs:146`，`platform/mobile/src/components/WordWall.jsx:366`）。 |
| 复习、练习与账号 | 词汇复习所示流程通过本地词库 repository 和共享判定函数工作（代码证据 `platform/mobile/src/App.jsx:80`、`platform/mobile/src/App.jsx:88`，`platform/mobile/src/components/WordSession.jsx:38`，`platform/mobile/src/data/repository.mjs:35`、`platform/mobile/src/data/repository.mjs:57`）。 |
| 重复的任务入口 | 所属任务的调整／取消与「管理任务」同功能，卡片长按与「⋯」也同功能，后者有可发现的按钮和键盘入口（代码证据 `platform/mobile/src/components/Review.jsx:14`、`platform/mobile/src/components/Review.jsx:24`、`platform/mobile/src/components/Review.jsx:73`、`platform/mobile/src/components/Review.jsx:77`）。 |
| 尚未从页面触发的独立新词墙批次 | repository 仍有 `startQuickRound()`，现行词墙用 `finishWallRound` 保存并推进批次且无「开始新一轮」按钮（代码证据 `platform/mobile/src/data/repository.mjs:146`、`platform/mobile/src/data/repository.mjs:174`，`platform/mobile/src/components/WordWall.jsx:366`、`platform/mobile/src/components/WordWall.jsx:470`）。 |
| 筛选词背诵与选中词复习轮 | 前者立即进入数量与认义遍数设置并按既定顺序截取，后者以所选词建立具名待办，保留在词墙，仍由复习记录打开（代码证据 `platform/mobile/src/components/WordWall.jsx:278`、`platform/mobile/src/components/WordWall.jsx:479`，`platform/mobile/src/components/WordSession.jsx:62`，`platform/mobile/src/App.jsx:63`、`platform/mobile/src/App.jsx:64`）。 |
| 读状态时生成，不只是冷启动 | 文案写“打开 App 时”，实际 `getState()` 可在启动、刷新、回到前台和前台定时读取时补生成当天的一轮，取消、截止、同日已有和暂无可练词各自会阻止生成（代码证据 `platform/mobile/src/components/Review.jsx:43`，`platform/mobile/src/useRepository.js:22`、`platform/mobile/src/useRepository.js:39`、`platform/mobile/src/useRepository.js:48`，`platform/mobile/src/data/repository.mjs:82`、`platform/mobile/src/data/repository.mjs:95`）。 |
| 讨论项 · 「今天还有」及主操作 | 原型按演示数据取首个活动轮及今日状态，正式顺序还受置顶、逾期、截止和已完成影响，讨论 CTA 能否优先在正式投影的今日／逾期中找下一轮、普通待办怎么表达、四轮分页与已完成详情放哪里（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1099`、`platform/mobile/ui-redesign/prototype/src/c/main.jsx:1147`，`platform/mobile/src/components/Review.jsx:52`，`platform/mobile/src/data/review-tasks.mjs:99`、`platform/mobile/src/data/review-tasks.mjs:108`，方案为推断）。 |
| 讨论项 · C 原型只有轻触看义／「记得／再想想」 | 正式需要多选项认义、自检降级、正误回执、补全和默写、结算、完成明细及未保存离开，用 C 的排版与固定主操作覆盖这些分支，保持阶段和校验（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1158`、`platform/mobile/ui-redesign/prototype/src/c/main.jsx:1182`，`platform/mobile/src/components/WordSession.jsx:83`、`platform/mobile/src/components/WordSession.jsx:95`，`platform/mobile/src/data/model.mjs:228`、`platform/mobile/src/data/model.mjs:293`，方案为推断）。 |
| 讨论项 · 双层进度和提交顺序 | 认义、补全、默写的合法作答保存后增加步骤进度，另一次 `vocab_recall` 写入才增加已完成词数，C 的单计数条应取实际口径，保留落盘确认、基于已存事件的断点续接以及刷新失败的状态（代码证据 `platform/mobile/src/components/WordSession.jsx:38`、`platform/mobile/src/components/WordSession.jsx:74`，`platform/shared/word-session.mjs:46`，方案为推断）。 |
| 讨论项 · 正式任务管理缺少原型部件 | C 的任务按钮是占位，已完成列表只展示，没覆盖正式任务表单、置顶、改名、删除和取消弹层，接入需给这些正式分支设计次级界面并校验各入口的影响范围（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1127`、`platform/mobile/ui-redesign/prototype/src/c/main.jsx:1140`，`platform/mobile/src/components/Review.jsx:69`、`platform/mobile/src/components/Review.jsx:78`，方案为推断）。 |
| 讨论项 · 提示位置和键盘 | 全局提示占布局空间，弹层提示进消息槽，错误不会自动消失，小屏、软键盘和固定底部 CTA 同时出现时需再测失败／重试／处置按钮都可达（代码证据 `platform/mobile/src/App.jsx:42`、`platform/mobile/src/App.jsx:70`、`platform/mobile/src/App.jsx:89`，`platform/mobile/src/components/Primitives.jsx:43`，`platform/mobile/src/mobile.css:131`，真机验证为推断）。 |
| 验收观察项 | 实测一个和多个词、认义一遍与两遍、自检与错误补练、写入失败再重试、写成但刷新失败、退出并恢复、已完成后查看、软键盘与提示共存、日界后生成、取消与删除各自效果（推断，机制见代码证据 `platform/mobile/src/components/WordSession.jsx:32`、`platform/mobile/src/components/WordSession.jsx:74`、`platform/mobile/src/components/WordSession.jsx:95`，`platform/mobile/src/components/Review.jsx:78`，`platform/mobile/src/data/repository.mjs:82`）。 |

## 刷题模块

### 页面地图与状态

| 页面／状态 | 从打开 App 到达 | 空、加载、出错与返回 |
| --- | --- | --- |
| 刷题首页／题型选择 | 底栏「刷题」1 点，如恢复题位，先点题页左上返回，合计 2 点（代码证据 `platform/mobile/src/App.jsx:30、81–90`、`platform/mobile/src/components/Practice.jsx:106–112、319–331`）。 | 首开模块显示「正在打开刷题…」，目录读取时主按钮显示「读取题库…」且禁用，0 题也禁用，整个目录出错可「重试」，组件崩溃显示「刷题页面暂时无法打开／重新打开」（代码证据 `platform/mobile/src/App.jsx:15–24、81–85`、`platform/mobile/src/components/Practice.jsx:325–335`）。 |
| 题目导航弹层／题号跳转表单 | 从首页点右上列表或「按单元选题」共 2 点，从题页打开多 1 点，已恢复题位时共 2 点（代码证据 `platform/mobile/src/components/Practice.jsx:319–331、387`）。 | 无匹配单元、无符合条件题目、题号不存在分别提示，弹层可点关闭、点空白或系统返回（代码证据 `platform/mobile/src/components/Practice.jsx:52–77`、`platform/mobile/src/components/Primitives.jsx:24–48`）。 |
| SE／TC／Reading／Quant 的共用题页 | 点刷题再点「开始练习」共 2 点，先切题型则 3 点，目录选第一个可见题共 3 点，换题型、筛选等按实际再加，有效题位恢复时共 1 点（代码证据 `platform/mobile/src/components/Practice.jsx:106–112、315–331、387`）。 | 题详情显示「正在读取原题…」，详情错误、目录／偏好保存错误可重试，顶部返回回到题型页，同内容或只读题末题也提供返回（代码证据 `platform/mobile/src/components/Practice.jsx:123–151、167–176、319–323、334–338、382–388`）。 |
| 题内选词确认条 | 任一可选文字题页后长按选中一个词进入，可选先点「选词」，确认加入再 1 点（代码证据 `platform/mobile/src/components/Practice.jsx:186–213、338–349、358–360`）。 | 没有合法文本选择时不创建确认条，保存中禁用操作，词已存在、成功、写入失败均有提示（代码证据 `platform/mobile/src/components/Practice.jsx:186–213、338–339`、`platform/mobile/src/practice/interaction.mjs:16–28`）。 |
| PDF 原题图片放大弹层 | 有图的题页内点图片再 1 点，常规共 3–4 点（代码证据 `platform/mobile/src/components/Practice.jsx:21–28、314、346、360、388`）。 | 行内图片读取失败提示重新打开，放大图弹层只有图片、标题和关闭，没有独立的加载或失败文案（代码证据 `platform/mobile/src/components/Practice.jsx:21–28、388`）。 |
| 已提交记录／同内容已做 | 已做题页内嵌，从目录进入最少 3 点，已保存该题位则 1 点，新题从合格作答点「保存答案」后在原页展示（代码证据 `platform/mobile/src/components/Practice.jsx:106–112、284–302、370–378`）。 | 旧记录可无逐题答案，无参考答案时仅提示已保留作答，重做失败用全局错误提示（代码证据 `platform/mobile/src/components/Practice.jsx:273–282、370–378`）。 |
| AI 解析区／解析结果 | 有实际作答事件 ID 的题页下方内嵌，读已存解析无需加点，运行再点 1 次，从该区可再 1 点去设置连接账号（代码证据 `platform/mobile/src/components/Practice.jsx:379`、`platform/mobile/src/components/MobileAiReview.jsx:20–55`、`platform/mobile/src/App.jsx:83`）。 | 无作答 ID 整区不显示，未连接、网页不支持、进行中、停止、解析错误、额度及需进一步核对各有分支，开始时没有单独的账号状态加载提示（代码证据 `platform/mobile/src/components/MobileAiReview.jsx:11–18、24–53`、`platform/mobile/src/ai/client.mjs:3–7`）。 |

### 刷题首页功能

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议及理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 进刷题与恢复题位 | 底栏「刷题」1 点，题页返回再 1 点。 | 首次按需加载模块，恢复有效题型和题号。 | 代码证据 `platform/mobile/src/App.jsx:15–23、81–85`、`platform/mobile/src/components/Practice.jsx:97–121、325–336`。 | 代码证据 `platform/mobile/src/practice/repository.mjs:63、129–135` 的本机偏好和有效题目键。 | 未改（代码证据 `platform/mobile/src/components/Practice.jsx:325–336`），C 原型固定在例句练习（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1215`）。 | 推断：撤掉恢复会多一次找题，撤掉入口会使全部正式练习不可达。 | 推断：保留续接，让用户能一眼返回题型。 |
| 选择 SE／TC／RC／Quant | 首页后点题型卡 1 次，合计 2 点。 | 更新活动题型、库存和此类练习说明。 | 代码证据 `platform/mobile/src/components/Practice.jsx:12–17、325–332`。 | 代码证据 `platform/mobile/src/practice/model.mjs:3、223–233` 的四类目录。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1215`）。 | 推断：删题型选择会让不同训练目标混在一起。 | 推断：保留，缩小卡片和重复题型标题。 |
| 开始练习／已完成后查看 | 首页点主按钮共 2 点，换题型为 3 点。 | 优先进入本类草稿，其次从最近提交后找未做题并在必要时从头找，都完成时打开导航。 | 代码证据 `platform/mobile/src/components/Practice.jsx:315–331`、`platform/mobile/src/practice/model.mjs:214–233`。 | 代码证据 `platform/mobile/src/practice/model.mjs:225–233` 的推荐终点与同内容去重。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：删推荐需要用户自行回忆草稿或下一道待做题。 | 推断：保留，尚有草稿可把主按钮写成「继续作答」。 |
| 打开题目导航 | 首页点右上列表或「按单元选题」共 2 点。 | 两处按钮打开同一个筛选和选题弹层。 | 代码证据 `platform/mobile/src/components/Practice.jsx:325–331、387`。 | 代码证据 `platform/mobile/src/components/Practice.jsx:32–43` 的本机目录投影。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：同时删除两个入口会失去直接找题，删一个只增加找剩余入口的成本。 | 推断：合并为一个清楚的首页入口，保留题页直达。 |

### 题目导航功能

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议及理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 切题型、按单元搜索和切换 | 导航共 2 点起，修改相应控件。 | 在指定题型下按资料名和单元名查找，再选择章节或文章。 | 代码证据 `platform/mobile/src/components/Practice.jsx:32–56`、`platform/mobile/src/practice/model.mjs:7–18`。 | 代码证据 `platform/mobile/src/practice/model.mjs:7–18` 的资料与单元联合定位。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：删检索会拉长定位原书章节的操作。 | 推断：保留在二级导航，与首页开始练习分工。 |
| 原书题号跳转 | 导航内填题号后点「跳转」1 次。 | 在当前单元按数字匹配原书题号，和状态筛选独立。 | 代码证据 `platform/mobile/src/components/Practice.jsx:41–43、57–65`。 | 代码证据 `platform/mobile/src/practice/model.mjs:7–8` 的单元和题号契约。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：只靠网格找编号会增加大量翻页。 | 推断：保留在二级导航，明确跳转范围为当前单元。 |
| 状态筛选与选题网格 | 导航内改「显示」或点题号，直接选题共 3 点起。 | 按全部、已提交、尚未做过、草稿筛选，每页最多 60 题并高亮当前题。 | 代码证据 `platform/mobile/src/components/Practice.jsx:18–19、41–44、66–77`。 | 代码证据 `platform/mobile/src/practice/model.mjs:223–227` 的草稿、已提交与同内容状态。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：删筛选会弱化找草稿和找历史，删网格会丢失相邻题概况。 | 推断：保留，讨论用更短的状态词和可读图例减密度。 |

### 共用作答页功能

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议及理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 返回、题目导航、相邻题 | 题页 1–3 点起，点顶部返回／导航或底部按钮再 1 点。 | 保持目录顺序，依据同题型当前位置取上一／下一题，题切换成功后播放提示音。 | 代码证据 `platform/mobile/src/components/Practice.jsx:123–141、154–175、319–323、382–388`、`platform/mobile/src/practice/interaction.mjs:3–7`。 | 代码证据 `platform/mobile/src/practice/model.mjs:225–233` 的目录顺序与独立推荐。 | 切题音已按 C 改，按钮和正式页视觉未改（代码证据 `platform/mobile/src/components/Practice.jsx:131–134、175、382–385`、`platform/mobile/ui-redesign/prototype/CLAUDE-REVIEW.md:84、224`）。 | 推断：删按钮会破坏 Quant 和键盘、无障碍的明确切题路径。 | 推断：保留，压缩固定栏但保留可点区域。 |
| SE／TC／RC 左右滑切题 | 题页内容区单次横滑，无额外点按。 | 左滑到下一题，右滑到上一题，竖向手势、长按选词、表单控件与 Quant 回避。 | 代码证据 `platform/mobile/src/components/Practice.jsx:215–243、338–340`、`platform/mobile/src/practice/interaction.mjs:9–13`。 | 代码证据 `platform/mobile/src/practice/interaction.mjs:9–13` 的触控／笔、64px、450ms 及方向过滤。 | 未改（代码证据 `platform/mobile/src/components/Practice.jsx:215–243`），C 示例只做按钮切题（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1225–1228`）。 | 推断：删手势会减少频繁浏览时的单手切题入口。 | 推断：保留，在实际滚动、长按及系统返回场景复测。 |
| 原题正文、选项与草稿 | 题页直接阅读，每项点按或填写即写草稿。 | 依题型接受单选、复选、填空分组、句子或文本，并在写入出错时保留内存答案以供重试。 | 代码证据 `platform/mobile/src/components/Practice.jsx:249–272、304–313、358–367`。 | 代码证据 `platform/mobile/src/practice/model.mjs:28–61`、`platform/mobile/src/practice/repository.mjs:90–98` 的答案与草稿会话。 | 未改（代码证据 `platform/mobile/src/components/Practice.jsx:249–272、304–313`），C 只有三选一示例（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1210–1224`）。 | 推断：删草稿将丢失选一半退出后的进度，合并答案控件可能损坏题型规则。 | 推断：保留，视觉可统一，控件语义按题型保留。 |
| 保存答案、结果与重做 | 合格答案后点「保存答案」再 1 点，已提交题点「重新作答」再 1 点。 | 先保存草稿再落盘作答，成功后显示作答历史，重做新建草稿会话。 | 代码证据 `platform/mobile/src/components/Practice.jsx:273–302、370–385`。 | 代码证据 `platform/mobile/src/practice/repository.mjs:100–127` 的明确提交、幂等和冻结题目快照。 | C 里没有正式提交及重做（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1210–1229`）。 | 推断：把选择直接等同提交会产生误提交，把重做等同清空会损坏历史解释。 | 推断：保留「保存答案」和重做，已交历史可收入题内二级。 |
| 去重状态与旧记录 | 进入同内容／已做题即显示，重做需再 1 点。 | 区分同内容已做、当前题已提交、只有旧完成引用和新草稿。 | 代码证据 `platform/mobile/src/components/Practice.jsx:158–161、370–378`、`platform/mobile/src/practice/model.mjs:217–233`。 | 代码证据 `platform/mobile/src/practice/repository.mjs:53–59、64–75` 的锁定和历史投影。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：删提示会让只读题像无法操作的故障。 | 推断：保留最短状态与重新作答入口，减少重复标签。 |
| 题内收词 | 题页长按英文选词，可任选词模式，确认再 1 点。 | 从同一可选文本块中取一个单词及局部上下文，带题目来源写入词库或识别已有词。 | 代码证据 `platform/mobile/src/components/Practice.jsx:186–213、338–339`、`platform/mobile/src/practice/interaction.mjs:16–28`。 | 代码证据 `platform/mobile/src/components/Practice.jsx:202–209` 的词库 `vocab_capture` 与刷新。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：删会中断刷题遇词进词墙的闭环。 | 推断：保留原生选择和确认，手势说明可改为首次出现。 |

### 题型专有工作区、选词与原图弹层

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议及理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SE 选二 | SE 题页，选两个选项。 | 显示已选数，选满两项才可提交并允许点选撤回。 | 代码证据 `platform/mobile/src/components/Practice.jsx:304–312、358–359`、`platform/mobile/src/practice/model.mjs:37–55`。 | 代码证据 `platform/mobile/src/practice/model.mjs:39–54` 的 pair。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1213–1222`）。 | 推断：用三选一原型代入会直接破坏 SE 的两项答案。 | 推断：保留选二数量与选中状态。 |
| TC 多空切换 | TC 多空题页，点空位或「下一空」各 1 点。 | 每空只显示该组选项，空位摘要保留每组结果。 | 代码证据 `platform/mobile/src/components/Practice.jsx:162–163、361–364`、`platform/mobile/src/practice/model.mjs:41、56–59`。 | 代码证据 `platform/mobile/src/practice/model.mjs:37–42、56–59` 的组内互斥与全空完成。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1213–1222`）。 | 推断：删空位上下文会让用户分不清选项属于哪一空。 | 推断：保留，把「下一空」与空位选项卡视为同一个导航控件族。 |
| RC 原文与题目双区 | RC 题页自动显示，两区分别滚动。 | 显示文本或原图并按文章记当前会话的原文滚动位，题目改变时题区回顶。 | 代码证据 `platform/mobile/src/components/Practice.jsx:164–185、340–358`、`platform/mobile/src/practice/practice.css:33–42`。 | 代码证据 `platform/mobile/src/components/Practice.jsx:92、164–166` 的单元键与滚动位内存映射。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1211–1230`）。 | 推断：删原文滚动记忆会增加跨题反复定位的成本。 | 推断：保留，避免以卡片放大的单区布局代替双阅读区。 |
| RC 调高度与字号 | 双区分隔条拖动、双击或键盘调整，A−／A＋各 1 点。 | 按视口限制高度范围，局部字号 15–22px 并随偏好保存，PDF 在阅读区也按字号比缩放。 | 代码证据 `platform/mobile/src/components/Practice.jsx:90、108–112、144–151、245–247、340–357`、`platform/mobile/src/practice/practice.css:39、86`。 | 代码证据 `platform/mobile/src/practice/repository.mjs:129–135` 的阅读偏好。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1211–1230`）。 | 推断：删会失去小屏上同时看原文、题干及选项的空间调节。 | 推断：保留分隔条，字号收入阅读区工具菜单仍可快速打开。 |
| RC 点选原文句子 | 可核实的选句题页点上方句子 1 次，图片型只读。 | 选择原文句子并在题区回显，没有可靠选句文本时禁提交、仍能浏览相邻题。 | 代码证据 `platform/mobile/src/components/Practice.jsx:159–163、345–349、361、382–384`。 | 代码证据 `platform/mobile/src/practice/model.mjs:28–43` 的原生非图片选句校验。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1211–1230`）。 | 推断：删只读分支会误导用户可提交无法核验的原句。 | 推断：保留，简化只读反馈并与长按选词明确区分。 |
| Quant 原图与各答题模式 | 数学题页直接读图／文本，按题目点选或输入。 | 支持 Quantity Comparison、单／多选、数字或分数输入和忠实人工作答录入。 | 代码证据 `platform/mobile/src/components/Practice.jsx:304–312、358–366`、`platform/mobile/src/practice/model.mjs:28–43`。 | 代码证据 `platform/mobile/src/practice/model.mjs:30–43` 的 `mode` 与 `answerInput` 区分。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1211–1230`）。 | 推断：删长期可输入备援会使提取不全的原题无法作答。 | 推断：保留，改版不得连同简化视觉一起改变录入资格。 |
| 放大原书图或原文图 | 有图题页内点图再 1 点。 | 显示带页码的原图，存在定位数据时在行内提示题目所在高度。 | 代码证据 `platform/mobile/src/components/Practice.jsx:21–28、314、346、360、388`、`platform/mobile/src/practice/practice.css:55–57`。 | 代码证据 `platform/mobile/src/components/Practice.jsx:21–28` 的原页及焦点元数据。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1211–1230`）。 | 推断：删原图放大影响阅读数学版式和图像型文章。 | 推断：保留，讨论放大图的错误回收和系统手势冲突。 |

### AI 解析区功能

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议及理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 连接状态与连接跳转 | 有作答事件 ID 的题页往下滚，点「连接 ChatGPT」加 1 点。 | 显示当前连接是否符合解析条件，未就绪可转设置，网页端禁用。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:14–18、44–49`、`platform/mobile/src/App.jsx:81–84`、`platform/mobile/src/ai/client.mjs:3–7`。 | 代码证据 `platform/mobile/src/ai/client.mjs:3–7` 的原生安卓桥与连接资格。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：删除状态会使失败原因不透明。 | 推断：保留失败和首次引导，正常时弱化套餐标签。 |
| 解析／重新解析、停止、额度 | 符合资格且已保存作答时再点 1 次，运行中可停止，额度错可管理。 | 发出题目和作答的结构化请求，支持终止，解析成功后再保存并展示。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:24–49`、`platform/mobile/src/ai/review.mjs:24–61`。 | 代码证据 `platform/mobile/src/ai/client.mjs:14–25`、`platform/mobile/src/practice/repository.mjs:77–87` 的模型、请求与校验持久化。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230`）。 | 推断：删停止会令长请求无法主动退出，删解析会失去完整复盘。 | 推断：保留一个主入口和条件操作，把额度入口留在真实报错处。 |
| 已存解析展示 | 打开具有相同作答 ID 的题页后滚动可见，0 次额外点按。 | 读取该作答的最近一版讲解，保留暂定和需核对状态。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:20–23、50–54`。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:6–8、20–23`、`platform/mobile/src/practice/repository.mjs:64–86` 的作答关联与题快照。 | C 里没有（代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1223–1229`）。 | 推断：只留例句翻译会丢完整题意、选项排除和推理证据。 | 推断：保留完整内容，可在首次查看时展开并允许主动收起。 |

### 刷题页面显示字段

| 页面／字段 | 必要性及建议 | 依据 |
| --- | --- | --- |
| 首页「刷题」标题 | 推断：必要，进入后明确任务类别。 | 代码证据 `platform/mobile/src/components/Practice.jsx:325–326`。 |
| 首页「选择题型」标题 | 推断：可省，四个可选项已建立上下文。 | 代码证据 `platform/mobile/src/components/Practice.jsx:327–328`。 |
| 首页四个中文题型名、英文全称 | 推断：中文主标签必要，英文可保留为低权重以便和原书对照。 | 代码证据 `platform/mobile/src/components/Practice.jsx:12–17、327–328`。 |
| 首页题型图标、选中态 | 推断：选中态必要，图标可省以留出原题空间。 | 代码证据 `platform/mobile/src/components/Practice.jsx:327–328`、`platform/mobile/src/practice/practice.css:7–8`。 |
| 首页下方重复题型名 | 推断：可省，留一个明确的当前类型即可。 | 代码证据 `platform/mobile/src/components/Practice.jsx:328–329`。 |
| 首页总题数 | 推断：次要，可收入题目导航，当前内容是题库规模而非做题进度。 | 代码证据 `platform/mobile/src/components/Practice.jsx:154–155、329`。 |
| 首页四句题型说明 | 推断：选两个等规则可留给首次学习，重复已有布局的阅读和数学说明可弱化。 | 代码证据 `platform/mobile/src/components/Practice.jsx:12–17、329`。 |
| 首页「开始练习」／「已完成 · 按单元查看」／「读取题库…」 | 推断：必要，表示当前可执行的主动作及读取状态。 | 代码证据 `platform/mobile/src/components/Practice.jsx:315–318、330`。 |
| 首页「按单元选题」与右上题目导航图标 | 推断：至少保留一个有清晰文字的入口。 | 代码证据 `platform/mobile/src/components/Practice.jsx:325–331`。 |
| 首页目录错误原文与「重试」，模块「正在打开刷题…」 | 推断：必要，区分可等待与需要重试。 | 代码证据 `platform/mobile/src/App.jsx:81–85`、`platform/mobile/src/components/Practice.jsx:333–335`。 |
| 首页组件崩溃标题、错误与「重新打开」 | 推断：必要，错误详情可次级呈现。 | 代码证据 `platform/mobile/src/App.jsx:16–24`。 |
| 导航「题目导航」与「关闭」 | 推断：必要，建立弹层角色和离开路径。 | 代码证据 `platform/mobile/src/components/Practice.jsx:49`、`platform/mobile/src/components/Primitives.jsx:43–45`。 |
| 导航「六选二／填空／阅读／数学」 | 推断：必要，支持跨题型直接找题。 | 代码证据 `platform/mobile/src/components/Practice.jsx:12–17、45–51`。 |
| 导航「查找单元」与 Passage／Section 示例 | 推断：字段标签必要，保留一个随题型变化的短例足够。 | 代码证据 `platform/mobile/src/components/Practice.jsx:52`。 |
| 导航「文章／单元」、资料名、单元名、单元题数 | 推断：资料与单元标识必要，题数信息次要。 | 代码证据 `platform/mobile/src/components/Practice.jsx:53–56`。 |
| 导航「没有匹配的单元」 | 推断：必要，可与搜索字段同处提示。 | 代码证据 `platform/mobile/src/components/Practice.jsx:54`。 |
| 导航「题号」、原书题号示例与「跳转」 | 推断：必要，必须让用户知道按原书号码跳转。 | 代码证据 `platform/mobile/src/components/Practice.jsx:57–64`。 |
| 导航「这个单元中没有该题号」 | 推断：必要，给出明确失败位置。 | 代码证据 `platform/mobile/src/components/Practice.jsx:60、65`。 |
| 导航「显示」、全部题目／已提交记录／尚未做过／草稿 | 推断：筛选值有用途，「显示」可以换成更具体的短标签。 | 代码证据 `platform/mobile/src/components/Practice.jsx:66–68`。 |
| 导航匹配题数、格内题号、当前题标记 | 推断：题号和当前位置必要，题数可弱化。 | 代码证据 `platform/mobile/src/components/Practice.jsx:68–73`。 |
| 导航状态「·／草稿／已提交／同内容已做」与「另有已提交历史」无障碍标注 | 推断：区分状态必要，圆点须有文字等价物。 | 代码证据 `platform/mobile/src/components/Practice.jsx:18–19、70–73`。 |
| 导航「没有符合条件的题目」 | 推断：必要，帮助用户判断当前筛选无结果。 | 代码证据 `platform/mobile/src/components/Practice.jsx:76`。 |
| 导航上一页／下一页、当前页／总页数 | 推断：多页时必要。 | 代码证据 `platform/mobile/src/components/Practice.jsx:44、77`。 |
| 题页题型名、单元名与「第 N 题」，返回、题目导航 | 推断：定位与两种导航入口必要。 | 代码证据 `platform/mobile/src/components/Practice.jsx:319–323`。 |
| 题页「正在读取原题…」、题详情错误文本／「重试」 | 推断：必要，避免展示未通过校验的旧内容。 | 代码证据 `platform/mobile/src/components/Practice.jsx:126–140、334–336`。 |
| 题页目录或阅读位置错误文本／「重试」 | 推断：必要，建议在视觉上区分题目错误与偏好写入错误。 | 代码证据 `platform/mobile/src/components/Practice.jsx:144–151、337`。 |
| 题页「左右滑动切换相邻题目」／「长按正文可选词」 | 推断：可首次或相关情景再显示，常驻占用一行。 | 代码证据 `platform/mobile/src/components/Practice.jsx:338`。 |
| 题页「选词」／「结束选词」 | 推断：保留可见的进入和退出状态，承担选词与刷题手势互斥。 | 代码证据 `platform/mobile/src/components/Practice.jsx:216–220、238–242、338–340`。 |
| 选词确认的选中词、加入按钮、保存中、取消 | 推断：四项均必要，避免误收录并支持退出。 | 代码证据 `platform/mobile/src/components/Practice.jsx:339`。 |
| 选词已有、加入成功、词库未载入或写入错误提示 | 推断：必要，成功和重复可简短展示。 | 代码证据 `platform/mobile/src/components/Practice.jsx:198–213`。 |
| 题页六类操作规则提示 | 推断：必要，至少保留选二、选择所有项、每空一项和原文选句的分支含义。 | 代码证据 `platform/mobile/src/components/Practice.jsx:304–306、359`。 |
| 题页「N / 2 已选」 | 推断：SE 必要，有助于发现漏选。 | 代码证据 `platform/mobile/src/components/Practice.jsx:359`。 |
| 题页原始题干文字或图片 | 推断：必要，保留完整信息和原题定位。 | 代码证据 `platform/mobile/src/components/Practice.jsx:360`。 |
| 题页选项字母、正文、选中标记、QC 预设英文回退或「选项 X」 | 推断：字母、正文和可读选择态必要，勾与色双重强调可依据可访问性收敛。 | 代码证据 `platform/mobile/src/components/Practice.jsx:306–312`。 |
| TC「空 (i)／(ii)／(iii)」、已选字母或「待选」、「下一空」 | 推断：空位和选择进度必要，下一空按钮视布局可并入同一区域。 | 代码证据 `platform/mobile/src/components/Practice.jsx:362–364`。 |
| RC「原文」、文章正文、A−／A＋、分隔比例无障碍文案 | 推断：原文和可键盘操作的分隔条必要，字号控件可收入阅读工具。 | 代码证据 `platform/mobile/src/components/Practice.jsx:341–358`。 |
| RC 所选句子／「点按上方原文中的句子」／图片选句只读提示 | 推断：必要，区分已选、尚未选与本题无法提交。 | 代码证据 `platform/mobile/src/components/Practice.jsx:347–349、361`。 |
| 录入标签「答案／按原题填写答案」与对应三个示例 | 推断：输入提示必要，可避免标签和顶栏规则重复。 | 代码证据 `platform/mobile/src/components/Practice.jsx:304、365–366`。 |
| 原图页码与「点按放大」、焦点线、行内原图失败、放大弹层标题与关闭 | 推断：页码、失败和关闭必要，焦点只在跨内容页面有价值。 | 代码证据 `platform/mobile/src/components/Practice.jsx:21–28、388`、`platform/mobile/src/components/Primitives.jsx:43–45`。 |
| 「原题图片不能直接选词」说明 | 推断：必要但可在图旁或进入选词时显示，避免与常驻手势说明重叠。 | 代码证据 `platform/mobile/src/components/Practice.jsx:338、368`。 |
| 《来源》书名 | 推断：保留可追溯性，可以并到定位行或资料详情。 | 代码证据 `platform/mobile/src/components/Practice.jsx:369`。 |
| 「同内容已做」与「没有独立提交记录」 | 推断：需要区分同内容完成与独立作答，两个短句可合为一个。 | 代码证据 `platform/mobile/src/components/Practice.jsx:370–371`。 |
| 「已提交记录」、时间、提交次数或「旧训练记录」 | 推断：历史状态必要，时间次数可收进已提交详情。 | 代码证据 `platform/mobile/src/components/Practice.jsx:372–373`。 |
| 「作答」逐题回显或旧记录未保存逐题答案 | 推断：必要，有助于理解历史与当前草稿的区别。 | 代码证据 `platform/mobile/src/components/Practice.jsx:374`。 |
| 「与参考答案一致／不一致」、「参考答案（用户提供）」或「暂无参考答案」 | 推断：必要，比较结果不应冒充标准答案。 | 代码证据 `platform/mobile/src/components/Practice.jsx:375–376`。 |
| 「重新作答」 | 推断：必要，已做题能明确开始新草稿。 | 代码证据 `platform/mobile/src/components/Practice.jsx:371、377`。 |
| 草稿未保存及「重试保存」、答案成功或保存后刷新失败提示 | 推断：必要，保存成功后应与需要再次提交的失败状态区分。 | 代码证据 `platform/mobile/src/components/Practice.jsx:249–265、284–302、367`。 |
| 底部上一题／下一题、保存答案／保存中、末题返回题型或返回 | 推断：必要，保留可点击的切题、提交和退出动作。 | 代码证据 `platform/mobile/src/components/Practice.jsx:382–385`。 |
| AI 标题「AI 解析」、正常时「使用 ChatGPT 计划」 | 推断：标题必要，套餐标签可进详情以避免占空间。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:45–47`。 |
| AI 未连接、平台不可用、状态错误或无可用模型提示 | 推断：必要，解释下一步，不应把所有失败统称加载中。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:16–17、28–32、47–49`、`platform/mobile/src/ai/client.mjs:5–7`。 |
| AI 主按钮「解析本题／重新解析本题／正在解析…」，连接、停止、管理额度 | 推断：均保留在各自条件下，正常状态只突出一个动作。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:48–49`。 |
| AI 解析成功、停止、请求失败或结果不合格提示 | 推断：必要，明确已有作答与解析状态。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:38–49`、`platform/mobile/src/ai/review.mjs:27–43、56–61`。 |
| 「AI 暂定讲解」与「存在证据不足或答案冲突」 | 推断：必要，清楚标记结果的参考性质。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:50、53`。 |
| 完整题干翻译 | 推断：必要，不能压缩成题意摘要。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:50`、`platform/shared/ai-explanation.mjs:4–10、27`。 |
| 每项标签、含义、中文翻译、选择／排除依据 | 推断：均必要，逐项保留原顺序和错项。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:51`、`platform/shared/ai-explanation.mjs:6–10、27`。 |
| 「推理与证据」的摘要、证据、推理缺口及「下次怎么做」 | 推断：内容均必要，标题可依据层级合并。 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:52`、`platform/shared/ai-explanation.mjs:24–28`。 |

### 刷题局部偏好与恢复

| 设置项 | 当前默认值及保存 | 谁需要调整 | 建议及依据 |
| --- | --- | --- | --- |
| 题型与当前题位 | 默认 SE、无题位，有效题型与题位均随本地偏好恢复。 | 推断：持续刷同一题型、离开后继续的人。 | 推断：保留自动恢复。代码证据 `platform/mobile/src/components/Practice.jsx:83、108–112、144–151`、`platform/mobile/src/practice/repository.mjs:129–135`。 |
| RC 原文高度比例 | 默认 42%，用户变化后跨启动恢复，实际显示按视口重新限幅。 | 推断：小屏、长文或需要同时看更多选项的人。 | 推断：保留拖动、键盘和预设恢复。代码证据 `platform/mobile/src/components/Practice.jsx:90、108–112、144–151、245–247、351–357`。 |
| RC 字号 | 默认 17px，可调 15–22px，调整后随偏好保存。 | 推断：希望提高可读性或增加单屏信息量的人。 | 推断：保留为阅读局部控件。代码证据 `platform/mobile/src/components/Practice.jsx:90、111–112、144–151、341–343`。 |
| 目录范围与页码 | 默认当前题型、当前单元或首单元、全部题目、第一页，弹层重新挂载时重置。 | 推断：找特定题号、未做题和草稿的人。 | 推断：保留局部过滤，是否记住上次条件可单列讨论。代码证据 `platform/mobile/src/components/Practice.jsx:32–47、387`。 |
| 阅读原文滚动位 | 首次 0，在本次组件存活期按文章恢复，未作为偏好保存。 | 推断：跨同一篇文章的多题来回的人。 | 推断：保留当前会话内记忆，重启是否恢复应另议。代码证据 `platform/mobile/src/components/Practice.jsx:92、144–151、164–179`。 |

### 重复、隐藏与未完能力

| 发现 | 性质及证据 | 建议 |
| --- | --- | --- |
| 刷题首页右上导航与「按单元选题」等价 | 代码证据 `platform/mobile/src/components/Practice.jsx:325–331、387`。 | 推断：合并首页重复入口，题页保留直接导航。 |
| 题导航存在「同内容已做」标记，筛选表单没有对应值 | 代码证据 `platform/mobile/src/components/Practice.jsx:18–19、42–43、66–74`。 | 推断：这是当前覆盖差异，可先保留「全部题目」中浏览，是否需要筛选取决于真正使用频率。 |
| 暂无刷题全局时间线或某题多次作答明细页 | 代码证据 `platform/mobile/src/practice/model.mjs:214–236`、`platform/mobile/src/practice/repository.mjs:64–75`、`platform/mobile/src/components/Practice.jsx:372–387`。 | 推断：只把当前区理解为最近一次记录和提交次数，二级历史列表有需求再设计。 |
| `navigationStatus()` 与本地 `statusOf` 判定有重叠，正式 JSX 取后者 | 代码证据 `platform/mobile/src/practice/model.mjs:24–27`、`platform/mobile/src/components/Practice.jsx:18–19、69–74`。 | 推断：前者是正式界面的未接线候选，避免据此改受保护的模型。 |
| `.directory-history` 当前只有样式，题导航不渲染该结构 | 代码证据 `platform/mobile/src/practice/practice.css:76–78`、`platform/mobile/src/components/Practice.jsx:49–78`。 | 推断：改版时可复查样式清理范围，不能因此删除题页的实际历史。 |
| 只读图片选句有可见入口，无对应提交或 AI 解析入口 | 代码证据 `platform/mobile/src/components/Practice.jsx:160–163、361、382–385`、`platform/mobile/src/components/MobileAiReview.jsx:44`。 | 推断：保留明确限制，不把无法校验的选句包装成可作答。 |
| 已存 AI 解析绑定作答事件，旧训练引用／只有同内容已做没有独立 ID 时隐藏区块 | 代码证据 `platform/mobile/src/practice/repository.mjs:64–75`、`platform/mobile/src/components/MobileAiReview.jsx:20–23、44`。 | 推断：改版应保持边界，可在需要时用一句提示解释入口为何尚未出现。 |
| AI 返回的技巧 ID 与本机存储类型未进入题页正文 | 代码证据 `platform/mobile/src/ai/review.mjs:56–61`、`platform/mobile/src/components/MobileAiReview.jsx:50–54`、`platform/mobile/src/practice/repository.mjs:35–38`。 | 推断：内部字段无需仅为展示而新增标签。 |

### 刷题接入候选 C 的讨论项

| 卡点 | 当前证据与要保留的规则 | 设计建议 |
| --- | --- | --- |
| 原型覆盖面 | 代码证据 `platform/mobile/ui-redesign/prototype/src/c/main.jsx:1200–1230` 只演示原创例句三选一、前后题、例句译文开关和草稿失败标识，正式保留四类目录、原题、可提交作答（代码证据 `platform/mobile/src/components/Practice.jsx:304–388`）。 | 推断：先定义题型首页、目录、题目和已交记录的层级，再用 C 配色、排版、声音和固定栏组织现有组件。 |
| 题库和原图 | 代码证据 `platform/mobile/src/practice/loader.mjs:3–39` 限制包内路径、题目定位、字节数和 SHA-256，`platform/mobile/src/practice/repository.mjs:39–49` 校验题目身份并缓存。 | 推断：改版只调整占位和重试位置，不能旁路查验或切到未验证的展示内容。 |
| 推荐、相邻题与计数 | 代码证据 `platform/mobile/src/practice/model.mjs:210–236` 计算作答、完成、同内容和推荐，`platform/mobile/src/practice/interaction.mjs:3–7` 的上一／下一是同题型原始顺序。 | 推断：无论是否将首页更名「练题」，推荐入口与上一／下一仍各自说明意图，计数及排期照旧。 |
| 草稿、提交与重做 | 代码证据 `platform/mobile/src/components/Practice.jsx:249–302` 和 `platform/mobile/src/practice/repository.mjs:90–127` 区分可重试的草稿与已提交事件，提交冻结快照并保持重试幂等。 | 推断：不能把 C 的选项即时高亮或定位动画等同答案保存成功，失败可见且可重试，页面状态保留。 |
| 滚动、文字选择、解题控件与切题 | 代码证据 `platform/mobile/src/components/Practice.jsx:164–243、338–366` 区分 RC 双区域、触摸／笔、拖动调整、长按选词与相邻题，并把数学排除在滑切之外。 | 推断：测试原图放大、中文输入法、屏幕阅读器、普通竖滚和双区、选句与选词在小屏及系统返回手势下互不抢占。 |
| 解析与共享讲解契约 | 代码证据 `platform/mobile/src/components/MobileAiReview.jsx:20–39`、`platform/mobile/src/ai/review.mjs:24–61`、`platform/shared/ai-explanation.mjs:4–27`、`platform/mobile/src/practice/repository.mjs:77–87` 要求真实作答 ID、原题上下文、完整解析和落盘。 | 推断：允许收折结果，保留完整题干翻译、全部选项、推理证据及不合格处理，不能以例句翻译取代。 |

### 刷题与 AI 的运行边界

| 问题 | 静态结论 |
| --- | --- |
| 刷题需要联网或账号吗 | 正式题库加载器只读取相对包内资源，作答用安卓本机 SQLite 或预览的 IndexedDB（代码证据 `platform/mobile/src/practice/loader.mjs:20–39`、`platform/mobile/src/practice/storage.mjs:1–30`）。 |
| MobileAiReview 现在能用吗 | 源码已具备连接状态、模型列表、在线解析、停止、保存、复显的路径，必须在安卓，连接且有资格、有可用模型、题目有真实作答事件和足够原题内容，网页预览明确不可发起远程解析（代码证据 `platform/mobile/src/components/MobileAiReview.jsx:24–49`、`platform/mobile/src/ai/client.mjs:3–25`、`platform/mobile/src/ai/review.mjs:27–43`），当前账号、远端通行与真机表现需另验（推断，静态盘点无法证明）。 |
| AI 分析从哪里得到题目与答案 | 优先用该提交冻结的题快照及作答和参考答案，带题面／必要附图、技巧范围向原生在线端发起结构化请求，图片路径、数量与体积受限，生成不合格时不保存（代码证据 `platform/mobile/src/components/MobileAiReview.jsx:6–8、30–39`、`platform/mobile/src/ai/review.mjs:4–17、27–61`、`platform/mobile/src/practice/repository.mjs:77–87`）。 |
| AI 是否会修改作答或自动同步 GitHub | 解析作为独立记录挂到本机作答，支持随刷题备份导出，应用文案提示由电脑 Codex 导入并同步（代码证据 `platform/mobile/src/practice/repository.mjs:77–87、137–149`、`platform/mobile/src/components/PracticeDataSettings.jsx:53`、`platform/mobile/src/components/Settings.jsx:80`）。 |

## 设置、文件导入预览与 ChatGPT 连接

### 设置各视图和状态

| 页面或弹层 | 入口和步数 | 空、加载、错误及隐藏状态 | 证据 |
| --- | --- | --- | --- |
| 设置主屏 | 底栏「设置」1 | 共享启动状态，词库更新和恢复工具仅在有相应结果或快照时出现，文件处理中禁用同组按钮。 | 代码证据 src/App.jsx:66–69、86–87，src/components/Settings.jsx:48–82 |
| 「导入预览」和「恢复前确认」 | 两个入口各 2，再选文件一次 | 选择文件取消时关闭系统流程，读取/校验错用全局提示，只有完整包可恢复，失败保留已打开的预览。 | 代码证据 src/components/Settings.jsx:19–29、43–46、83–87，src/App.jsx:52–61 |
| 「撤回上次完整恢复」确认 | 设置→撤回 2，确认 3 | 没有恢复前快照则入口隐藏，正在恢复时锁定操作，失败留在确认。 | 代码证据 src/components/Settings.jsx:75、88，src/components/Primitives.jsx:50–51，src/App.jsx:52–61 |
| 「导入刷题记录」预览 | 设置→导入刷题记录 2，再选文件一次 | 取消不抛提示，处理中禁用，验证或合并异常显示提示，有冲突时还能读预览但不能提交。 | 代码证据 src/components/PracticeDataSettings.jsx:27–49、55–68 |
| 「AI 题目解析」嵌入面板 | 设置 1，滚动到面板 | 有未连接、授权中、已连接但未授予计划、模型空/加载/失败、手动刷新和网页不可用等状态。 | 代码证据 src/components/ChatGPTSettings.jsx:70–89，src/ai/login-flow.mjs:4–8、38–75 |
| 只读连接诊断回落 | 设置→复制连接诊断 2，自动复制失败才显示 | 从设备取最新或上次已知状态，无结果标为 unavailable，系统剪贴板不可用则留可选中的只读文本。 | 代码证据 src/components/ChatGPTSettings.jsx:48–68、86–88，src/ai/diagnostics.mjs:10–25 |

### 设置功能和入口

| 功能 | 入口和步数 | 做什么 | 代码位置 | 依赖的数据或契约 | 改版状态 | 去掉会坏什么 | 建议和理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 声音/翻页音色 | 设置 1，切开关或打开选择器 2，选择音色通常 3 | 控制操作音，五种音色供词库翻页等动作调用。 | 代码证据 src/components/Settings.jsx:49–55，src/App.jsx:48–51、77–78，src/sound.mjs:125–132、294–330 | 外观 localStorage、Web Audio 及用户操作后解锁。 | 已按 C 改（开关与音色已落地），设置页视觉未改 | 推断：用户失去静音及音色偏好。 | 推断：保留，音色可与开关在同组显示。 |
| 词墙显示偏好 | 设置 1，选择项/拖动上限 2 | 设置状态样式、翻页轴、词墙主题、英文字号上限和触感。 | 代码证据 src/components/Settings.jsx:10–14、57–67，src/components/WallSheets.jsx:33–37，src/wall-display.mjs:5–26、39–51 | 外观 localStorage、旧尺寸偏好回落、设备振动支持。 | 已按 C 改（已接功能），设置页视觉未改 | 推断：丢失填色、翻页手势方向和大字号等现有可用性选项。 | 推断：保留，在一个二级「词墙」分组统一读写。 |
| 导入词库和导入预览 | 设置→导入词库 2，选文件后进预览，确认再 1 | 校验输入并合并新增词和关系，提示冲突并保留本机已有内容。 | 代码证据 src/components/Settings.jsx:19–29、43–46、71、83–87，src/data/repository.mjs:180–197 | 词库包格式、合并预览、导入写入，与完整替换语义独立。 | C 里没有 | 推断：丢失补词和增分类的本地入口。 | 推断：保留，收进二级「词汇数据」。 |
| 导出词汇完整备份 | 设置→操作 2，外部系统保存另计 | 导出词、关系、历史、轮次与 repository 设置。 | 代码证据 src/components/Settings.jsx:31–41、72，src/data/repository.mjs:177 | 词汇完整包、Android 文件桥或网页下载。 | C 里没有 | 推断：换机或卸载前失去词汇备份入口。 | 推断：保留，在「数据与备份」注明词汇数据范围。 |
| 恢复词汇完整备份 | 设置→操作 2，选完整备份后进「恢复前确认」，确认再 1 | 用完整词汇备份替换当前数据、留下恢复前快照，并回词库刷新视图。 | 代码证据 src/components/Settings.jsx:19–29、43–46、74、83–87，src/App.jsx:65，src/data/repository.mjs:198–204 | 完整备份类型、恢复前快照、数据集与页面状态重载。 | C 里没有 | 推断：失去跨机迁移及从完整快照还原的界面。 | 推断：收进二级并保留危险确认。 |
| 导出词库更新前备份 | 设置→条件项 2 | 词库升级留下 catalog recovery 时导出升级前版本。 | 代码证据 src/components/Settings.jsx:31–39、73，src/data/repository.mjs:64–70、179 | 升级恢复快照与普通恢复快照是两个来源。 | C 里没有 | 推断：发生升级差异时失去单独保全旧版本的入口。 | 推断：收进二级恢复工具，仅存在快照时显示。 |
| 导出恢复前备份 | 设置→条件项 2 | 在存在完整恢复快照时另存该快照。 | 代码证据 src/components/Settings.jsx:31–39、75，src/data/repository.mjs:178 | 完整恢复前快照。 | C 里没有 | 推断：恢复失误后少一条把原数据另存到应用外的路径。 | 推断：收进二级恢复工具，加强与当前备份名称区分。 |
| 撤回上次完整恢复 | 设置→条件项 2，确认 3 | 将当前词汇数据替换为上一次完整恢复前的快照。 | 代码证据 src/components/Settings.jsx:75、88，src/data/repository.mjs:205–208 | 恢复快照、替换写入、恢复后增量不合并。 | C 里没有 | 推断：完整替换错误失去应用内回退。 | 推断：保留，放在二级并继续明确替换范围。 |
| 导出刷题记录 | 设置→操作 2，系统流程另计 | 导出作答、草稿与 AI 解析，网页显示已发起下载。 | 代码证据 src/components/PracticeDataSettings.jsx:14–25、51–54，src/practice/repository.mjs:137–143 | 独立刷题 repository、带校验的备份包和文件桥。 | C 里没有 | 推断：移除会切断手机刷题数据的人工跨端交接。 | 推断：保留，与词汇备份同屏分组并标明两份文件。 |
| 导入刷题记录、预览及确认合并 | 设置→操作 2，选文件后进预览，确认再 1 | 按现有刷题合并约束追加新记录，有冲突禁用合并。 | 代码证据 src/components/PracticeDataSettings.jsx:27–49、54–68，src/practice/repository.mjs:144–150 | 刷题包校验、事件与草稿合并、冲突拦截。 | C 里没有 | 推断：换机恢复作答、草稿和解析的入口消失。 | 推断：保留，勿将合并包装为完整替换。 |
| ChatGPT 登录、重新授权与取消 | 设置→连接/重新授权 2，浏览器授权另计，进度出现后点取消再 1 | 打开 Android 外部授权，以设备状态为准，取消登录不等于退出已有账号。 | 代码证据 src/components/ChatGPTSettings.jsx:15–37、70–85，src/ai/client.mjs:3–13，src/ai/login-flow.mjs:100–143 | Android 原生桥、ChatGPT 登录与计划推理授权、前后台状态。 | C 里没有 | 推断：用户无法启用或修复远程 AI 解析。 | 推断：保留，收进二级「AI 题目解析」并在刷题保留跳转。 |
| 模型选择、错误重载 | 设置 1，选模型通常 3，失败/空时重载 2 | 列出账号有权使用的模型，并将显式选择写入词汇 repository 的设置字段。 | 代码证据 src/components/ChatGPTSettings.jsx:38–41、72–79，src/ai/login-flow.mjs:54–75，src/data/repository.mjs:176 | 已连接且 eligible、异步模型列表、aiModel。 | C 里没有 | 推断：失去模型选择和模型加载失败后的恢复路径。 | 推断：收进连接页，成功连接后才显示。 |
| 退出连接、管理额度 | 设置→操作 2，管理额度打开外部页面 | 分别断开连接或打开额度界面。 | 代码证据 src/components/ChatGPTSettings.jsx:43–46、80，src/ai/client.mjs:13、25，android/app/src/main/java/cn/grestudy/vocabulary/ChatGPTPlanPlugin.java:139、466 | 已连接状态、退出回执与原生外部跳转。 | C 里没有 | 推断：无法换账号或排查计划额度。 | 推断：收进连接页二级操作。 |
| 重新检查与复制连接诊断 | 设置→操作 2，复制失败时手动选文本 | 刷新设备连接与模型状态，或复制经过白名单筛选的运行诊断。 | 代码证据 src/components/ChatGPTSettings.jsx:48–68、85–88，src/ai/diagnostics.mjs:8–31 | 设备状态、超时控制、剪贴板和只读文本回落。 | C 里没有 | 推断：连接故障时失去判断回调阶段、区分刷新失败和定位版本的手段。 | 推断：收进二级「连接诊断」，主区域仅在故障时露出重试。 |
| 离线使用、学习日时区和操作提示 | 设置 1，滚动到对应区块 | 展示本地数据、跨端交接、备份责任和手势规则。 | 代码证据 src/components/Settings.jsx:80–81，src/components/WallSheets.jsx:47–53 | 只读学习日时区、词墙轴、系统操作说明。 | 已按 C 改（词墙手势提示），离线/数据说明在 C 里没有 | 推断：去掉所有说明会增加迁移误操作和隐藏手势的发现成本。 | 推断：合并到「帮助」及相关操作前，初次词墙继续留手势入口。 |

### 设置默认值与改动人群

| 设置项 | 默认值、存储及实际作用 | 谁会改 | 建议 | 证据 |
| --- | --- | --- | --- | --- |
| 记忆状态：圆点 / 填色 | 默认圆点、设备端 localStorage，填色只在已标记的释义面显示，英文面不着色且两面均无记忆圆点。 | 推断：偏好更明显的释义面颜色的人。 | 推断：保留。 | 代码证据 src/wall-display.mjs:5–26、30–46，src/components/WordTile.jsx:137–138、234–245 |
| 词墙方向：左右 / 上下 | 默认左右，跟手方向作用于普通网格，关系分组走原有手势与分页。 | 推断：习惯单手上/下翻的人。 | 推断：保留，示意只在普通词墙生效。 | 代码证据 src/wall-display.mjs:5–8，src/components/WordWall.jsx:48–52、442–453，src/components/WallTrack.jsx:33–49 |
| 词墙配色：浅色 / 深色 | 默认浅色，候选 C 配色随词墙容器及该标签的底栏生效。 | 推断：夜间学习或偏好高对比的人。 | 推断：保留「词墙配色」命名，若做全局外观需单独设计非词墙页面的主题。 | 代码证据 src/wall-display.mjs:5–8，src/components/WordWall.jsx:415，src/App.jsx:90，src/wall-candidate.css:1–26 |
| 英文字号上限 | 外观偏好初值 null，沿用这套词库的显示字号，旧默认 14.5 显示为 15 px，可选 12–22 px。 | 推断：需要大字或想多看长词的人。 | 推断：保留「上限」含义，词卡自行收缩以适应长词。 | 代码证据 src/model.mjs:7，src/wall-display.mjs:5–26，src/App.jsx:76、87，src/components/WordWall.jsx:51，src/components/WallSheets.jsx:33–37 |
| 触感 | 默认关，打开后在支持的设备用 navigator.vibrate(8)，没有独立原生开关实现。 | 推断：希望翻页/标记可触知的人。 | 推断：保留默认关，在二级说明以设备支持为准。 | 代码证据 src/wall-display.mjs:5–13、49–51，src/components/WordWall.jsx:150–151、165–166、296–297、331 |
| 音效 | 默认开，声音模块按设置启停，播放/解锁失败不阻塞动作。 | 推断：公共场合、对声音敏感或仅想静默复习的人。 | 推断：保留在设置一级可达。 | 代码证据 src/wall-display.mjs:5–11，src/App.jsx:49–50、77–78，src/sound.mjs:294–330 |
| 翻页音色 | 默认颤音琴，备选卡林巴、马林巴、钟琴、音乐盒，完整共五种。 | 推断：想选更柔和或更容易听清反馈的人。 | 推断：保留全部五种，若加试听，同一音量即时单次播放。 | 代码证据 src/sound.mjs:125–132、156、170，src/components/Settings.jsx:52–55 |
| AI 解析模型 | 初始无硬编码固定模型，有可用列表时优先使用已存选择，否则回落至列表首项。 | 推断：希望换模型以匹配速度或额度的人。 | 推断：收进连接页，保留可用性回退。 | 代码证据 src/components/ChatGPTSettings.jsx:38–41、74，src/data/repository.mjs:8–9、176 |
| 学习日时区 | 新数据默认 Asia/Shanghai，现有数据使用恢复/本地数据中的时区，设置页仅展示。 | 推断：跨时区使用者会想核对或申请修改学习日边界。 | 推断：收进复习说明，可编辑性列为讨论项，保持现有排期契约。 | 代码证据 src/data/repository.mjs:8–9，src/data/model.mjs:133–134、225、247、255，src/components/Settings.jsx:80 |
| 减少动态效果 / 卡片高度 | 正式设置无对应手动项，词块和词墙读系统减动效设置，旧高度字段仍在数据模型。 | 推断：依赖系统减动效或曾调整卡高的人。 | 推断：保留系统减动效与旧字段兼容。 | 代码证据 src/components/Settings.jsx:49–68，src/components/WordTile.jsx:31、143–145，src/components/WallTrack.jsx:43，src/model.mjs:7，ui-redesign/prototype/src/c/main.jsx:1250 |

### 设置页及弹层的显示字段

| 字段 | 必要性判断 | 证据 |
| --- | --- | --- |
| 「设置」「声音」「词墙显示」「词库与数据」「刷题记录」「AI 题目解析」「离线使用」「操作提示」 | 推断：标题承担分类，离线和操作说明可合入帮助，不必两个常驻区。 | 代码证据 src/components/Settings.jsx:48–81，src/components/PracticeDataSettings.jsx:51–52，src/components/ChatGPTSettings.jsx:70 |
| 「音效」开关、「翻页音色」及卡林巴、马林巴、颤音琴、钟琴、音乐盒 | 推断：开关、选择标签与五个值都必要。 | 代码证据 src/components/Settings.jsx:49–55，src/sound.mjs:125–132 |
| 「记忆状态」及圆点、填色 | 推断：标签、两种状态提示都必要。 | 代码证据 src/components/Settings.jsx:10–14、58–64 |
| 「词墙方向」及左右、上下 | 推断：标签和两种手势选择必要。 | 代码证据 src/components/Settings.jsx:10–14、58–64 |
| 「词墙配色」及浅色、深色 | 推断：名称与选项必要，名称明确作用域。 | 代码证据 src/components/Settings.jsx:10–14、58–64 |
| 「英文字号上限」及当前 px 值、「触感」开关 | 推断：名称和当前值必要，单位可只显示在调整时。 | 代码证据 src/components/Settings.jsx:65–67，src/components/WallSheets.jsx:33–37 |
| 活跃单词总数、「数据保存在此设备」 | 推断：总数可复用词库统计，本地性需在备份区保留。 | 代码证据 src/components/Settings.jsx:69 |
| 词库更新完成/进度保留、条件新增词数、条件保留手机释义词数 | 推断：升级结果必要一次，两个数量各有用途但宜进详情。 | 代码证据 src/components/Settings.jsx:70 |
| 「导入词库」及合并说明、「导出词汇完整备份」及数据范围说明 | 推断：按钮必需，范围说明可收成简短副文案。 | 代码证据 src/components/Settings.jsx:71–72 |
| 「导出词库更新前备份」及升级前记录说明、「恢复词汇完整备份」及替换/快照说明 | 推断：名称及「更新前／替换」区分必需，次要解释可进确认页。 | 代码证据 src/components/Settings.jsx:73–74 |
| 「撤回上次完整恢复」「导出恢复前备份」及各自解释 | 推断：动词和两个快照语义有用，适合只出现在有快照的恢复区。 | 代码证据 src/components/Settings.jsx:75 |
| 「正在处理文件…」、最近导出文件名及「已发起下载／已导出」、成功与导出错误提示 | 推断：加载、失败和完成不同状态必要，最近导出可放在操作内。 | 代码证据 src/components/Settings.jsx:38–41、76 |
| 「导入预览／恢复前确认」、文件名、单词、新词、已有词、复习事件 | 推断：文件名和语义必需，恢复保留总数与事件数，导入突出新词与已有词。 | 代码证据 src/components/Settings.jsx:83–84 |
| 「取消」「确认导入／确认替换并恢复」「处理中…」 | 推断：必要，确认动作词区分合并与覆盖。 | 代码证据 src/components/Settings.jsx:83 |
| 合并范围、不会导入另一端复习次数、恢复替换警示及自动快照说明 | 推断：数据影响说明必要，放在提交前同一个位置。 | 代码证据 src/components/Settings.jsx:85 |
| 差异条数、手机现有内容优先、展开可见最多 30 条差异 | 推断：条数和保留规则必要，具体差异留展开。 | 代码证据 src/components/Settings.jsx:86 |
| 撤回弹层的「撤回上次完整恢复」「恢复到之前」和新记录不合并/先备份警示 | 推断：必要，说明回退是替换及会影响哪段数据。 | 代码证据 src/components/Settings.jsx:88 |
| 「导出刷题记录／导入刷题记录」、含作答草稿解析/合并保留说明 | 推断：按钮及口径必要，避免与词汇文件混用。 | 代码证据 src/components/PracticeDataSettings.jsx:51–54 |
| 刷题导入标题和文件名、作答记录、新增记录、新增草稿记录、旧训练引用、新增 AI 解析 | 推断：前四类用于预期核对，旧训练引用可收进预览明细。 | 代码证据 src/components/PracticeDataSettings.jsx:55、59–65 |
| 「取消」「确认合并」「处理中…」、冲突数与禁止导入/保留两份、导出或合并结果/失败提示 | 推断：必要，决定能否安全继续及是否需要人工核对。 | 代码证据 src/components/PracticeDataSettings.jsx:14–49、55–57、67 |
| AI 说明（ChatGPT 计划、手机联网且电脑可关机）、账号标识或「已连接 ChatGPT」、使用计划／未授予计划 | 推断：连接状态和计划资格必要，账号标识可只在连接管理出现。 | 代码证据 src/components/ChatGPTSettings.jsx:70–74 |
| 「解析模型」、模型显示名或 slug、加载文字、模型错误和「重新加载模型」 | 推断：必要，资格通过后的异步选择应有确定状态和恢复入口。 | 代码证据 src/components/ChatGPTSettings.jsx:74–79 |
| 「管理额度」「退出连接／正在退出…」「重新授权」及退出结果 | 推断：保留在连接管理下，忙时状态防重复操作。 | 代码证据 src/components/ChatGPTSettings.jsx:43–46、80 |
| 「Continue with ChatGPT／重新登录 ChatGPT」、设备或网页不可用说明、开始／浏览器等待／交换／核验／失败／取消阶段 | 推断：入口统一后依旧需要可识别的阶段和对应操作。 | 代码证据 src/components/ChatGPTSettings.jsx:81–84，src/ai/login-flow.mjs:4–8，src/ai/client.mjs:6–11 |
| 已等待秒数、「登录状态等待更新」「取消登录」「重新登录」、连接/登录/额度错误及「重新检查状态／正在检查连接…」 | 推断：恢复动作及错误必要，秒数和阶段重复提示可放到诊断区。 | 代码证据 src/components/ChatGPTSettings.jsx:82–86 |
| 应用版本、当前阶段、上次已知状态、「复制连接诊断／正在读取诊断…」、失败后只读手动复制框 | 推断：排障所需，集中到二级诊断。 | 代码证据 src/components/ChatGPTSettings.jsx:48–68、86–88 |
| 诊断文本中的格式、版本、状态来源、可用性、授权模式、App 版本、阶段、经过秒数、监听状态、请求次数、有效回调、拒绝类别 | 推断：保留为排障证据，只随复制或手动回落出现。 | 代码证据 src/ai/diagnostics.mjs:8–31 |
| 计划用量提示、不会自动转收费 API、登录凭据不进入备份 | 推断：授权与付费边界重要，可收至登录入口旁一条说明。 | 代码证据 src/components/ChatGPTSettings.jsx:89 |
| 随包离线、AI 联网、刷题备份交给电脑 Codex 同步 GitHub、卸载/换机分别备份、学习日时区 | 推断：网络和数据边界必要，GitHub 说明应明确为 App 外部流程，时区可收进复习帮助。 | 代码证据 src/components/Settings.jsx:80 |
| 词墙通用手势、刷题除数学可横滑、记录本轮卡片后自动开新一轮 | 推断：内容有用但可分流到靠近操作场景的帮助。 | 代码证据 src/components/Settings.jsx:81，src/components/WallSheets.jsx:47–53 |

## 跨页面答复

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| 复习和刷题有什么区别？ | 复习以词和预先确定的词表为单位，做认义、补全、默写并计算下次单词复习，刷题以 SE、TC、RC、Quant 的题目为单位，维护题位、答题草稿、作答和可选 AI 解析。 | 代码证据 src/components/WordSession.jsx:62–94，src/components/Practice.jsx:13–18、245–305、327–388，src/data/repository.mjs:103–113，src/practice/repository.mjs:79–135 |
| 新用户能一眼分清吗？能不能合并？ | 推断：只看「复习／刷题」不能稳定地分出「单词背诵」和「GRE 原题作答」，可统一视觉与反馈模式，建议保留两个主入口并把复习入口说明改成「单词复习」。 | 代码证据 src/components/Primitives.jsx:54–56，src/components/Review.jsx:59–67，src/components/Practice.jsx:327–334，推断 |
| 复习轮次是什么？用户要懂多少？ | 推断：用户只须知道「这张卡是一组词，可继续或看完成结果」，需要计划跨日时再了解「任务按日生成，同一天为同一任务最多建一轮」。 | 代码证据 src/components/Review.jsx:7–24、28–45、59–78，src/data/repository.mjs:75–113，src/components/WordSession.jsx:17–29 |
| 「补充整理」做什么？ | 将所选词加入整理请求，去重后写入可随词汇备份带走的记录，手机当前动作没有即时生成释义。 | 代码证据 src/components/WordWall.jsx:390–401、474，src/data/repository.mjs:158–168、177 |
| 「记录本轮卡片状态」做什么？ | 有新翻阅或本轮标记时，写入带当前记忆状态的翻阅草稿并开启新的词墙快速轮，本轮标记之前已单独保存。 | 代码证据 src/components/WordWall.jsx:289–294、366–380、473，src/data/repository.mjs:146–155、169–175，src/card-reading-draft.mjs:1–37 |
| 「为当前选中单词设置复习轮」做什么？ | 把具备释义的已选词按名称保存为一轮，完成后留在词库，之后从复习记录进入。 | 代码证据 src/components/WordWall.jsx:276–285、479、484–487，src/data/repository.mjs:103–106，src/components/Review.jsx:63 |
| 「背诵筛选词」做什么？ | 取当前查询和筛选里有释义的词，立即打开复习会话设置，用户再确定词数和认义遍数并开始。 | 代码证据 src/components/WordWall.jsx:84、479，src/App.jsx:63、88，src/components/WordSession.jsx:8–10、62–66、83–84 |
| Fresh 适合什么场景？ | 推断：适合扫过一页且想先多看几页新词时使用，可把当前页后移最多三页，在原页码继续看换进来的词。 | 代码证据 src/components/WordWall.jsx:159–181，src/wall-navigation.mjs:28–51 |
| ChatGPTSettings 和 MobileAiReview 现在能用吗？ | 代码已接到 Android 插件的登录、状态、模型、推理与取消，并在正式题页支持保存和重读解析，网页能渲染状态和可用的历史解析，但不能开启远程解析。 | 代码证据 src/App.jsx:83、86–87，src/components/ChatGPTSettings.jsx:70–89，src/components/MobileAiReview.jsx:20–54，src/ai/client.mjs:3–25，android/app/src/main/java/cn/grestudy/vocabulary/MainActivity.java:9–13 |
| AI 成功还取决于什么？ | 需要 Android、有效的 ChatGPT 计划推理授权、可用模型、网络、已保存的逐题作答 ID 与符合手机/电脑共用解析规范的返回结构，代码盘点没有验证本机授权、套餐、实时额度或实际调用结果。 | 代码证据 src/components/MobileAiReview.jsx:20–44，src/ai/review.mjs:38–62，src/ai/login-flow.mjs:38–75，src/practice/repository.mjs:77–89 |

### 联网与账号

| 功能 | 联网和账号边界 | 证据 |
| --- | --- | --- |
| 词库、记忆标记、分组、复习、Fresh | 依赖本机数据与随安装包资源，可离线，无 App 账号依赖。 | 代码证据 src/useRepository.js:35–39，src/data/storage.mjs:13–34，src/data/repository.mjs:95–176，src/wall-navigation.mjs:15–36 |
| 刷题目录、题目正文与题图、草稿和提交、既有本地解析 | 随包题库与本地记录可离线，无 App 账号依赖，网页预览的资源由预览主机提供。 | 代码证据 src/practice/loader.mjs:3–39，src/practice/storage.mjs:9，src/practice/repository.mjs:63–135，src/components/MobileAiReview.jsx:20–23、50–54 |
| 导入、导出、恢复和撤回 | App 的本地文件操作无 ChatGPT 或 GitHub 账号依赖，所选 Android 文件提供方的云端能力由该提供方决定（推断）。 | 代码证据 src/data/storage.mjs:36–59，src/components/Settings.jsx:19–46、88，src/components/PracticeDataSettings.jsx:14–49 |
| 刷题记录交给电脑 Codex／GitHub | App 提供备份文件和说明，电脑导入与 GitHub 同步在 App 外进行。 | 代码证据 src/components/Settings.jsx:80，src/components/PracticeDataSettings.jsx:14–25、53，src/practice/repository.mjs:137–150 |
| 发音和来源链接 | 随包录音可离线，系统语音回落优先本地、联网语音依设备，打开版权与来源外链需外网。 | 代码证据 src/components/Pronunciation.jsx:7–29、33–39，src/pronunciation.mjs:3–14、18–59，src/pronunciation-native.js:10–26，android/app/src/main/java/cn/grestudy/vocabulary/PronunciationPlugin.java:69–86 |
| ChatGPT 授权、模型列表、发起/重做 AI 解析、管理额度 | Android 账号授权及在线请求依赖网络与可用计划，诊断文本本身只读取设备提供的白名单状态。 | 代码证据 src/ai/client.mjs:3–25，src/components/ChatGPTSettings.jsx:48–89，src/components/MobileAiReview.jsx:24–49，src/ai/diagnostics.mjs:8–31 |
| UI 音效、振动、阅读设置 | Web Audio 合成、设备振动和本地显示偏好，无账号或外网依赖。 | 代码证据 src/sound.mjs:1–3、294–330，src/wall-display.mjs:30–51，src/components/Practice.jsx:104–115、145–152 |

## 重复入口、无入口与演示占位

| 项目 | 正式情况与建议 | 证据 |
| --- | --- | --- |
| 主题快捷状态与完整筛选 | 记忆状态行适合快速动作，筛选弹层提供多条件，推断：保留两个层次，避免把状态数字再当一套重复说明。 | 代码证据 src/components/WordWall.jsx:427–434、487，src/components/WallSheets.jsx:12–30 |
| 词墙标记、分组、详情、Fresh 与撤销 | 手势与文字菜单承担快操作和可达性，细项见词库表，推断：保留可发现的菜单后备，不恢复常驻重复操作条。 | 代码证据 src/components/WordWall.jsx:320–358、460–486，src/components/WordTile.jsx:249 |
| 开轮路径 | 「为当前选中单词设置复习轮」「背诵筛选词」「设置复习任务」在入口和数据上分别对应单次建轮、立即开始和按日计划，推断：可统一语言与表单结构。 | 代码证据 src/components/WordWall.jsx:479，src/components/Review.jsx:60、69，src/components/WordSession.jsx:83–84 |
| 「管理任务」与轮次菜单中的「调整／取消所属任务」 | 两处可操作同一所属任务，轮次还独有改名、置顶、删除，推断：管理任务作主入口，轮次菜单放「查看所属任务」。 | 代码证据 src/components/Review.jsx:61、70–78 |
| 词墙操作提示与设置帮助 | 两处共用词墙手势说明，推断：保留词墙就近帮助，设置将其收进帮助。 | 代码证据 src/components/WallSheets.jsx:47–53，src/components/Settings.jsx:81，src/components/WordWall.jsx:485–489 |
| 词汇完整恢复与刷题合并 | 外观看似重复，实际事务与覆盖范围不同，推断：可集中到数据页并分别提示操作结果。 | 代码证据 src/components/Settings.jsx:43–46、83–88，src/components/PracticeDataSettings.jsx:40–49、55–67 |
| 词卡尺寸弹层、旧高度字段、开新快速轮 API | 正式 src 搜索仅有 SizeSheet 与 startQuickRound 定义，旧高度继续参与兼容读取，推断：盘点为无入口，不列为删 repository 的建议。 | 代码证据 src/components/WallSheets.jsx:40–44，src/data/repository.mjs:174，src/model.mjs:7，src/wall-navigation.mjs:21，src/components/Settings.jsx:57–67 |
| 老 Android 返回封装与可选刷题预览导航参数 | 正式 App 返回使用 useBack，现有 BottomNav 一律显式传 practice，native.js 的三个导出与 practicePreview 在正式 src 未发现调用，推断：作为未到达分支收录。 | 代码证据 src/native.js:5–15，src/useBack.js:18–27，src/App.jsx:36–37、90，src/components/Primitives.jsx:54–56 |
| 应用壳旧撤销提示 | App 的带撤销提示分支仍在，当前词墙标记绕开它，正式标记改用词墙自有反馈与撤销菜单，推断：后续可核对是否还有任何调用方传入撤销参数。 | 代码证据 src/App.jsx:42–44、52–59、70–74，src/components/WordWall.jsx:289–319、474–480 |
| 启动后静默刷新失败 | 词汇数据已有时，前台定时刷新失败写入 error，但启动错误页只在没有 state 时显示，推断：讨论已有数据显示是否需要低干扰的刷新状态。 | 代码证据 src/useRepository.js:22–26、43–50，src/App.jsx:29、66–69 |
| 全局深色、手动减动效和即时音色试听 | 正式仅设置词墙配色，词墙读系统减动效，音色选择器只配置声音，原型有手动减动效开关和切换即试听。 | 代码证据 src/App.jsx:49–50、90，src/components/Settings.jsx:49–68，src/components/WordTile.jsx:30–36，src/components/WallTrack.jsx:43，ui-redesign/prototype/src/c/main.jsx:1237–1251 |
| 候选 C 的「设置复习任务」和词库四项动作 | 任务设置仅提示沿用正式流程，词库的记录、补充整理、设置复习轮和背诵筛选词在原型只占位。 | 代码证据 ui-redesign/prototype/CLAUDE-REVIEW.md:332–346，ui-redesign/prototype/src/c/main.jsx:1139–1142 |
| 原型演示顺序、演示状态与重置 | 合成数据专用入口，正式启动只挂载 App。 | 代码证据 ui-redesign/prototype/CLAUDE-REVIEW.md:329–330，ui-redesign/prototype/src/c/main.jsx:1254–1258，src/main.jsx:5–9 |

## 候选 C 接入卡点与讨论项

| 范围 | 候选 C 实际覆盖 | 正式接入卡点与不可动的契约 | 可讨论的界面设计 | 证据 |
| --- | --- | --- | --- | --- |
| 复习列表 | 今日剩几轮、逾期标签、简短进度、折叠已完成、底部继续。 | 正式有按日任务和手动轮、紧急排序与置顶、四条分页与完成明细，现有任务/轮次投影及日生成契约继续沿用。 | 推断：讨论「今日还有 N 轮」如何纳入手动轮、跨日与到期词，以及默认继续哪轮。 | 代码证据 src/components/Review.jsx:7–24、49–78，src/data/review-tasks.mjs:99–111，src/data/repository.mjs:74–113，ui-redesign/prototype/src/c/main.jsx:1099–1156 |
| 复习管理 | 任务入口占位，原型未覆盖创建、调整、取消、改名、置顶或删除。 | 任务取消影响后续生成，删除仅移除该轮并保留证据，范围/词数/截止继续由现有 repository 校验。 | 推断：计划管理收进二级，轮次卡保留菜单与危险确认。 | 代码证据 src/components/Review.jsx:69–78，src/data/repository.mjs:103–142，ui-redesign/prototype/src/c/main.jsx:1139–1142 |
| 复习会话 | 演示翻释义、自评保存、继续和完成。 | 正式还有认义选项与自检、补全拼写、中文默写、答错重练、待结算、失败重试、续接及退出保护，保留已有阶段、幂等操作 ID 和落盘后进度。 | 推断：把主操作放在拇指区，测试键盘、错误和短屏下的剩余空间。 | 代码证据 src/components/WordSession.jsx:17–96，platform/shared/word-session.mjs:46，ui-redesign/prototype/src/c/main.jsx:565–577、1158–1197 |
| 刷题首页、目录与推荐 | 原型是原创「词义辨认」三选一，能切题和看例句翻译。 | 正式有四题型、目录/跳题、材料/单元筛选、恢复题位、同内容去重、上一题/下一题与题库加载校验。 | 推断：用 C 的排版和轻反馈组织正式页面，独立设计题型和导航层次。 | 代码证据 src/components/Practice.jsx:13–78、97–152、327–338，src/practice/loader.mjs:7–39，ui-redesign/prototype/src/c/main.jsx:1200–1230 |
| 刷题答题区、结果、AI | 原型画了选项和草稿保存提示，正式已使用切题音。 | 正式要覆盖多空、多选、填值、图片、RC 分屏/字号/选句、数学不横滑、保存/重做、旧记录/同内容做过、AI 授权与严格结果校验，保留草稿、计数、排期和题库契约。 | 推断：逐个画高密度题型、异常和已保存状态，校对题面、答题区优先级与缩放交互。 | 代码证据 src/components/Practice.jsx:125–136、216–245、252–305、338–387，src/components/MobileAiReview.jsx:20–54，ui-redesign/prototype/src/c/main.jsx:1200–1230 |
| 设置 | 原型有外观、圆点/填色、方向、音效/音色、触感、减动效、手势与演示重置。 | 正式还有字号上限、两套数据包及不同合并规则、升级/恢复快照、AI 授权/诊断、时区说明，外观偏好与 repository 偏好分别保存。 | 推断：讨论「显示与声音」「数据与备份」「AI 连接」「帮助」的分层及全局配色。 | 代码证据 src/components/Settings.jsx:48–88，src/components/PracticeDataSettings.jsx:14–68，src/components/ChatGPTSettings.jsx:70–89，src/App.jsx:46–50，ui-redesign/prototype/src/c/main.jsx:1234–1259 |
| 词库及共用反馈 | 主要词墙行为已接入，完整筛选和关系分组保留原行为，提示已进入布局。 | 保持 Fresh 在查询变化时重置、分组滑动、标记 rate()/undoQuickReview()、未释义限制、翻面阅读草稿及保存和刷新的区别。 | 推断：讨论入口、反馈文案和布局，继续遵守现有存储和事件契约。 | 代码证据 src/components/WordWall.jsx:133–182、289–315、369–381，src/data/repository.mjs:146–176，src/mobile.css:131–138，ui-redesign/prototype/CLAUDE-REVIEW.md:349–357 |

### 后续改版验收边界

| 场景 | 需要验证的行为 | 证据 |
| --- | --- | --- |
| 复习 | 同一轮的各阶段、保存失败后留在原步、刷新失败不重复作答、退出并续接、待结算及完成、任务取消或删除各自生效。 | 代码证据 src/components/WordSession.jsx:17–96，src/components/Review.jsx:69–78，ui-redesign/prototype/CLAUDE-REVIEW.md:353–357 |
| 刷题 | 草稿和提交失败的分支、跨单元切题、RC 选句及分屏、数学禁横滑、同内容和重做、题库校验失败与 AI 资格/格式/取消。 | 代码证据 src/components/Practice.jsx:97–152、216–245、252–305、339–388，src/practice/loader.mjs:7–39，src/components/MobileAiReview.jsx:24–54 |
| 设置 | 五种音色与主题生效、词汇完整替换可回退、刷题合并保留旧记录并阻挡冲突、Android 授权前后台和超时后的恢复操作。 | 代码证据 src/components/Settings.jsx:43–55、72–88，src/components/PracticeDataSettings.jsx:40–68，src/components/ChatGPTSettings.jsx:15–37、72–89，src/sound.mjs:125–132 |
| 词墙回归与真机 | 搜索返回原位、Fresh 及撤销、手势与系统返回/滚动互斥、相邻页 overflow: clip、普通滚轮/触控板/竖向滚动不串页、深浅色翻面、仅标记写入记忆事件。 | 代码证据 src/wall-track.css:1–32，src/components/WordWall.jsx:133–182、289–315，src/components/WordTile.jsx:234–244，ui-redesign/prototype/CLAUDE-REVIEW.md:353–357 |
