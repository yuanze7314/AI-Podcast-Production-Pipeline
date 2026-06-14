# Decision Log: 微信读书书籍 PDF 播客化 Agent

## 2026-06-12

- 决定产品形态为本地单机版 Web 工作台。
- 决定 MVP 需要项目管理和历史任务列表。
- 决定技术方向为 FastAPI + React + SQLite + 本地文件存储 + Workflow/Agent 编排。
- 决定人工审核重点放在章节脚本；章节切分和章节分析以报告验收为主。
- 决定上传后必须有目录确认页，支持改章节名、合并章节、删除章节。
- 决定章节分析报告需要支持单章重跑。
- 决定脚本按对话轮次分块编辑，以适配火山/豆包 TTS 结构。
- 决定 TTS 前必须人工确认脚本。
- 决定开场、章节转场、结尾均需生成且可编辑。
- 决定 Agent 分工不做过度细碎化：确定性工程处理进入 Workflow，认知型任务进入 Agent。
- 决定 Agent 层包含 CommentInsightAgent、ChapterAnalysisAgent、PodcastPlanAgent、ScriptWriterAgent、ScriptReviewAgent。
- 决定 Alice 是主持人位，Dr_Ye 是同等地位的建议型朋友位；具体语气随书籍类型动态设定。
- 决定每章目标 3-4 分钟，完整播客目标约 30 分钟；当章节过多时由 PodcastPlanAgent 进行全书时长预算分配。
- 决定 MVP 必须支持扫描版 PDF，不再把 OCR 放到 v2；解析流程采用文本层检测优先、扫描版 OCR fallback。
- 决定 PDF 章节结构识别不能只靠正则或单一路径，必须融合目录页候选、正文标题候选、小标题候选、页码位置和置信度，并通过目录确认页让人工验收。
- 决定 OCR/结构解析主方案待评测：优先比较 PaddleOCR / PP-Structure 与 MinerU，Tesseract 作为轻量 fallback 候选。
- 决定 v0.1 直接接入真实 LLM 和真实火山/豆包 TTS，不采用 mock-only 闭环；但仍需保留可重跑、错误日志和成本控制。
- 决定 v0.1 LLM 使用 DeepSeek OpenAI-compatible API，base_url 为 `https://api.deepseek.com/v1`，模型为 `deepseek-v4-pro`，temperature 为 `0.7`，max_tokens 为 `5048`。
- 决定 v0.1 TTS 使用火山/豆包 Podcast TTS WebSocket，输出 mp3，sample_rate 为 `24000`；Alice 声线为 `zh_female_mizaitongxue_v2_saturn_bigtts`，Dr_Ye 声线为 `zh_male_dayixiansheng_v2_saturn_bigtts`。
- 决定所有 API key、access token、app key 等密钥只进入 `.env` 或本地配置存储，不写入文档、日志、测试输出或前端 bundle。
- 决定火山/豆包播客 TTS 使用 `action=3`：按章节一次提交整段 `nlp_texts` 对话数组，服务端按 round 返回音频事件；内部仍按脚本块保存，TTS 打包时将 `Alice` / `Dr_Ye` 映射为对应 voice_id。
- 决定补充目标架构：Workflow 执行层 + Agent 调度层 + 分类型 Agent Team + Review & Revision + Audio Production，详见 docs/ARCHITECTURE-MULTI-AGENT.md。
- 待确认：Book Profiler / Podcast Router / Typed Agent Team 是否立即插入当前 v0.1 Stage 3 之前，还是作为 Stage 2.5 / v0.2 在单章 TTS 闭环后实现。
- 决定新增 Reader Insight Agent / 读者洞察 Agent：位于 G1 目录确认之后、Book Profiler 之前，负责从高赞评论、笔记、划线中提炼读者需求、情绪基调、真实案例和脚本机会点。
- 决定 Reader Insight Agent 是全局内容理解 Agent，不属于某个 Typed Agent Team；其输出供 Book Profiler、Podcast Router、Typed Analysis/Script/Review Agents 使用。

## 2026-06-13

- 决定火山/豆包 Podcast TTS WebSocket 以官方 Podcast API WebSocket v3 协议为准：生成 podcast 阶段直接发送 StartSession 事件帧，不再使用旧规划中的 StartConnection / ConnectionStarted / FinishSession 流程。
- 决定 TTS WebSocket 上行 StartSession 帧采用 4-byte header + event code + session_id length + session_id + payload length + payload 的二进制结构；上行 message type 使用 `0b0001`，event flag 使用 `0b0100`。
- 决定 TTS payload 在 WebSocket 传输时使用 ASCII JSON 转义，以避免 Windows 本地管道或终端编码导致中文内容被替换为问号。
- 决定 Stage 4 最小闭环以单章 MP3 生成为验收标准，先记录 request、event log、output_path、rounds_finished 和失败原因；断点续传 retry/resume 作为后续增强。
- 决定先接入 OCR provider 抽象和 PyMuPDF OCR fallback 边界，作为扫描版 PDF 的最小工程闭环；最终 OCR provider 仍需在 Tesseract、PaddleOCR / PP-Structure、MinerU 之间评测后确定。
- 当前 OCR 环境诊断结果：PyMuPDF OCR API 可用，但本机未安装 Tesseract runtime / 中文语言包，因此 PyMuPDF OCR provider 暂未 ready。

## 2026-06-14

- 决定当前 OCR 只采取轻量路线：PyMuPDF OCR + Tesseract + `chi_sim+eng`，暂不引入 PaddleOCR / PP-Structure / MinerU。
- 决定 Tesseract 中文语言包使用纯 ASCII 路径 `E:\agent-tools\tessdata`，避免 Tesseract 在含中文项目路径下加载 traineddata 失败。
- 轻量 OCR 验证结果：`test-output/scanned-sample-12p.pdf` 12 页扫描样本解析成功，source_type 为 `pymupdf_ocr`，抽取 6009 字，识别前 2 章；标题存在少量 OCR 错字，后续必须保留目录确认和人工验收。
- 决定目录确认最小实现先支持章节标题和起止页修订；保存后将章节 `source` 标记为 `human_reviewed`，并将置信度提升到 `0.98`，用于后续 Agent 生成前的人工验收信号。
- 决定章节结构操作先采用轻量确定性实现：新增章节按页码抽取 PDF/OCR 文本，删除章节直接移除并重排章号，合并操作仅支持“当前章 + 下一章”，合并后标记为 `human_merged`。
- 决定为提速暂缓低置信章节筛选、章节结构操作风险提示、批量生成、全集音频和 Stage 2.5 自适应多 Agent；当前优先真实 API 单章主链路。
- 决定新增真实 API 一键脚本流水线，将 DeepSeek analysis / plan / script 串成一个后端接口，前端保留单步按钮但主推一键生成脚本。
- 决定扫描 PDF MVP 验收以真实单章主链路为准：OCR 章节确认后，必须能真实生成 DeepSeek 脚本并通过火山/豆包生成单章 MP3；已用扫描 PDF 第 1 章完成验证。
- 决定当前轻量路线的主入口为“生成单章播客”：后端串联 DeepSeek analysis / plan / script、脚本确认和火山/豆包 TTS；如果前序步骤已有产物，则复用最新 analysis / plan / script，从中断点继续，避免真实 API 失败重跑时重复消耗。
- 决定当前自用阶段跳过真实链路稳定性增强，不优先做复杂错误恢复和重试 UI；下一步优先建设分章节任务列表和多章节批量脚本生成，为整本书生产铺路。
- 决定多章节批量能力先只做脚本生成，不自动确认、不自动 TTS；默认跳过已有脚本章节，并复用已有 analysis / plan，避免覆盖人工编辑内容和重复消耗 LLM。
- 决定多章节批量音频只处理已确认脚本章节，不自动生成脚本、不自动确认脚本；默认跳过已有成功 MP3 的章节，避免重复消耗火山/豆包 TTS。
- 决定全集音频合成先采用轻量 MP3 顺序拼接，不引入 ffmpeg 转码；保留分章节 MP3，同时在项目 `full-audio` 运行产物目录写入 `manifest.json` 记录来源章节和输出文件。
- 决定交付体验整理只支持分章 MP3 ZIP 导出和全集 MP3 导出，不做复杂产物中心、说明页或多格式导出。
- 决定内容质量升级先实现 Reader Insight Agent 和 Book Profiler Agent，并将 latest reader_insight / book_profile 注入章节 analysis / plan / script；暂缓 Podcast Router 和 Typed Agent Team。
- 决定不开发“全书时长预算：章节过多时自动压缩重点章节”，避免当前自用轻量路线复杂化。
- 决定 Script Review Agent 只产出结构化审核报告，不自动改写脚本、不覆盖锁定脚本块；用户根据报告人工修改。
