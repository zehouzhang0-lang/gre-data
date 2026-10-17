# 英美音标与发音来源核实

核对日期：2026-10-18（Asia/Kuala_Lumpur）。基于手机版 0.1.8。本记录仅完成来源、费用和方案核实，尚未导入全库音标、下载录音、实现播放器或生成新版 APK。

## 用户范围

仅在单词详情页增加英式 IPA、美式 IPA 和各自对应的播放按钮。保留现有词义、关联词组、例句和学习记录；无新增练习、评分、跟读、录音、自动播放或设置页。用户允许缺真人录音时采用联网声音或合成语音。任何收费服务须先告知，不自动注册、购买或开通计费。

## 来源核实

| 来源 | 可用内容 | 离线与费用结论 | 限制 |
| --- | --- | --- | --- |
| English Wiktionary | 按口音标注的 IPA | 文本按 CC BY-SA 4.0 等条款可复用；保存来源、修订、署名和许可 | 社区词典，不冒充 Oxford 或 ETS；全库覆盖尚未测量，逐词核对词性、口音与异读 |
| Wikimedia Commons / Lingua Libre 录音 | 真人单词录音 | 仅选逐文件确认许可允许复用的内容；按原作者、文件页和许可署名 | 不能把英语录音默认当作英式或美式；并非每词两种口音齐全；仍需试听 |
| Oxford Dictionaries API | IPA 与词典录音 | 官方 FAQ 明确离线缓存需 Enterprise 许可；未取得报价或许可，不纳入免费内置方案 | 网页可试听不等于可批量保存、离线分发 |
| Android TextToSpeech | 系统引擎的合成发音 | 应用调用系统接口，不接入按次收费的云 API；可区分离线与需联网的声音 | 接口并不保证设备装有 en-GB/en-US 语音；引擎服务条件及流量取决于设备，不能承诺所有手机零配置可用 |
| Kokoro-82M | 本地生成英美合成音频 | 模型权重 Apache-2.0，可在本机生成，无云调用费 | 作者明确列出短语音弱项；必须先做孤立单词、罕见词和异读试听验证，当前未选定为生产模型 |
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

## 建议实现路线

音标作为只读发音资源，保留来源证据，与手机学习数据库分离；核实不到的音标不以模型输出冒充词典音标。同形异音须对应词性/义项，不将一段音频重复标成两种口音。

播放顺序：已核验的本地真人录音 → 已确定来源且口音相符的 HTTPS 在线录音 → 已试听核验的内置英美合成音频。对于后来加入、无内置资源的词，再调用设备中口音匹配的 Android TTS（可用的离线或联网声音）。网络来源使用预先核对的索引，不在点击时搜索未知网站。线上失败必须有明确超时并继续回退，不无限等待。

为现有全词库每词准备英美备用音频是交付目标，目前尚未验证覆盖率或音质，不能据本轮来源核实宣布已实现“所有单词有声音”。合成模型还需样本验收。系统无匹配声音且网络不可用时，不谎报播放成功或用另一口音冒充。

界面只保留两行 IPA 与两个按钮。合成来源以简短标识说明，许可与署名放入已有收录来源区域，不新增页面或功能入口。点击一次播放一次，切换词、关闭详情或播放另一口音时停止上一段。

线上查音仅发送所点词及口音，不发送学习历史。播放不产生 vocab_card_reading、vocab_recall 或其他学习事件。实现后用隔离存储验证旧库、翻阅次数/时间/印象、未完成轮次和备份恢复不变；沿用包名与签名覆盖升级。

## 实施前仍需验证

- 全库 IPA、明确英美口音真人音频的覆盖数量与逐文件许可。
- 免费合成模型的短词音质、重音、异读及与显示 IPA 的一致性；失败项修正或换引擎。
- 在线文件在目标手机网络中的可达性、超时回退与 Android 实际语音可用性。
- 音频文件体积、离线资源打包与引用完整性。

当前费用：未购买或调用收费服务；本轮未产生语音 API 费用。
