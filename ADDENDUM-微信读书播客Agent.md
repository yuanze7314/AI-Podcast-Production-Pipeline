---
title: 微信读书书籍 PDF 播客化 Agent Addendum
status: draft
created: 2026-06-12
updated: 2026-06-12
---

# Addendum: 技术方向与 Agent / Workflow 设计

## 技术栈决策

MVP 采用本地单机 Web 工作台：

- 后端：Python + FastAPI
- 前端：React + Vite
- 数据库：SQLite
- 本地存储：项目目录保存 PDF、分析 JSON、脚本 JSON、音频、日志
- PDF 处理：文本层检测优先使用 PyMuPDF / pdfplumber / pdf-parse；扫描版 OCR 主方案在 PaddleOCR / PP-Structure、MinerU 中评测选择，Tesseract 作为轻量 fallback 候选
- LLM 编排：轻量 Workflow 优先，保留 LangGraph 作为复杂状态编排候选
- 音频处理：ffmpeg / pydub
- 配置：本地 `.env` + Web 配置页

## v0.1 外部服务接入

### LLM

v0.1 直接接入真实 DeepSeek API，不采用 mock-only 闭环。

- Provider: DeepSeek
- API shape: OpenAI-compatible
- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-v4-pro`
- Temperature: `0.7`
- Max tokens: `5048`
- Secret handling: `api_key` 仅允许保存在 `.env` 或本地加密/本地配置存储中，不写入 PRD、日志、测试输出或前端 bundle。

### TTS

v0.1 直接接入火山/豆包 Podcast TTS WebSocket。

- Provider: `volcengine_doubao`
- Interface: `podcast_tts_websocket`
- Endpoint: `wss://openspeech.bytedance.com/api/v3/sami/podcasttts`
- Resource ID: `volc.service_type.10050`
- Action: `3`
- Encoding: `mp3`
- Sample rate: `24000`
- Speech rate default: `0`
- Emotion default: `null`
- Secret handling: `app_id`、`access_token`、`app_key` 仅允许保存在 `.env` 或本地配置存储中，不写入 PRD、日志、测试输出或前端 bundle。

#### Podcast TTS action=3 request model

火山/豆包播客模型的 `action=3` 用于“根据对话文本直接生成播客”。该模式不是按 speaker 单独调用普通 TTS，而是一次请求提交整段对话数组，由服务端按 round 返回音频事件。

请求 payload 的核心结构：

```json
{
  "input_id": "podcast_001_chapter_001",
  "action": 3,
  "use_head_music": false,
  "use_tail_music": false,
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000,
    "speech_rate": 0
  },
  "nlp_texts": [
    {
      "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts",
      "text": "这一章最打动我的地方，是蛤蟆终于承认自己不太好了。"
    },
    {
      "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts",
      "text": "是的，而且这里的关键不是情绪低落本身，而是他开始愿意面对它。"
    }
  ],
  "speaker_info": {
    "random_order": false
  }
}
```

服务端事件流要点：

- StartSession: client event `100`
- SessionStarted: server event `150`
- PodcastRoundStart: server event `360`，payload 包含当前 round 的 speaker、round_id、text
- PodcastRoundResponse: server event `361`，音频二进制数据
- PodcastRoundEnd: server event `362`，payload 包含 audio_duration 等
- UsageResponse: server event `154`，payload 包含 token 用量
- PodcastEnd: server event `363`，可能包含完整音频 URL 等元信息
- SessionFinished: server event `152`，表示会话结束
- FinishConnection: client event `2`

协议实现说明：

- 按火山/豆包 Podcast API WebSocket v3 文档，生成 podcast 阶段不需要客户端发送 StartConnection。
- StartSession 使用二进制事件帧：4-byte header + event code + session_id length + session_id + payload length + payload。
- 上行事件帧 message type 使用 `0b0001`，event flag 使用 `0b0100`。
- payload JSON 发送时使用 ASCII 转义，避免 Windows 本地编码影响中文内容。

实现要求：

- 内部脚本块继续按轮次保存，便于编辑、锁定和审核。
- TTS 打包时按脚本块顺序生成一个 `nlp_texts` 数组，一次提交给播客 TTS。
- `speaker` 字段传火山声线 ID，而不是 `Alice` / `Dr_Ye` 逻辑名。
- 每个 `PodcastRoundStart` / `PodcastRoundEnd` 应回写到本地任务日志，用于定位失败轮次。
- 若中途失败，记录 `task_id`、`last_finished_round_id`，为后续 retry/resume 预留。

### Voice Mapping

- Alice: `zh_female_mizaitongxue_v2_saturn_bigtts`
- Dr_Ye: `zh_male_dayixiansheng_v2_saturn_bigtts`

## 内部脚本块 Schema 草案

脚本块是 LLM 输出、前端编辑和 TTS 请求转换之间的稳定中间层。LLM 不直接输出火山接口原始请求，而是输出内部 schema，由 `package_tts_request` 将一章内的多个脚本块合并为一次 `action=3` 请求。

```json
{
  "id": "block_001",
  "project_id": "project_001",
  "chapter_id": "chapter_001",
  "block_index": 1,
  "speaker": "Alice",
  "speaker_role": "host",
  "text": "这一章最打动我的地方，是蛤蟆终于承认自己不太好了。",
  "voice_id": "zh_female_mizaitongxue_v2_saturn_bigtts",
  "tts_params": {
    "encoding": "mp3",
    "sample_rate": 24000,
    "speech_rate": 0,
    "emotion": null
  },
  "estimated_seconds": 8,
  "locked": false,
  "status": "draft",
  "source_refs": [
    {
      "type": "chapter_analysis",
      "id": "analysis_001",
      "note": "章节核心情绪"
    }
  ],
  "review": {
    "role_drift": false,
    "schema_valid": true,
    "issues": []
  }
}
```


## Adaptive Multi-Agent Production

目标架构见 `docs/ARCHITECTURE-MULTI-AGENT.md`。该架构引入：

- Reader Insight Agent：生成 `reader_insight.json`，提炼读者评论、笔记、划线中的情绪基调、真实案例、读者困惑和脚本机会点。
- Book Profiler Agent：生成 `book_profile.json`，结合 PDF 解析结果和 `reader_insight.json` 判断书籍类型和内容特征。
- Podcast Router Agent：生成 `podcast_strategy.json`，选择播客模式和 Agent Team。
- Agent Team Composer：MVP 可用规则映射，将播客模式映射到 Concept / Narrative / Research Team。
- Typed Agent Team：每类 Team 包含 Analysis Agent、Script Agent、Review Agent。
- Review & Revision Layer：Review Agent 输出 revision issue，Workflow 触发局部重写。
- Human Gates：G1 目录确认、G2 书籍类型确认、G3 播客策略确认、G4 脚本确认、G5 音频确认。

当前已实现的通用 `ChapterAnalysisAgent / PodcastPlanAgent / ScriptWriterAgent` 视为 v0.1 baseline。类型化 Agent Team 引入后，通用 Agent 可作为 unknown/mixed 类型 fallback。

待确认：是否立即把 Reader Insight / Book Profiler / Podcast Router 插入当前 Stage 3 之前，还是在单章 TTS 闭环后作为 Stage 2.5 / v0.2 实现。

2026-06-14 实施状态：已按轻量路线实现 Reader Insight Agent、Book Profiler Agent 与轻量 Script Review Agent，并将 latest `reader_insight` / `book_profile` 注入章节 analysis / plan / script 生成上下文。Script Review Agent 只输出审核报告，不自动改写脚本。Podcast Router、Typed Agent Team、自动 Review & Revision 暂缓；明确不开发全书时长预算 / 章节过多自动压缩重点章节。

## 设计原则

确定性工程处理进入 Workflow，需要判断、提炼、规划、创作和审核的任务进入 Agent。避免把 PDF 解析、TTS 封装、音频合成等稳定工程步骤过度 Agent 化。

## Workflow 层

- `ingest_pdf`：保存 PDF 和项目输入。
- `detect_pdf_text_layer`：检测 PDF 是否存在可用文本层，输出页数、可提取字符数、抽样文本质量和是否需要 OCR。
- `parse_pdf_text_layer`：对带文本层 PDF 提取文本、页码、目录候选和解析报告。
- `ocr_scanned_pdf`：对扫描版 PDF 执行页面转图片、图像预处理、OCR 和版面结构解析。
- `merge_structure_candidates`：融合目录页候选、正文标题候选、小标题候选、页码位置和置信度，生成候选章节结构。
- `confirm_toc`：持久化用户确认后的章节结构。
- `extract_chapter_text`：根据章节结构生成章节正文片段。
- `validate_json`：校验 Agent 输出 schema。
- `package_tts_request`：把已确认的章节脚本块按顺序转换为火山/豆包 Podcast TTS `action=3` 请求结构，其中 `Alice` / `Dr_Ye` 映射为对应 voice_id，生成 `nlp_texts` 数组。
- `run_tts`：执行分章节 TTS，记录状态、错误和成本。
- `merge_audio`：合并开场、章节、转场、结尾为完整音频。
- `retry_failed_task`：按步骤或章节重跑失败任务。

## Agent 层

### ReaderInsightAgent

输入：高赞评论、个人读书笔记、划线、章节标题、可选章节正文摘要、目标听众。

输出：`reader_insight.json`，包含整体情绪基调、读者痛点、高共鸣主题、读者问题、真实案例、亮点句、争议点、脚本机会点和 `empty_input` 标记。

定位：ReaderInsightAgent 是全局内容理解 Agent，不属于某个 Typed Agent Team。它在 G1 目录确认之后运行，输出供 Book Profiler、Podcast Router、Typed Analysis Agent、Typed Script Agent 和 Typed Review Agent 使用。

### ChapterAnalysisAgent

输入：章节正文、目录结构、可选全书上下文。

输出：主题、核心观点、关键论证、可播客化问题、风险点、适合对话展开的角度。

### PodcastPlanAgent

输入：目录、章节分析、评论洞察、目标总时长、每章默认时长、角色原则。

输出：整书播客基调、每章时长预算、章节对话目标、案例/亮点融入计划、Alice/Dr_Ye 动态人设、开场/转场/结尾策略。

这是 MVP 的 Agent 中枢。

### ScriptWriterAgent

输入：单章策划、章节分析、评论洞察引用、人设约束、TTS schema 约束。

输出：按轮次拆分的 Alice / Dr_Ye 对话脚本块。

### ScriptReviewAgent

输入：脚本块、章节分析、播客策划、人设约束、schema。

输出：结构化审核报告，包括角色漂移、schema 错误、章节遗漏、对话自然度、时长超标和修复建议。

## 推荐数据模型草案

- `projects`: id, title, book_title, status, created_at, updated_at, root_path
- `project_configs`: project_id, llm_config_ref, tts_config_ref, prompt_config, voice_config
- `chapters`: id, project_id, index, title, page_start, page_end, text_path, status
- `document_parse_runs`: id, project_id, provider, source_type, status, pages, extracted_chars, quality_score, report_path, error_message, created_at
- `structure_candidates`: id, project_id, type, title, subtitle, page_start, page_end, confidence, source, raw_json_path
- `analysis_reports`: id, project_id, chapter_id, type, content_json, status, updated_at
- `podcast_plans`: id, project_id, content_json, total_duration_target, status
- `script_blocks`: id, project_id, chapter_id, block_index, role, text, voice_id, tts_params_json, estimated_duration, status, locked
- `tts_tasks`: id, project_id, chapter_id, status, request_json, output_path, cost_estimate, error_message
- `audio_outputs`: id, project_id, type, chapter_id, path, duration, created_at

## 初步页面结构

- 项目列表页
- 项目创建页
- 项目详情 / 流程总览页
- 目录确认页
- 评论洞察报告页
- 章节分析报告页
- 播客策划页
- 脚本编辑页
- TTS 与音频导出页
- 配置页

## 主要技术风险

- 扫描版 PDF OCR 是 MVP 核心风险，需要先评测 PaddleOCR / PP-Structure 与 MinerU 在真实中文书籍上的章节标题、小标题、正文顺序和 Markdown/JSON 输出质量。
- PDF 章节识别不稳定，需要“目录页候选 + 正文标题候选 + 页码位置 + 置信度 + 人工确认页”兜底。
- 带文本层 PDF 也可能存在 OCR 错字和漏章，例如正文章标题可能和目录页不一致，需要候选融合而非单一路径。
- Agent 输出 JSON 不稳定，需要 schema 校验、修复重试和错误可视化。
- 角色漂移，需要人设约束注入和 ScriptReviewAgent 检查。
- 章节质量不一致，需要 PodcastPlanAgent 统一全书基调和章节目标。
- TTS 成本高，需要 TTS 前强制确认、章节级重跑和成本估算。
- 长文本上下文过大，需要按章节处理，并保留全书级摘要/策划作为共享上下文。



