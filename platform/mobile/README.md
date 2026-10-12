# GRE 词库 · 离线 Android

独立的个人词库应用。首页是四列单词墙，采用用户确认的底部搜索/筛选布局；词组与多选采用同组相邻、绿色边框表示选择的设计。电脑平台的鼠标操作不改变。

## 使用与数据边界

- 轻触翻面，长按进入多选；多选时轻触切换选择，上下滑动只滚动。
- 支持两/三/四列、卡高和字号调整；词墙分页，跨组同一词按唯一词形标记。
- 三档记忆标记是用户自评，不等于词典核验或长期掌握；同轮改标不重复计次，整批操作可撤销。
- 手机数据独立保存在本机 SQLite。桌面网页预览使用 IndexedDB，仅用于开发，不与手机自动同步。
- 词条、关系、复习规则、字体和页面资源均随个人安装包离线携带。没有账号、远程 API、PDF 题库或 AI 连接。
- 导入词库与恢复完整备份是不同操作：前者保留已有手机进度；后者经过预览和确认后替换数据，并保留恢复前快照。
- 定期使用系统文件选择器把完整备份保存到应用外。应用内快照不能抵御卸载、清除数据、设备损坏；卸载前务必外部备份。
- 首版不自动合并电脑和手机分别产生的进度。安装包若内置个人词库及历史，仅供本人使用，不对外分发。

## 开发

从仓库根目录执行：

```powershell
npm install
npm --prefix platform/mobile install
node platform/mobile/scripts/export-vocabulary.mjs
npm --prefix platform/mobile run dev
```

预览默认使用 `http://127.0.0.1:4174`，与电脑学习平台的 `4173` 分离。首次读取内置词汇种子，之后优先读取本地已保存数据；重新构建不应覆盖学习进度。

```powershell
npm --prefix platform/mobile test
npm --prefix platform/mobile run build
npm --prefix platform/mobile run android:build
```

Android SDK、JDK 与 Gradle 的具体要求以锁定的 Capacitor 版本和构建脚本为准。SDK 安装须接受 Google 官方许可；仅为构建会话设置工具路径，不修改系统级环境变量。

当前锁定 Capacitor 8.5.3，使用完整 JDK 21、Android SDK / Build Tools 36 和 Gradle 8.14.3。在本机 Codex 的 MSIX 运行环境中，Java 的本地管道有兼容性问题，已验证以下构建命令（只影响当前进程，不改全局配置）：

```powershell
./platform/mobile/scripts/build-android.ps1 -UseTcpSelectorWorkaround -JavaHome 'C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot'
```

首次在未配置 SDK 的电脑构建，需要在了解 Google SDK 许可后显式添加 `-InstallTools -AcceptSdkLicense`。工具默认保存于 `%LOCALAPPDATA%/GREVocabBuild/`；本机已按用户授权完成安装。构建脚本会先校验导出词库与桌面投影一致，再打包并验证 APK 签名。

## 安装与升级

将生成的 APK 传到安卓手机并由系统安装器打开；系统可能要求给当前文件管理器授予“安装未知应用”权限。只对本人确认的安装包执行此操作，不关闭系统整体安全防护。

安装包输出为 `platform/mobile/releases/GRE-vocabulary-0.1.0-debug.apk`。系统最低 Android 7.0（API 24），同时需要 Android System WebView 111 或更高版本；老系统若无法更新 WebView，可能无法使用。应用不申请联网或共享存储权限，文件导入导出通过 Android 系统文件选择器完成。

开发预览 APK 与正式发布签名需要区分。后续覆盖升级必须使用相同包名和签名，版本号需递增；签名不一致时不要直接卸载旧版，先导出备份。签名密钥、SDK、Gradle 缓存、生成 APK 和含个人数据的种子均不提交 Git。

本机预览签名保存在 `%LOCALAPPDATA%/GREVocabBuild/android-private/debug.keystore`，应妥善保留以支持后续覆盖安装，不要公开或提交。JSON 备份没有加密，包含个人词库和学习记录，只存放到自己信任的位置。

首版已完成浏览器触控模拟、数据回归、Android 编译和静态检查；当前没有连接安卓设备，原生 SQLite 与系统文件选择器的设备端测试仍待真机执行。建议首次安装后开启飞行模式，完成一次标记、退出重开和外部备份，确认手机上的保存链路。

## 模块边界

- `src/components/`：单词墙、筛选/详情面板、多阶段复习及数据管理。
- `src/data/`：数据包校验、事件投影、原子存储与备份恢复。
- `scripts/export-vocabulary.mjs`：从仓库生成词汇专用种子，不把题目或凭据打包。
- `android/`：离线 WebView 壳、SQLite 持久化、系统文件导入/导出。
- `../shared/` 与词汇相关纯投影模块：沿用电脑端的复习语义。

测试只使用隔离存储或临时数据；不得向 `platform/events/` 写入测试回忆。
