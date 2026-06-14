# Epics / Stories: 微信读书播客 Agent v0.1

## v0.1 Goal

跑通单章真实闭环：

```text
创建项目
→ 上传 PDF
→ 文本层检测 / 章节候选融合
→ 目录确认
→ 选择单章
→ DeepSeek 章节分析
→ DeepSeek 播客策划
→ DeepSeek 分轮次脚本
→ 人工编辑确认
→ 火山/豆包 action=3 TTS
→ 输出单章 mp3
```

## Epic 1: 本地项目管理与配置

### Story 1.1 创建本地项目

用户可以创建一个本地播客项目，系统生成项目 ID、项目目录和初始状态。

Acceptance:
- 项目元数据写入 SQLite。
- 项目目录位于 `storage/projects/{project_id}`。
- 重启服务后项目仍可查询。

### Story 1.2 配置 DeepSeek 与火山/豆包 TTS

用户可以通过 `.env` 或后续配置页提供 LLM/TTS 配置。

Acceptance:
- 密钥不写入日志、文档或前端 bundle。
- 缺少必要配置时 API 返回明确错误。
- `.env.example` 描述所有必要字段。

## Epic 2: DocumentParserWorkflow

### Story 2.1 检测 PDF 文本层

系统检测 PDF 是否已有可用文本层，并输出页数、字符量、抽样文本和质量判断。

Acceptance:
- 对带文本层 PDF 返回 `source_type=text_layer`。
- 对低质量文本层标记 `needs_ocr=true`。
- 解析报告可持久化。

### Story 2.2 提取章节候选

系统从目录页和正文页分别提取章节候选。

Acceptance:
- 目录候选和正文候选分别保留 source。
- 候选包含 chapter number、title、page、line、confidence。
- 支持中文“一、二、三”和阿拉伯数字章节。

### Story 2.3 融合章节结构

系统融合目录候选、正文标题候选、标题反查和页码位置，生成可确认章节结构。

Acceptance:
- 对测试书《蛤蟆先生去看心理医生》生成 16 章。
- 第 11 章可通过目录标题反查推断到第 76 页。
- 输出章节包含 start_page、end_page、chars、confidence、source。

## Epic 2.5: Reader Insight + Adaptive Agent Routing

目标：在通用单章 Agent 闭环之上，引入读者洞察、书籍画像和播客路由，让不同类型 PDF 进入不同 Typed Agent Team。

Stories:

1. Reader Insight Agent
   从评论、笔记、划线中生成 `reader_insight`，包含情绪基调、读者问题、真实案例和脚本机会点。

2. Book Profiler Agent
   综合 PDF 解析结果和 `reader_insight` 生成 `book_profile`。

3. Podcast Router Agent
   基于 `book_profile` 和 `reader_insight` 生成 `podcast_strategy`。

4. Agent Team Composer
   MVP 用规则把播客模式映射到 Concept / Narrative / Research Team。

验收标准：
- 评论为空时流程仍可继续。
- Reader Insight 输出可被 Book Profiler 和 Podcast Router 引用。
- 用户可确认或修正书籍类型和播客策略。

## Epic 3: DeepSeek Agent 闭环

### Story 3.1 ChapterAnalysisAgent

系统调用 DeepSeek，为单章生成结构化章节分析。

Acceptance:
- 输出 JSON 符合 schema。
- 失败时保存原始响应和错误信息。
- 支持单章重跑。

### Story 3.2 PodcastPlanAgent

系统基于章节分析生成单章播客策划。

Acceptance:
- 输出包含对话基调、时长目标、案例融入点、Alice/Dr_Ye 口吻约束。
- 输出引用章节分析中的具体点。

### Story 3.3 ScriptWriterAgent

系统生成分轮次双人脚本块。

Acceptance:
- 每个脚本块包含 speaker、text、voice_id、tts_params、estimated_seconds、status、locked。
- speaker 只允许 `Alice` 或 `Dr_Ye`。
- 默认单章目标 3-4 分钟。

## Epic 4: 脚本编辑与确认

### Story 4.1 脚本块编辑器

用户可以按轮次编辑脚本文本和 TTS 参数。

Acceptance:
- 可编辑 text、speech_rate、emotion。
- 可锁定脚本块。
- 锁定块不会被重生成覆盖。

### Story 4.2 脚本确认

用户确认脚本后，章节进入 TTS-ready 状态。

Acceptance:
- 未确认脚本不能调用 TTS。
- 确认后生成 TTS preview payload。

## Epic 5: 火山/豆包 Podcast TTS

### Story 5.1 TTS action=3 打包

系统将已确认脚本块按顺序打包为一次火山/豆包 `action=3` 请求。

Acceptance:
- `Alice` 映射到 `zh_female_mizaitongxue_v2_saturn_bigtts`。
- `Dr_Ye` 映射到 `zh_male_dayixiansheng_v2_saturn_bigtts`。
- payload 包含 `nlp_texts`、`audio_config`、`speaker_info.random_order=false`。

### Story 5.2 WebSocket TTS 调用

系统建立 WebSocket，发送 StartConnection / StartSession，接收 round 级音频事件。

Acceptance:
- 保存单章 mp3。
- 记录 PodcastRoundStart、PodcastRoundEnd、PodcastEnd。
- 失败时记录失败 round 和错误原因。

## Implementation Order

1. 后端项目、配置、SQLite 初始化。
2. DocumentParserWorkflow 原型和测试书验证。
3. 项目/解析 API。
4. DeepSeek client 和三个 Agent prompt。
5. 脚本块 schema 与编辑 API。
6. 火山/豆包 TTS action=3 client。
7. React 工作台页面。


