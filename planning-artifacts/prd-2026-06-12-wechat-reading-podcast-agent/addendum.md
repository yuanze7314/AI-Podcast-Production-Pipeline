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
- PDF 处理：PyMuPDF / pdfplumber 优先比较
- LLM 编排：轻量 Workflow 优先，保留 LangGraph 作为复杂状态编排候选
- 音频处理：ffmpeg / pydub
- 配置：本地 `.env` + Web 配置页

## 设计原则

确定性工程处理进入 Workflow，需要判断、提炼、规划、创作和审核的任务进入 Agent。避免把 PDF 解析、TTS 封装、音频合成等稳定工程步骤过度 Agent 化。

## Workflow 层

- `ingest_pdf`：保存 PDF 和项目输入。
- `parse_pdf`：提取文本、页码、目录候选和解析报告。
- `confirm_toc`：持久化用户确认后的章节结构。
- `extract_chapter_text`：根据章节结构生成章节正文片段。
- `validate_json`：校验 Agent 输出 schema。
- `package_tts_request`：把脚本块转成火山/豆包 TTS 请求结构。
- `run_tts`：执行分章节 TTS，记录状态、错误和成本。
- `merge_audio`：合并开场、章节、转场、结尾为完整音频。
- `retry_failed_task`：按步骤或章节重跑失败任务。

## Agent 层

### CommentInsightAgent

输入：高赞评论、个人读书笔记、划线、可选书籍元信息。

输出：情绪基调、读者真实关注点、高频困惑、真实案例、亮点句、争议点、可融入章节建议。

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

- PDF 章节识别不稳定，需要置信度和人工确认页兜底。
- Agent 输出 JSON 不稳定，需要 schema 校验、修复重试和错误可视化。
- 角色漂移，需要人设约束注入和 ScriptReviewAgent 检查。
- 章节质量不一致，需要 PodcastPlanAgent 统一全书基调和章节目标。
- TTS 成本高，需要 TTS 前强制确认、章节级重跑和成本估算。
- 长文本上下文过大，需要按章节处理，并保留全书级摘要/策划作为共享上下文。
