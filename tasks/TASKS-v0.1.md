# TASKS-v0.1: 单章真实闭环开发任务

## 0. Scope Boundary

v0.1 只做单章真实闭环，不做整书批量生成和完整前端体验。

In scope:

- 本地项目管理。
- PDF 导入和解析。
- 章节结构保存。
- 单章章节分析。
- 单章播客策划。
- 单章分轮次脚本生成。
- 脚本块保存和查询。
- 火山/豆包 action=3 payload 打包。
- 单章 TTS 调用和 MP3 输出。

Out of scope for v0.1:

- 多用户账号、权限、云端协作。
- 重型 OCR provider，例如 PaddleOCR / PP-Structure / MinerU；当前只做轻量 OCR fallback。
- 整书批量章节生成。
- 开场、转场、结尾全集合成。
- 复杂音频后期。
- 自动抓取微信读书评论。

## 1. Current Stage

当前阶段：`Stage 6 - 真实长书试跑与稳定性收敛`

上一阶段已完成：`Stage 5 - 前端最小工作台`

## 2. Stage Checklist

### Stage 1: 项目管理 + PDF 解析 API

Status: Done

- [x] FastAPI 后端骨架。
- [x] SQLite 初始化。
- [x] Project / DocumentParseRun / Chapter 数据表。
- [x] 创建项目 API。
- [x] 本地 PDF 导入 API。
- [x] PDF 上传 API。
- [x] 项目解析 API。
- [x] 章节列表 API。
- [x] `DocumentParserWorkflow` 解析章节候选。
- [x] 保存完整章节正文。
- [x] smoke 脚本验证测试书解析出 16 章。

Acceptance:

- [x] `smoke_project_parse.py` 能创建项目、导入 PDF、解析、保存 16 章。
- [x] SQLite 中有 projects / chapters / document_parse_runs 数据。
- [x] `storage/projects/{project_id}/chapters` 下有完整章节正文 txt。

### Stage 2: DeepSeek 单章 Agent 闭环

Status: Done

Tasks:

- [x] 新增 `analysis_reports` 数据表。
- [x] 新增 `podcast_plans` 数据表。
- [x] 新增 `script_blocks` 数据表。
- [x] 新增 Agent prompt 文件或模块：ChapterAnalysisAgent。
- [x] 新增 Agent prompt 文件或模块：PodcastPlanAgent。
- [x] 新增 Agent prompt 文件或模块：ScriptWriterAgent。
- [x] 实现 DeepSeek JSON 调用和 JSON 修复/校验边界。真实调用待 `.env` 验证。
- [x] API: `POST /api/projects/{project_id}/chapters/{chapter_id}/analysis`。
- [x] API: `POST /api/projects/{project_id}/chapters/{chapter_id}/plan`。
- [x] API: `POST /api/projects/{project_id}/chapters/{chapter_id}/script`。
- [x] API: `GET /api/projects/{project_id}/chapters/{chapter_id}/script-blocks`。
- [x] smoke 脚本：对第 1 章跑真实 DeepSeek，保存章节分析、策划和脚本块。

Acceptance:

- [x] 对测试书第 1 章能生成合法章节分析 JSON。
- [x] 对测试书第 1 章能生成合法播客策划 JSON。
- [x] 对测试书第 1 章能生成 Alice / Dr_Ye 分轮次脚本块。
- [x] 每个脚本块包含 speaker、text、voice_id、tts_params、estimated_seconds、status、locked。
- [x] 所有 LLM 原始响应和错误信息可追踪，但不记录密钥。

### Stage 2.5: 自适应多 Agent 路由架构

Status: Waiting For Product Decision

Tasks:

- [ ] 新增 eader_insights 数据表。
- [ ] 新增 ook_profiles 数据表。
- [ ] 新增 `podcast_strategies` 数据表。
- [ ] 新增 `revision_issues` 数据表。
- [ ] 实现 Reader Insight Agent。
- [ ] 实现 Book Profiler Agent。
- [ ] 实现 Podcast Router Agent。
- [ ] 实现 Agent Team Composer 规则映射。
- [ ] 定义 Concept / Narrative / Research 三类 Team 的 analysis/script/review schema。
- [ ] 增加 G2 书籍类型确认 Gate。
- [ ] 增加 G3 播客策略确认 Gate。

Acceptance:

- [ ] 对测试书能生成 eader_insight，包含情绪基调、读者问题、真实案例和脚本机会点；评论为空时输出 empty_input=true。
- [ ] 对测试书能生成 ook_profile 并给出分类证据。
- [ ] 能生成 `podcast_strategy` 并选择对应 Agent Team。
- [ ] 用户可确认或修正书籍类型和播客策略。
- [ ] 当前通用 Agent 可作为 unknown/mixed fallback。

Open Decision:

- [ ] 需要确认 Stage 2.5 是否将 Reader Insight + Book Profiler + Podcast Router 立即插入当前 Stage 3 之前，还是在单章 TTS 闭环后实现。

Current Stage 2.5 Execution:

- [x] 用户已要求继续内容质量升级，但不开发全书时长预算 / 章节过多自动压缩重点章节。
- [x] 新增 `reader_insights` 数据表。
- [x] 新增 `book_profiles` 数据表。
- [x] 实现 Reader Insight Agent。
- [x] 实现 Book Profiler Agent。
- [x] 前端新增内容质量面板：评论 / 笔记 / 划线输入、读者洞察生成、书籍画像生成、JSON 查看。
- [x] latest reader_insight / book_profile 已作为质量上下文注入章节 analysis / plan / script 生成。
- [x] 扫描样本项目真实 DeepSeek 验证通过：reader insight `b69fbd61-90f9-4da9-978d-e025bbcea228`，book profile `7953b7b3-120e-4941-8f02-f264692670c2`，书籍分类为“心理疗愈小说”。
- [x] 实现 Script Review Agent，只产出审核报告，不自动改写脚本。
- [x] 扫描样本第 1 章真实 DeepSeek 审核通过：review `9cf56c71-1ea5-48db-8eb3-82824e623d87`，overall_score 90，pass_review=true。
- [ ] Podcast Router / Typed Agent Team 暂缓。

### Stage 3: 脚本确认 + TTS payload

Status: Done

Tasks:

- [x] 脚本块编辑 API。
- [x] 脚本块锁定 API。
- [x] 脚本确认 API。
- [x] TTS preview payload API。
- [x] 确认后才能进入 TTS。

Acceptance:

- [x] 未确认脚本不能调用 TTS。
- [x] 已确认脚本可生成 action=3 payload。
- [x] Alice / Dr_Ye 正确映射为 voice_id。

Verification:

- [x] `smoke_stage3_tts_payload.py` 使用测试书第 1 章 9 个脚本块验证通过。
- [x] `python -m compileall backend\app backend\scripts` 通过。
- [ ] `python -m pytest tests` 未执行成功：当前 Python 环境未安装 pytest。

### Stage 4: 火山/豆包 Podcast TTS WebSocket

Status: Done

Tasks:

- [x] 实现 WebSocket 二进制协议 client。
- [x] 按官方 v3 协议发送 StartSession / FinishConnection。
- [x] 接收 SessionStarted / PodcastRoundStart / PodcastRoundResponse / PodcastRoundEnd / UsageResponse / PodcastEnd。
- [x] 保存单章 mp3。
- [x] 记录 round 级事件和失败原因。

Acceptance:

- [x] 测试书第 1 章脚本可生成单章 mp3。
- [x] 失败时能记录失败 round。
- [x] 输出路径写入数据库。

Verification:

- [x] `smoke_stage4_tts_generate.py` 使用测试书第 1 章 9 个脚本块验证通过。
- [x] TTS task `c7e54aaa-daee-4909-b3b8-3ff738f32dbf` 成功，rounds_finished=9，output_bytes=1679157。
- [x] 官方协议核对：Podcast API WebSocket v3 生成阶段直接 StartSession，不使用旧版 StartConnection。

### Stage 5: 前端最小工作台

Status: Done

Tasks:

- [x] 项目列表页接 API。
- [x] 创建项目页。
- [x] 本地 PDF 导入入口。
- [x] PDF 文件上传入口。
- [x] 章节列表页。
- [x] 单章分析和策划结果页。
- [x] 单章分析、策划、脚本生成触发按钮。
- [x] 脚本块编辑页。
- [x] 脚本块锁定和确认。
- [x] TTS 生成按钮和当前任务状态展示。
- [x] 最新 TTS task 查询和音频播放。
- [x] 完整历史 TTS task 列表和下载入口。

Acceptance:

- [x] 用户可通过页面完成单章闭环主要步骤。
- [x] 所有状态可刷新恢复。
- [x] 用户可在页面查看分析/策划结果。
- [x] 用户可在页面播放生成的 MP3。
- [x] 用户可在页面下载生成的 MP3。

Verification:

- [x] `npm run build` 通过。
- [x] 浏览器验证 `http://127.0.0.1:5173` 可加载已有项目、16 个章节和第 1 章 9 个脚本块。
- [x] 浏览器控制台无 error/warning。
- [x] 浏览器验证第 1 章可显示 `success · 9/9`，并渲染 1 个 audio 播放器。
- [x] 浏览器复验章节分析、播客策划、TTS 历史、MP3 链接和 audio 播放器均可渲染。
- [ ] 截图工具超时，尚未保存视觉截图。

### Stage 6: 真实长书试跑与稳定性收敛

Status: In Progress

Tasks:

- [x] 使用真实长 PDF 跑完整链路：解析、章节切分、Reader Insight、Book Profile、批量脚本、脚本确认、批量 TTS、全集合成、分章 ZIP 导出。
- [x] 验证真实长书批量脚本支持失败后续跑：第 8 章首次 JSON 格式错误，单章重跑成功。
- [x] 验证真实长书批量 TTS 可完成 9 章 114 个 round。
- [x] 验证全集 MP3 和分章 ZIP 产物可生成。
- [x] 修复或优化章节标题截断问题，例如长标题只保留前半段。
- [x] 增加 LLM JSON 偶发失败的自动重试 / 修复策略。
- [x] 增强长任务前端进度体验，避免用户误以为批量 TTS 卡住。
- [x] 增加失败续跑入口：重跑失败脚本、重跑失败音频。
- [x] 前端体验整理第一轮：项目总览、主流程快捷入口、高级操作折叠、目录风险提示。
- [x] 增强产物管理区：显示分章 ZIP、本次全集 MP3、文件大小和生成时间。

Acceptance:

- [x] 真实 63 页 PDF 可被解析并切分章节。
- [x] 真实 DeepSeek 可生成整本 9 章脚本。
- [x] 真实火山/豆包 TTS 可生成整本 9 章分章 MP3。
- [x] 全集 MP3 合成成功。
- [x] 分章 ZIP 包含全部章节 MP3 和 `manifest.json`。
- [x] 后端 compileall 通过。
- [x] 前端 build 通过。

Verification:

- [x] 项目 `e35c6185-790d-483b-9015-3d7a4c56c375`：PDF《毕马威：2023可持续金融洞察白皮书》，63 页，抽取 57041 字，切分 9 章。
- [x] Reader Insight `de18f5d2-27d2-4482-b2c7-dd62a45b6e26` 成功；Book Profile `62da7d9b-a23e-483a-9ce0-0b7147e56116` 成功，分类“商业与金融/行业研究报告”。
- [x] 批量脚本：9/9 成功，114 个脚本块；第 8 章首次 JSON 错误后补跑成功。
- [x] 批量 TTS：9/9 成功，114/114 round。
- [x] 全集音频：task `9770ab40-9659-45cd-8be6-36f2821db6ac`，9/9 章，输出约 20.4 MB。
- [x] 分章导出：`chapter-mp3-export.zip` 约 20.0 MB，包含 9 个章节 MP3 和 `manifest.json`。

## 3. Definition Of Done

一个任务只有同时满足以下条件才算 Done：

- 代码已实现。
- smoke 或最小验证已跑通。
- 失败路径有明确错误信息。
- 相关文档状态已更新。
- 不泄露密钥。

## 4. Immediate Next Step

v0.1 单章真实闭环已完成。当前 OCR 采取轻量路线，下一步建议用前端导入扫描样本验证解析闭环，并推进目录确认页 / 章节验收体验。

1. [x] 准备扫描版中文 PDF 样本生成脚本。
2. [x] 生成 `test-output/scanned-sample-12p.pdf`。
3. [x] 接入 PyMuPDF OCR provider 边界。
4. [x] 接入 `DocumentParserWorkflow` 的 OCR fallback 调用点。
5. [x] 增加 OCR 环境诊断 API 和前端 OCR 状态条。
6. [x] 安装或选择 OCR runtime/provider。
7. [x] 选择轻量 OCR 路线：PyMuPDF OCR + Tesseract + `chi_sim+eng`。
8. [x] 扫描样本 OCR 探针验证：12 页、6009 字、识别前 2 章。
9. [x] 前端导入扫描样本并验证解析闭环。
10. [x] 章节验收最小闭环：标题 / 起止页修订，保存后标记 `human_reviewed`。
11. [x] 章节合并 / 删除 / 新增。
12. [x] 解析报告摘要：章节来源、低置信度、OCR 风险提示。
13. [x] 章节正文预览 / 全文查看。
14. [ ] 章节结构操作前的下游产物风险提示。当前为提速暂缓。
15. [ ] 继续保留 Stage 2.5 自适应多 Agent 路由为暂缓项，除非用户明确要求。
16. [x] 真实 API 一键脚本流水线：analysis / plan / script。
17. [x] 真实 TTS 复验：扫描 PDF 章节脚本确认后生成 MP3。
18. [x] 前端单章一键流程：真实 API 脚本 → 确认 → TTS。
19. [x] 真实单章 / 多章链路稳定性增强：LLM JSON 自动重试、批量任务失败章节续跑入口。
20. [x] 前端最近流水线结果面板：展示一键脚本 / 单章播客的成功、失败、脚本块数、TTS 轮次和 task id。
21. [x] 分章节任务列表：章节列表显示每章生产阶段、脚本确认进度、音频 round 进度和项目级统计。
22. [x] 多章节批量生成脚本：先批量跑 analysis / plan / script，不批量 TTS，仍保留逐章人工确认。
23. [x] 多章节批量生成音频：只处理已确认脚本章节，默认跳过已有成功音频。
24. [x] 全集音频合成：按章节顺序合并已成功生成的 MP3，保留分章节 MP3。
25. [x] 交付体验整理：支持导出分章 MP3 ZIP 和全集 MP3。
26. [x] 真实长书全链路试跑：用 63 页 PDF 完成 9 章脚本、9 章 TTS、全集 MP3 和分章 ZIP。
27. [x] 长书章节标题质量修复：避免标题截断和目录标题不完整。
28. [x] 长任务体验优化：批量脚本 / 批量 TTS 显示目标章节数、实时耗时和失败续跑入口。
29. [x] 前端体验整理第一轮：项目总览、下一步建议、主流程卡片、高级操作折叠和目录风险提示。
30. [x] 产物管理区增强：显示分章 ZIP、本次全集 MP3、文件大小和生成时间。

Current OCR Finding:

- PyMuPDF OCR API available: yes.
- Tesseract installed: yes, discovered at `C:\Program Files\Tesseract-OCR\tesseract.exe`.
- Tesseract on PATH: no, but backend can discover the common install path.
- Tessdata: `E:\agent-tools\tessdata`, languages `chi_sim` and `eng`.
- Current backend OCR status: ready.
- Lightweight OCR quality caveat: scanned sample chapter title recognition can contain OCR typos, so directory confirmation and chapter report review remain required.
- Scanned sample project: `a349c779-6a61-4f30-bee8-a44eb45e9f78`, provider `pymupdf_ocr`, 12 pages, 6009 chars, 2 chapters.
- Directory review UI verified: corrected chapter 2 title to “挚友前来相助”, source now `human_reviewed`, confidence `0.98`.
- Parse summary UI verified: provider `pymupdf_ocr`, 12 pages, 6009 chars, quality 100%, 1 low-confidence chapter.
- Structure ops backend smoke: project `ff20f13c-d147-4f1c-b946-da7ebb022749`, add / merge-next / delete / reindex passed.
- Structure ops frontend smoke: added `UI Add Smoke` through page, source `manual_added`, confidence `0.98`, chapter list refreshed.
- Chapter text API and UI verified: smoke chapter returned 3113 chars / 2767 non-whitespace chars and rendered in the directory review panel.
- Deferred for speed: low-confidence filter, downstream artifact risk prompt, batch generation, full-book audio, Reader Insight / Book Profiler / Router.
- Real DeepSeek pipeline verified: scanned PDF project `a349c779-6a61-4f30-bee8-a44eb45e9f78`, chapter 1, generated analysis + plan + 8 script blocks, speakers Alice / Dr_Ye.
- Real API compatibility fix: script `source_refs` string arrays now coerce to `{note: ...}` objects.
- Real TTS verified: task `783780da-1d75-449b-b371-dac0482cfea0`, 8/8 rounds, output `chapter.mp3` about 1.68 MB, audio endpoint returns `audio/mpeg`, frontend shows audio player and download link.
- One-click podcast pipeline verified: scanned PDF project `a349c779-6a61-4f30-bee8-a44eb45e9f78`, chapter 2, task `bd56dc30-7e73-4adc-95eb-d7a333b208ca`, 11/11 rounds, output `chapter.mp3` about 2 MB, audio endpoint returns `audio/mpeg`.
- One-click pipeline behavior: reuses latest existing analysis / plan / script blocks when available, then confirms script and starts TTS, reducing repeated real API cost after partial failures.
- Frontend pipeline status panel added: after `真实API脚本` or `生成单章播客`, the workbench shows the latest run status, script block count, TTS status, round progress, task id, or failure message.
- Chapter production status API added: `GET /api/projects/{project_id}/chapters/production-status` returns stage, analysis/plan flags, script block counts, confirmed block counts, latest TTS status and round progress.
- Chapter status UI verified: workbench renders project-level counts for scripted / confirmed / audio-ready chapters and per-chapter stage badges without browser console errors.
- Batch script API added: `POST /api/projects/{project_id}/chapters/script-batch` with `skip_existing=true` by default; it reuses existing analysis / plan, generates missing script blocks, and never confirms scripts or starts TTS.
- Batch script smoke verified on scanned sample project: 2 chapters skipped because both already had script blocks; no extra LLM generation was triggered.
- Batch TTS API added: `POST /api/projects/{project_id}/chapters/tts-batch` with `skip_existing_success=true` by default; it only generates audio for chapters with confirmed script blocks and never generates or confirms scripts.
- Batch TTS smoke verified on scanned sample project: 2 chapters skipped because both already had successful MP3 tasks; no extra TTS generation was triggered.
- Full audio API added: `POST /api/projects/{project_id}/audio/full`, `GET /api/projects/{project_id}/audio/full/latest`, and `GET /api/projects/{project_id}/audio/full/{task_id}/file`.
- Full audio smoke verified on scanned sample project: merged 2 successful chapter MP3 files into task `91abc5e5-15a1-4a7b-942d-9f404a5705b9`, output about 3.86 MB, file endpoint returns `audio/mpeg`.
- Delivery export API added: `GET /api/projects/{project_id}/audio/chapters/export` returns a ZIP containing successful chapter MP3 files plus `manifest.json`.
- Delivery export smoke verified on scanned sample project: ZIP contains `chapter-001-整个人都不太好.mp3`, `chapter-002-挚友前来相助.mp3`, and `manifest.json`; full MP3 download remains valid.
- Real long-book full-chain run verified: project `e35c6185-790d-483b-9015-3d7a4c56c375`, PDF《毕马威：2023可持续金融洞察白皮书》, 63 pages, 57041 extracted chars, 9 chapters.
- Real long-book content quality context verified: reader insight `de18f5d2-27d2-4482-b2c7-dd62a45b6e26`, book profile `62da7d9b-a23e-483a-9ce0-0b7147e56116`, category `商业与金融/行业研究报告`.
- Real long-book batch script verified: 9/9 chapters succeeded after retrying chapter 8 JSON format failure, total 114 script blocks.
- Real long-book batch TTS verified: 9/9 chapters succeeded, 114/114 rounds finished.
- Real long-book full audio verified: task `9770ab40-9659-45cd-8be6-36f2821db6ac`, output `full-podcast.mp3` about 20.4 MB.
- Real long-book delivery export verified: `chapter-mp3-export.zip` about 20.0 MB, contains 9 chapter MP3 files plus `manifest.json`.
- P0 title fix verified on KPMG long-book project: parser now returns complete titles including `站在可持续金融发展的机遇路口`, `方兴未艾：可持续保险`, `毕马威2022 年可持续金融调研成果发布与解读`, `展望与启示：规范市场格局，为“双碳”保驾护航`, and keeps `结语` clean.
- Existing KPMG project title repair applied in DB without changing chapter IDs or downstream script/audio artifacts: chapters 1, 4, 7, and 8 were updated.
- P0 LLM retry implemented: JSON parse/schema failures are retried up to 3 times with a corrective prompt.
- P0 batch resume implemented: batch script/TTS responses include elapsed time and failed chapter IDs; frontend shows target chapters + elapsed time and provides failed-only rerun buttons.
- Frontend UX pass 1 implemented: added project dashboard, audio completion progress, next-action hint, main workflow cards, collapsed advanced actions, and chapter review risk notice. Browser verification passed with no console errors.
- Delivery management implemented: chapter production status now includes latest TTS file size, creation time, and error message; frontend shows delivery readiness, chapter MP3 totals, full MP3 status, per-chapter audio list, and ZIP/full MP3 download actions.



