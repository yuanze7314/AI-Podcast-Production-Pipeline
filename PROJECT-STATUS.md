# PROJECT-STATUS: 微信读书播客 AI

## 1. Project Root

```text
E:\Agent项目\微信读书播客ai
```

后续所有开发、验证、文档更新都以该目录为准。不要再把源码写回 `C:\Users\yzzz\Documents\微信读书工作坊`。

## 2. Product Goal

构建一个本地单机 Web 工作台，将微信读书相关书籍 PDF、评论/笔记、角色声线配置转成可审核、可编辑、可重跑的双人播客生产流程。

v0.1 聚焦单章真实闭环：

```text
创建项目
→ 导入 PDF
→ PDF 文本层检测 / 章节候选融合
→ 保存章节正文
→ 选择单章
→ DeepSeek 章节分析
→ DeepSeek 播客策划
→ DeepSeek 分轮次脚本
→ 人工编辑确认
→ 火山/豆包 action=3 TTS
→ 输出单章 MP3
```

## 3. Architecture Snapshot

```text
frontend/ React + Vite Web 工作台
backend/  FastAPI + SQLite + Workflow/Agent 服务
storage/  本地数据库、项目文件、解析报告、章节正文、音频输出
tasks/    可交接任务文档
```

核心分层：

- Workflow：确定性工程流程，例如 PDF 解析、章节候选融合、TTS 打包、音频保存。
- Agent：需要判断和生成的 LLM 能力，例如章节分析、播客策划、脚本生成、脚本审核。

## 4. Canonical Documents

| 文档 | 用途 | 状态 |
|---|---|---|
| `PRD-微信读书播客Agent.md` | 产品需求与验收口径 | 已建立 |
| `ADDENDUM-微信读书播客Agent.md` | 技术方案、Agent/Workflow 设计、外部服务配置 | 已建立 |
| `DECISION-LOG-微信读书播客Agent.md` | 关键产品/技术决策 | 持续更新 |
| `EPICS-STORIES-微信读书播客Agent.md` | Epic/Story 初版拆解 | 已建立，需随实现更新 |
| `tasks/TASKS-v0.1.md` | 当前阶段执行清单、边界、验收标准、下一步 | 新窗口优先阅读 |
| PROJECT-STATUS.md | 总控状态文档 | 新窗口优先阅读 |
| docs/ARCHITECTURE-MULTI-AGENT.md | 自适应多 Agent 创作架构 | 已建立，待确认落地阶段 |

## 5. Current Implementation Status

已完成：

- FastAPI 后端骨架。
- React/Vite 前端骨架。
- SQLite 数据库初始化。
- 项目表、解析任务表、章节表。
- 项目创建 API。
- 本地 PDF 导入 API。
- PDF 上传 API。
- 项目解析 API。
- 章节列表 API。
- `DocumentParserWorkflow` 文本层解析原型。
- 目录候选 + 正文标题候选 + 标题反查融合。
- 解析结果持久化到 SQLite 和 `storage/projects/{project_id}`。
- 火山/豆包 action=3 payload 打包器。
- Stage 2 数据表：analysis_reports / podcast_plans / script_blocks。
- ChapterAnalysisAgent / PodcastPlanAgent / ScriptWriterAgent 服务骨架。
- 单章 analysis / plan / script API。
- DeepSeek smoke 脚本。
- 已用测试书第 1 章真实生成章节分析、播客策划和 9 个脚本块。
- 已修复 LLM source_refs 字符串/list 偏差兼容。
- Stage 3 脚本块编辑 API。
- Stage 3 脚本块锁定 API。
- Stage 3 单章脚本确认 API。
- Stage 3 TTS preview payload API。
- 已验证未确认脚本不能生成 TTS payload。
- 已验证确认后的 9 个脚本块可生成火山/豆包 action=3 payload。
- Stage 4 `tts_tasks` 数据表。
- 火山/豆包 Podcast TTS WebSocket v3 client。
- 单章 TTS 生成 API。
- TTS request / event log / output MP3 本地保存。
- 已用测试书第 1 章 9 个脚本块真实生成单章 MP3。
- Stage 5 前端最小工作台初版。
- 前端项目列表、创建项目、本地 PDF 导入、解析、章节列表。
- 前端单章分析、策划、脚本生成、脚本块编辑/锁定/确认、TTS 生成按钮。
- FastAPI 本地 CORS 配置，支持 Vite 工作台访问。
- TTS task 查询 API：列表、最新任务、MP3 文件响应。
- 前端选择章节后自动加载最新 TTS task，并在成功时显示音频播放器。
- 前端 PDF 文件上传入口。
- 前端 analysis / plan 结构化 JSON 结果展示。
- 前端完整 TTS 历史任务区和 MP3 下载链接。
- 前端默认优先选择已有 parsed 项目，避免进入空项目后无章节。
- OCR fallback 工程边界：PyMuPDF OCR provider 封装、OCR 环境诊断 API、扫描版样本生成脚本、OCR fallback 探针脚本。
- 前端 OCR 状态条，显示当前 OCR provider / language / ready 状态。
- 轻量 OCR runtime：Tesseract + `chi_sim+eng` 语言包，默认使用 `E:\agent-tools\tessdata`。
- OCR tessdata 下载脚本：`backend/scripts/download_tessdata.py`。
- 章节验收 API：支持人工修订章节标题、起止页，并标记为 `human_reviewed`。
- 前端目录确认面板：支持查看章节来源、置信度、正文预览，并保存章节验收。
- 前端解析摘要：显示最新 parse run 的 provider、source_type、页数、抽取字数、质量分和低置信章节数。
- 章节结构操作 API：支持新增手动章节、删除章节、合并相邻下一章，并自动重排章号。
- 前端结构操作面板：支持在目录确认区新增章节、删除当前章节、合并下一章。
- 章节全文查看 API：支持读取章节正文 txt，返回全文、字符数、去空白字数和 text_path。
- 前端章节正文面板：在目录确认区显示完整正文、正文路径和字数，支持刷新正文。
- 真实 API 一键脚本流水线：单接口顺序调用 DeepSeek 章节分析、播客策划、脚本生成，并保存全部产物。
- 前端单章生产区新增 `真实API脚本` 按钮，一次触发 analysis / plan / script。

已验证：

- 使用测试书《蛤蟆先生去看心理医生》跑通项目解析闭环。
- 解析出 137 页、16 章。
- 第 11 章通过目录标题反查推断到第 76 页。
- 每章已保存完整章节正文 txt。
- 测试书第 1 章 TTS task `c7e54aaa-daee-4909-b3b8-3ff738f32dbf` 生成成功，9/9 轮完成，输出 MP3 约 1.68 MB。
- 前端 `npm run build` 通过。
- 本地浏览器验证 `http://127.0.0.1:5173` 可加载已有项目、16 个章节和第 1 章 9 个脚本块，控制台无错误。
- 本地浏览器验证第 1 章可显示 `success · 9/9`，页面存在 1 个 audio 播放器，音频接口返回 `audio/mpeg`。
- 本地浏览器复验可显示章节分析、播客策划、TTS 历史、MP3 链接和 1 个 audio 播放器。
- 已用测试书生成 `test-output/scanned-sample-12p.pdf` 扫描版样本。
- OCR 诊断确认 PyMuPDF OCR API 可用，Tesseract runtime 可通过 `C:\Program Files\Tesseract-OCR\tesseract.exe` 发现。
- OCR 诊断确认 `E:\agent-tools\tessdata` 下 `chi_sim` / `eng` 语言包可用，当前 OCR 状态为 ready。
- OCR 探针确认 `test-output/scanned-sample-12p.pdf` 可通过 `pymupdf_ocr` 解析成功，12 页抽取 6009 字，识别前 2 章。
- OCR 质量风险：轻量 OCR 对章节标题仍可能产生错字，例如扫描样本第 2 章标题识别存在偏差，目录确认页和解析报告仍是必要人工验收点。
- 本地浏览器验证 OCR 状态条可显示 `pymupdf · chi_sim+eng · ready`，已有解析项目、16 个章节和 1 个 audio 播放器可恢复，控制台无错误。
- 已创建扫描样本项目 `a349c779-6a61-4f30-bee8-a44eb45e9f78`，通过前端显示 2 章待验收。
- 已通过前端目录确认面板把扫描样本第 2 章标题从 OCR 误识别结果修订为“挚友前来相助”，接口返回 `human_reviewed` / `0.98`。
- 本地浏览器验证扫描样本项目可显示解析摘要：`pymupdf_ocr`、12 页、6009 字、质量 100%、低置信章节 1 个。
- 后端结构操作 smoke 项目 `ff20f13c-d147-4f1c-b946-da7ebb022749` 验证通过：新增章节、合并下一章、删除章节、章号重排。
- 前端结构操作验证通过：通过页面新增 `UI Add Smoke` 章节，显示 `manual_added · 98%`，章节数更新为 2。
- 章节全文接口验证通过：可读取 smoke 项目第 1 章正文，返回 3113 字符 / 2767 去空白字。
- 本地浏览器验证章节正文面板可显示完整 OCR 文本、正文路径、字数和刷新入口，控制台无错误。
- 真实 DeepSeek API 验证通过：扫描 PDF 项目 `a349c779-6a61-4f30-bee8-a44eb45e9f78` 第 1 章生成 analysis、plan 和 8 个 script blocks，speaker 覆盖 Alice / Dr_Ye。
- 修复真实 API 返回兼容问题：`source_refs` 为字符串数组时统一转为 `{note: ...}` 对象数组，避免脚本块查询 500。
- 真实火山/豆包 TTS 验证通过：扫描 PDF 项目第 1 章 8 个脚本块确认后生成 MP3，task `783780da-1d75-449b-b371-dac0482cfea0` 成功，8/8 round，输出约 1.68 MB。
- 本地浏览器验证扫描 PDF 项目可显示 `success · 8/8`、1 个 audio 播放器和 MP3 下载入口。
- 前端单章一键流程完成：新增“生成单章播客”，后端串联真实 API 脚本、脚本确认和 TTS 生成，并支持复用已有 analysis / plan / script 从中断点继续。
- 一键流程真实复验通过：扫描 PDF 项目第 2 章复用已生成脚本后确认并生成 MP3，task `bd56dc30-7e73-4adc-95eb-d7a333b208ca` 成功，11/11 round，输出约 2 MB。
- 分章节任务列表完成：新增章节生产状态 API 和前端状态徽标，章节列表可显示未开始、已分析、已策划、脚本待审、已确认、音频中、音频失败、已出音频；列表上方显示已有脚本 / 已确认 / 已出音频统计。
- 多章节批量脚本完成：新增项目级批量脚本接口和前端“批量脚本”按钮，默认跳过已有脚本章节，复用已有 analysis / plan，只补缺失脚本，不确认脚本、不生成 TTS。
- 多章节批量音频完成：新增项目级批量 TTS 接口和前端“批量音频”按钮，只处理已确认脚本章节，默认跳过已有成功音频，不自动生成脚本或确认脚本。
- 全集音频合成完成：新增项目级全集 MP3 合成接口和前端“合成全集”按钮，按章节顺序合并已成功生成的分章节 MP3，输出完整播客音频并支持在线播放 / 下载。
- 交付导出完成：新增分章 MP3 ZIP 导出接口和前端导出区，支持导出分章 MP3 ZIP 与全集 MP3。
- 真实长书全链路试跑完成：用《毕马威：2023可持续金融洞察白皮书》63 页 PDF 跑通解析、章节切分、Reader Insight、Book Profile、9 章脚本、9 章真实 TTS、全集 MP3 合成和分章 ZIP 导出。
- P0 稳定性修复完成：章节标题补全、LLM JSON 自动重试、批量任务耗时 / 目标章节展示、失败章节续跑入口。
- 前端体验整理完成第一轮：新增项目总览、音频完成度、下一步建议、主流程快捷入口、高级操作折叠和目录风险提示。
- 产物管理区增强完成：支持查看分章 MP3 数量 / 总大小、全集 MP3 状态 / 大小 / 生成时间、交付检查、分章音频列表、单章下载、ZIP 和全集下载入口。

## 6. Current Stage

当前阶段：`v0.1 / Stage 6 - 真实长书试跑与稳定性收敛`

Stage 5 当前状态：已完成最小工作台闭环，支持通过页面完成单章主要流程、状态恢复、一键真实播客生成、批量脚本、批量音频、全集合成和导出。

下一步目标：P0 稳定性问题已处理，前端主流程入口和产物交付区已收束；下一步建议继续做 P1 体验增强，包括批量脚本质量审核和 TTS 失败诊断增强。

```text
轻量 OCR runtime ready
→ 前端扫描 PDF 导入解析验证
→ 目录确认页 / 章节验收
→ 章节合并 / 删除 / 新增
→ 真实 DeepSeek 单章生成复验
→ 真实 TTS 单章 MP3 复验
→ 单章一键播客生成闭环
→ 分章节生产状态看板
→ 多章节批量脚本
→ 多章节批量音频
→ 全集音频合成
→ 分章 / 全集 MP3 导出
→ 内容质量升级：Reader Insight + Book Profile
→ Script Review Agent
→ 真实长书全链路试跑
```

## 7. Next Commands For A New Window

从新窗口继续时，先执行：

```powershell
Set-Location 'E:\Agent项目\微信读书播客ai'
Get-Content .\PROJECT-STATUS.md -Encoding UTF8
Get-Content .\tasks\TASKS-v0.1.md -Encoding UTF8
```

验证当前后端解析闭环：

```powershell
$env:PYTHONPATH='backend'
python backend\scripts\smoke_project_parse.py 'E:\codex\AI-Podcast-Production-Pipeline\测试书籍\蛤蟆先生去看心理医生 (（英）罗伯特•戴博德) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
```

## 8. Progress Log

- 2026-06-12: 完成产品讨论，确定本地单机 Web 工作台、FastAPI + React + SQLite、DeepSeek、火山/豆包 Podcast TTS。
- 2026-06-12: 确定扫描版 PDF 必须进入 MVP，采用文本层优先 + OCR fallback + 章节候选融合。
- 2026-06-12: 用《蛤蟆先生去看心理医生》验证章节候选融合策略，成功得到 16 章。
- 2026-06-12: 搭建后端/前端骨架，实现 `DocumentParserWorkflow`。
- 2026-06-12: 实现 SQLite 项目解析闭环，保存完整章节正文。
- 2026-06-12: 项目从 `C:\Users\yzzz\Documents\微信读书工作坊` 迁移到 `E:\Agent项目\微信读书播客ai`。
- 2026-06-12: 补充总控状态文档和 v0.1 任务文档，确保新窗口可接手。
- 2026-06-12: 实现 Stage 2 DeepSeek 单章 Agent 闭环骨架，包括三张表、Agent 服务、API 和 smoke 脚本。
- 2026-06-12: 创建本地 .env，真实调用 DeepSeek 完成测试书第 1 章分析、策划和脚本块生成；入库 1 条 analysis、1 条 plan、9 个 script_blocks。

- 2026-06-13: 根据桌面文档 更新后的文档架构.txt 补充自适应多 Agent 创作架构，新增 Reader Insight Agent、Book Profiler、Podcast Router、Typed Agent Team、Review & Revision、Human Gates；当前仍需确认Reader Insight + 多 Agent 路由是否立即插入 v0.1 Stage 3 之前。

- 2026-06-13: 将读者评论分析师正式定位为 Reader Insight Agent / 读者洞察 Agent，放在 G1 目录确认之后、Book Profiler 之前，作为全局内容理解输入。
- 2026-06-13: 完成 Stage 3 后端闭环：脚本块编辑、锁定、确认、TTS preview payload API；新增 `smoke_stage3_tts_payload.py`，用测试书第 1 章 9 个脚本块验证未确认拒绝、确认后生成 action=3 payload。
- 2026-06-13: 完成 Stage 4 真实 TTS 闭环：按火山/豆包 Podcast API WebSocket v3 官方协议实现 StartSession 事件帧、round 事件解析、MP3 分片合并和 `tts_tasks` 记录；测试书第 1 章 9 个脚本块成功生成单章 MP3。
- 2026-06-13: 完成 Stage 5 前端最小工作台初版：替换乱码占位页，接入项目列表、项目创建、本地 PDF 导入/解析、章节列表、单章 Agent 按钮、脚本块编辑/锁定/确认和 TTS 生成；新增本地 CORS；浏览器验证已有测试项目可加载。
- 2026-06-13: 补充 TTS task 查询和音频文件响应 API；前端选择章节后自动加载最新 TTS task，第 1 章成功任务可在页面显示 `success · 9/9` 并出现 audio 播放器。
- 2026-06-13: 补齐 Stage 5 工作台：PDF 文件上传、analysis/plan JSON 展示、完整 TTS 历史任务、MP3 下载链接、默认优先选择 parsed 项目；浏览器复验通过。
- 2026-06-13: 开始扫描版 PDF OCR 风险闭环：新增 PyMuPDF OCR provider、OCR 环境诊断 API、扫描版样本生成脚本和 OCR fallback 探针；确认当前机器缺少 Tesseract runtime / 中文语言包，OCR provider 尚未 ready。
- 2026-06-14: 确定当前只走轻量 OCR 路线；安装 Tesseract，下载 `chi_sim+eng` 到 `E:\agent-tools\tessdata`，修复 OCR 诊断和 tessdata 自动发现；扫描样本 12 页 OCR 探针通过。
- 2026-06-14: 完成目录确认最小闭环：新增章节 PATCH API 和前端章节验收面板；用扫描样本项目验证 `pymupdf_ocr` 落库、2 章显示、OCR 错字修订和 `human_reviewed` 标记。
- 2026-06-14: 补充解析摘要 UI，显示最新 parse run 与低置信章节数；浏览器验证扫描样本项目摘要正常。
- 2026-06-14: 完成章节结构操作最小闭环：新增、删除、合并下一章、自动重排章号；后端 smoke 和前端新增章节验证通过。
- 2026-06-14: 完成章节全文查看：新增章节正文 API 和前端全文面板；浏览器验证可查看 OCR 正文路径、字数和完整文本。
- 2026-06-14: 为提速暂缓低置信筛选、操作风险提示、批量生成、全集合成和 Stage 2.5；新增真实 API 一键脚本流水线并用扫描 PDF 第 1 章跑通 DeepSeek analysis / plan / script。
- 2026-06-14: 用扫描 PDF 第 1 章完成真实火山/豆包 TTS 复验：确认 8 个脚本块后成功生成单章 MP3，并在前端显示播放器和下载入口。
- 2026-06-14: 完成前端“生成单章播客”一键流程：后端可串联真实 API 脚本、脚本确认和火山/豆包 TTS，并在失败重跑时复用已有 analysis / plan / script，避免重复消耗。
- 2026-06-14: 用扫描 PDF 第 2 章完成一键流程真实复验：task `bd56dc30-7e73-4adc-95eb-d7a333b208ca` 成功，11/11 round，MP3 音频接口返回 `audio/mpeg`。
- 2026-06-14: 完成分章节任务列表：新增 `/chapters/production-status` 聚合接口，前端章节卡显示生产阶段徽标和脚本 / 音频进度，并显示整本项目已有脚本、已确认、已出音频统计。
- 2026-06-14: 完成多章节批量脚本：新增 `/chapters/script-batch`，默认 `skip_existing=true`，用扫描样本项目验证 2 章已有脚本时全部跳过，未触发额外 LLM 消耗。
- 2026-06-14: 完成多章节批量音频：新增 `/chapters/tts-batch`，默认 `skip_existing_success=true`，用扫描样本项目验证 2 章已有成功音频时全部跳过，未触发额外 TTS 消耗。
- 2026-06-14: 完成全集音频合成：新增 `/audio/full`、`/audio/full/latest`、`/audio/full/{task_id}/file`，用扫描样本项目合成 2 章完整 MP3，task `91abc5e5-15a1-4a7b-942d-9f404a5705b9` 成功，输出约 3.86 MB。
- 2026-06-14: 完成交付导出：新增 `/audio/chapters/export`，可导出分章 MP3 ZIP；扫描样本项目导出 ZIP 包含 2 个章节 MP3 和 `manifest.json`，全集 MP3 下载接口继续可用。
- 2026-06-14: 开始内容质量升级并完成轻量闭环：新增 Reader Insight Agent、Book Profiler Agent、`reader_insights` / `book_profiles` 表、前端内容质量面板，并将 latest reader_insight / book_profile 注入章节 analysis / plan / script；明确不开发全书时长预算。
- 2026-06-14: 内容质量升级真实 DeepSeek 验证通过：扫描样本项目生成 reader insight `b69fbd61-90f9-4da9-978d-e025bbcea228`，book profile `7953b7b3-120e-4941-8f02-f264692670c2`，书籍分类为“心理疗愈小说”。
- 2026-06-14: 完成 Script Review Agent 轻量闭环：新增 `script_review_reports` 表、脚本审核 API 和前端“审核脚本”按钮；审核只生成报告，不自动改写脚本。扫描样本第 1 章 review `9cf56c71-1ea5-48db-8eb3-82824e623d87` 成功，overall_score 90，pass_review=true。
- 2026-06-14: 完成真实长书全链路试跑：项目 `e35c6185-790d-483b-9015-3d7a4c56c375`，PDF《毕马威：2023可持续金融洞察白皮书》63 页文本层解析成功，抽取 57041 字、切分 9 章；Reader Insight `de18f5d2-27d2-4482-b2c7-dd62a45b6e26`、Book Profile `62da7d9b-a23e-483a-9ce0-0b7147e56116` 成功，分类为“商业与金融/行业研究报告”。
- 2026-06-14: 真实长书批量脚本完成：9 章共 114 个脚本块，第 8 章首次遇到 LLM JSON 偶发格式错误，单章重跑后成功；说明后续需要补自动 JSON 重试和失败续跑提示。
- 2026-06-14: 真实长书批量 TTS 完成：9/9 章成功，114/114 round 完成；全集合成 task `9770ab40-9659-45cd-8be6-36f2821db6ac` 成功，输出 `full-podcast.mp3` 约 20.4 MB；分章 ZIP 导出约 20.0 MB，包含 9 个 MP3 和 `manifest.json`。
- 2026-06-14: 验证通过：`python -m compileall backend\app backend\scripts` 和前端 `npm run build` 均通过。
- 2026-06-14: 完成 P0 稳定性修复：优化章节标题提取，支持同一行标题和后续短标题续接，并避免把“一、...”正文、附录、关于作者等拼进标题；KPMG 长报告标题验证通过，现有项目 4 个截断标题已就地修正且不改变章节 ID。
- 2026-06-14: 完成 LLM JSON 自动重试：ChapterAgents 对 JSON 解析失败或脚本 schema 失败最多自动补救 3 次，减少手动重跑；批量脚本 / 批量 TTS 返回 `elapsed_seconds` 和 `failed_chapter_ids`。
- 2026-06-14: 完成前端长任务与续跑体验：批量脚本 / 批量音频运行中显示目标章节数和实时耗时，完成后显示后端耗时；新增“重跑失败脚本”“重跑失败音频”入口，基于上次失败章节 id 续跑。
- 2026-06-14: 完成前端体验整理第一轮：工作台顶部新增项目总览、进度条、下一步建议和关键统计；生产区新增“生成整书脚本 / 生成分章音频 / 合成全集 / 导出交付”主流程卡片；低频按钮收进“高级操作”；目录确认区新增 OCR / 低置信章节风险提示。`npm run build` 和浏览器验证通过。
- 2026-06-14: 完成产物管理区增强：生产状态接口新增每章最新 TTS 文件大小、生成时间和错误信息；前端新增产物管理面板，展示分章 MP3、全集 MP3、交付检查、分章音频列表和下载入口。后端 compileall、前端 build、浏览器验证和密钥扫描均通过。

## 9. Rules For Future Agents

- 每完成一个阶段，必须更新本文件的 `Current Implementation Status`、`Current Stage`、`Progress Log`。
- 每完成一个 story，必须更新 `tasks/TASKS-v0.1.md` 的状态。
- 密钥只允许进入 `.env` 或本地配置存储，禁止写入文档、日志、前端 bundle。
- `storage/` 是运行产物，不作为源码提交。
- 若修改产品/技术决策，必须同步更新 DECISION-LOG-微信读书播客Agent.md。
- 若修改多 Agent 创作流程，必须同步更新 docs/ARCHITECTURE-MULTI-AGENT.md、PRD、ADDENDUM 和任务文档。





