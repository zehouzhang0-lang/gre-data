# 英美音标与发音来源核实

核对日期：2026-10-18（Asia/Kuala_Lumpur）。基于手机版 0.1.8，实现于 0.1.9。以下前期方案保留研究依据；实际交付以末尾实施记录、pronunciation.json 的 coverage 和 README 验证结果为准。

## 用户范围

仅在单词详情页增加英式 IPA、美式 IPA 和各自对应的播放按钮。保留现有词义、关联词组、例句和学习记录；无新增练习、评分、跟读、录音、自动播放或设置页。用户允许缺真人录音时采用联网声音或合成语音。任何收费服务须先告知，不自动注册、购买或开通计费。

## 来源核实

| 来源 | 可用内容 | 离线与费用结论 | 限制 |
| --- | --- | --- | --- |
| English Wiktionary | 按口音标注的 IPA | 文本按 CC BY-SA 4.0 等条款可复用；保存来源、修订、署名和许可 | 社区词典，不冒充 Oxford 或 ETS；全库覆盖尚未测量，逐词核对词性、口音与异读 |
| Wikimedia Commons / Lingua Libre 录音 | 真人单词录音 | 仅选逐文件确认许可允许复用的内容；按原作者、文件页和许可署名 | 不能把英语录音默认当作英式或美式；并非每词两种口音齐全；仍需试听 |
| Oxford Dictionaries API | IPA 与词典录音 | 官方 FAQ 明确离线缓存需 Enterprise 许可；未取得报价或许可，不纳入免费内置方案 | 网页可试听不等于可批量保存、离线分发 |
| Android TextToSpeech | 系统引擎的合成发音 | 应用调用系统接口，不接入按次收费的云 API；可区分离线与需联网的声音 | 接口并不保证设备装有 en-GB/en-US 语音；引擎服务条件及流量取决于设备，不能承诺所有手机零配置可用 |
| Kokoro-82M | 本地生成英美合成音频 | 模型权重 Apache-2.0，可在本机生成，无云调用费 | 已用于 0.1.9；作者明确列出短语音弱项，自动抽查不能替代全库人工试听 |
| Azure Speech F0 | 在线神经合成 | 官方页面列出每月 50 万字符免费额度 | 需要资源/凭据；免费额度不等于无限免费服务。未开通、未产生费用，非默认路线 |

## 具体证据与来源

- Wiktionary 文本许可：https://en.wiktionary.org/wiki/Wiktionary:Copyrights
- Commons 逐文件许可及复用要求：https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
- equivocal 页面有 UK/US IPA，录音标为 Southern England：https://en.wiktionary.org/wiki/equivocal
- belie 页面有 RP/General American IPA，录音标为 US：https://en.wiktionary.org/wiki/belie
- equivocal 录音的搜索索引标注 CC BY-SA 4.0，但文件详情抓取失败，尚未完成文件许可及声音核验，不可视为已验收素材：https://commons.wikimedia.org/wiki/File:LL-Q1860_(eng)-Vealhurl-equivocal.wav
- Oxford 缓存条件：https://developer.oxforddictionaries.com/faq
- Android TTS 初始化、可用语言和播放接口：https://developer.android.com/reference/android/speech/tts/TextToSpeech
- Android 声音口音与联网属性：https://developer.android.com/reference/android/speech/tts/Voice
- Kokoro 模型卡及许可证：https://huggingface.co/hexgrad/Kokoro-82M
- Kokoro 英美声音及短语音限制：https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- Azure 价格与 F0 配额：https://azure.microsoft.com/en-us/pricing/details/speech/

## 已采用的实现路线

音标作为只读发音资源，保留来源证据，与手机学习数据库分离；核实不到的音标不以模型输出冒充词典音标。同形异音须对应词性/义项，不将一段音频重复标成两种口音。

播放顺序：已许可且成功下载的本地真人录音 → 内置英美合成音频。对于后来加入、无内置资源的词，调用设备中口音匹配的 Android TTS（优先离线，其次引擎提供的联网声音）；未接入第三方网页搜索或未授权热链。播放有明确超时，关闭详情和切换口音会取消上一段。

现有全词库的英美音频覆盖和文件完整性由构建脚本与 APK 实物校验，最终计数见 pronunciation.json。合成音质不宣称已人工逐词验收。后来新增的词如果系统无匹配声音且网络不可用，不谎报播放成功或用另一口音冒充。

界面只保留两行 IPA 与两个按钮。合成来源以简短标识说明，许可与署名放入已有收录来源区域，不新增页面或功能入口。点击一次播放一次，切换词、关闭详情或播放另一口音时停止上一段。

线上查音仅发送所点词及口音，不发送学习历史。播放不产生 vocab_card_reading、vocab_recall 或其他学习事件。实现后用隔离存储验证旧库、翻阅次数/时间/印象、未完成轮次和备份恢复不变；沿用包名与签名覆盖升级。

## 验证范围

- 已通过源码测试、隔离旧库升级、来源筛选和自动音频抽查；最终发布另核验 APK 音频资源与签名。
- 未连接用户手机，原生播放、系统联网语音和实际覆盖安装需真机检验。
- 不把孤立词 ASR 转写等同于人工音质验收。

当前费用：未购买或调用收费服务；本轮未产生语音 API 费用。

## 0.1.9 实施记录

- 免费公开整包：`https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz`，2026-09-02 dump；下载后仅在本地筛选 2802 个词形。缓存含整包哈希；IPA 原文、词性、口音标签和 Wiktionary 来源随只读清单保存，按 CC BY-SA 4.0 署名。缺明确依据时留空，不把 G2P 输出标为词典音标。
- 用户随后明确授权向 Kaikki／Wikimedia 发送词形和口音，以查询来源、许可、下载录音；释义、笔记和进度不发送。Commons 批量 imageinfo/extmetadata 确认每文件作者与自由许可；音频服务器返回 HTTP 429 时停止请求，不使用代理绕过限流。
- Kokoro-82M Apache-2.0 模型和官方 ONNX 发布在本地 CPU 运行，英 bf_emma／美 af_heart；模型不打进 APK，仅携带生成的 MP3。词典 IPA 保留原文，生成输入单独处理连音符、音节辅音及重音位置，匹配引擎把重音放在元音前的约定。没有云调用费。
- 原例句、释义和分类未重新生成。发音按钮仅播放单词；未添加录音、跟读评分、自动播放、训练或账户。
- 后来新加且未打包的单词通过 Android TTS 同口音声音回退；优先离线，引擎有对应联网声音时允许使用。全无同口音声音时提示安装系统英语语音，不宣称任何新词在任意设备都保证可播。系统引擎服务／流量由设备决定，本应用没有计费 API 或凭据。
- 抽查使用本地 Whisper tiny 与音频结构检查；孤立罕见词自动转写可能误识别，不能视为人工逐词音质验收。尚未连接用户手机，浏览器实际操作也被 URL 策略阻止。

重音转换参考模型官方前端：https://github.com/hexgrad/misaki/blob/main/misaki/en.py 。运行时依赖未增加语音付费 SDK，所有生成工具只用于本机构建。
