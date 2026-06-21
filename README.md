# 微信读书播客 AI

一个本地运行的 AI 播客生产工作台，把书籍 PDF、读者评论/笔记、角色声线配置转成可审核、可编辑、可续跑的双人播客生产流程。

项目当前重点不是“一键生成一个不可控成品”，而是把长书播客制作拆成清晰阶段：解析、章节确认、读者洞察、脚本生成、人工审核、分章 TTS、全集合成和交付导出。每一步都可以查看中间产物、局部修改、从失败点继续。

## 项目定位

本项目面向个人内容创作者、小型内容团队和 AI 播客实验场景，适合把一本书或一份长文档制作成结构化音频内容。

核心目标：

- 本地单机运行，项目数据、运行产物和密钥默认不进入 Git。
- 支持文本层 PDF，也支持扫描版 PDF 的轻量 OCR fallback。
- 以章节为最小生产单元，单章失败或修改后只重跑对应章节。
- LLM 负责理解、策划、脚本生成和审核，人类保留目录确认和脚本确认权。
- TTS 产物按章节保存，最后合成全集 MP3，并支持分章 ZIP 导出。

## 当前能力

V2 已经跑通“真实长书到完整音频交付”的主链路。

已实现能力：

- 项目创建、PDF 上传、本地 PDF 导入。
- PDF 文本层解析、目录候选识别、正文标题反查、章节切分。
- 扫描版 PDF OCR fallback，支持 Tesseract `chi_sim+eng`。
- 章节验收：人工修订标题、起止页、置信度和正文。
- 章节结构操作：新增章节、删除章节、合并下一章、自动重排章号。
- Reader Insight Agent：从评论/上下文提炼读者关注点。
- Book Profiler Agent：生成书籍类型、结构、调性和内容策略。
- Chapter Analysis Agent：生成章节分析。
- Podcast Plan Agent：生成单章播客策划。
- Script Writer Agent：生成 Alice / Dr_Ye 双人对话脚本块。
- Script Review Agent：审核脚本质量，只出报告，不自动覆盖人工编辑。
- LangGraph 章节内容图：串联 profile、analysis、plan、script、review、rewrite。
- 脚本块编辑、锁定、确认。
- 火山/豆包 Podcast TTS WebSocket v3，使用 `action=3` 生成分章 MP3。
- 分章节生产状态看板：未开始、已分析、已策划、脚本待审、已确认、音频中、音频失败、已出音频。
- 批量脚本：默认跳过已有脚本章节，只补缺失产物。
- 批量音频：只处理已确认脚本章节，默认跳过已有成功音频。
- 全集音频合成：按章节顺序合并成功生成的 MP3。
- 交付导出：分章 MP3 ZIP、全集 MP3 播放和下载。
- 前端命令中心：项目总览、进度条、下一步建议、主流程快捷入口和产物管理区。

## 主流程

```text
创建项目
-> 导入或上传 PDF
-> PDF 文本层解析 / OCR fallback
-> 目录候选融合与章节切分
-> 人工确认章节结构
-> 生成读者洞察与书籍画像
-> 逐章生成分析、策划、脚本
-> 脚本审核与人工确认
-> 分章火山/豆包 TTS
-> 合成全集 MP3
-> 导出分章 ZIP / 全集 MP3
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19, Vite 6, TypeScript, lucide-react |
| 后端 | FastAPI, Pydantic, SQLAlchemy, SQLite |
| LLM | DeepSeek OpenAI-compatible Chat API |
| Agent 编排 | LangGraph, 自定义 Workflow / Agent 分层 |
| PDF | PyMuPDF 文本层解析，PyMuPDF OCR fallback |
| OCR | Tesseract, `chi_sim+eng` 语言包 |
| TTS | 火山/豆包 Podcast TTS WebSocket v3 |
| 存储 | 本地 SQLite + `storage/projects/{project_id}` 文件产物 |

## 仓库结构

```text
backend/                 FastAPI 后端、数据库、API、workflow、agent service
frontend/                React/Vite 工作台
src/                     早期 Node.js pipeline 与工具代码
web/                     早期本地 Web 控制台
docs/                    架构、使用说明和设计文档
tasks/                   V2 任务追踪与交接清单
planning-artifacts/      PRD 和产品规划过程文档
scripts/                 实验脚本和辅助工具
tests/                   后端测试与 smoke checks
storage/                 本地运行数据，已被 .gitignore 排除
test-output/             本地测试输出，已被 .gitignore 排除
```

## 快速启动

推荐使用 FastAPI 后端 + React 前端工作台。

### 1. 准备环境变量

复制示例配置：

```powershell
Copy-Item .env.example .env
```

然后在 `.env` 中填写真实密钥：

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_API_KEY=replace-with-your-key
DEEPSEEK_MODEL=deepseek-v4-pro

VOLCENGINE_TTS_ENDPOINT=wss://openspeech.bytedance.com/api/v3/sami/podcasttts
VOLCENGINE_APP_ID=replace-with-your-app-id
VOLCENGINE_ACCESS_TOKEN=replace-with-your-access-token
VOLCENGINE_APP_KEY=replace-with-your-app-key
VOLCENGINE_RESOURCE_ID=volc.service_type.10050
VOLCENGINE_TTS_ACTION=3

OCR_PROVIDER=pymupdf
OCR_LANGUAGE=chi_sim+eng
OCR_TESSDATA=E:/agent-tools/tessdata

APP_STORAGE_DIR=storage
APP_DATABASE_URL=sqlite:///storage/app.db
```

`.env` 已被 `.gitignore` 排除，不要把真实 API Key 写进 README、日志、前端代码或测试夹具。

### 2. 启动后端

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

$env:PYTHONPATH='backend'
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

后端 API 默认挂载在：

```text
http://127.0.0.1:8000/api
```

健康检查：

```text
GET http://127.0.0.1:8000/api/health
```

### 3. 启动前端

```powershell
Set-Location frontend
npm install
npm run dev -- --port 5173
```

浏览器打开：

```text
http://127.0.0.1:5173
```

如果后端地址不是默认值，可以在前端环境中设置：

```env
VITE_API_BASE=http://127.0.0.1:8000/api
```

## OCR 配置

扫描版 PDF 需要本机有 Tesseract runtime 和语言包。

默认推荐：

```text
OCR_PROVIDER=pymupdf
OCR_LANGUAGE=chi_sim+eng
OCR_TESSDATA=E:/agent-tools/tessdata
```

项目包含下载脚本：

```powershell
$env:PYTHONPATH='backend'
python backend\scripts\download_tessdata.py
```

也可以检查 OCR 环境：

```text
GET http://127.0.0.1:8000/api/ocr/diagnostics
```

轻量 OCR 对章节标题仍可能识别出错，因此目录确认和低置信章节人工验收仍是必要步骤。

## 常用操作

### 创建项目并导入 PDF

在前端工作台中：

1. 创建项目，填写项目名和书名。
2. 上传 PDF，或填写本机 PDF 路径执行本地导入。
3. 点击解析 PDF。
4. 在章节列表中检查标题、页码、正文预览和置信度。
5. 对低置信章节做人工修订、合并、删除或新增。

### 生成单章播客

在章节抽屉中：

1. 生成章节脚本。
2. 查看 analysis / plan / review。
3. 编辑脚本块，必要时锁定不希望被覆盖的内容。
4. 确认脚本。
5. 生成 TTS 音频。
6. 播放或下载单章 MP3。

### 生成整书播客

在前端主流程区：

1. 批量生成脚本。
2. 人工检查并确认需要出音频的章节。
3. 批量生成分章音频。
4. 合成全集。
5. 导出分章 ZIP 或全集 MP3。

批量脚本和批量音频默认都会跳过已有成功产物，适合失败后续跑，避免重复消耗 LLM / TTS 额度。

## 主要 API

| 能力 | API |
| --- | --- |
| 健康检查 | `GET /api/health` |
| OCR 诊断 | `GET /api/ocr/diagnostics` |
| 创建项目 | `POST /api/projects` |
| 项目列表 | `GET /api/projects` |
| 本地 PDF 导入 | `POST /api/projects/{project_id}/pdf/local` |
| PDF 上传 | `POST /api/projects/{project_id}/pdf/upload` |
| 解析项目 PDF | `POST /api/projects/{project_id}/parse` |
| 章节列表 | `GET /api/projects/{project_id}/chapters` |
| 章节生产状态 | `GET /api/projects/{project_id}/chapters/production-status` |
| 读者洞察 | `POST /api/projects/{project_id}/reader-insight` |
| 书籍画像 | `POST /api/projects/{project_id}/book-profile` |
| 单章 LangGraph 脚本 | `POST /api/projects/{project_id}/chapters/{chapter_id}/script-graph` |
| 脚本审核 | `POST /api/projects/{project_id}/chapters/{chapter_id}/script-review` |
| 确认脚本 | `POST /api/projects/{project_id}/chapters/{chapter_id}/script/confirm` |
| 单章 TTS | `POST /api/projects/{project_id}/chapters/{chapter_id}/tts/generate` |
| 批量脚本 | `POST /api/projects/{project_id}/chapters/script-graph-batch` |
| 批量音频 | `POST /api/projects/{project_id}/chapters/tts-batch` |
| 合成全集 | `POST /api/projects/{project_id}/audio/full` |
| 下载全集 | `GET /api/projects/{project_id}/audio/full/{task_id}/file` |
| 导出分章 ZIP | `GET /api/projects/{project_id}/audio/chapters/export` |

## 数据与产物

运行数据默认保存在：

```text
storage/
```

每个项目会有独立目录：

```text
storage/projects/{project_id}/
```

典型产物包括：

- PDF 原文件或导入副本。
- parse run 记录。
- 章节正文 txt。
- analysis / plan / script / review JSON。
- 火山/豆包 TTS request、event log 和 MP3。
- 全集 MP3 manifest。
- 分章 MP3 ZIP manifest。

`storage/`、`.env`、日志、测试输出和 tessdata 语言包都不会被提交。

## 开发检查

后端语法检查：

```powershell
python -m compileall backend\app backend\scripts
```

前端测试与构建：

```powershell
Set-Location frontend
npm run test
npm run build
```

当前测试策略以关键状态计算、PDF 标题推断、LangGraph 结果兼容和 smoke scripts 为主。涉及真实 LLM / TTS 的流程依赖 `.env` 中的外部服务密钥，默认不在 CI 中自动调用。

## 安全边界

- 不提交 `.env`。
- 不提交真实 API Key、Access Token、App Key。
- 不提交 `storage/` 运行产物。
- 不提交测试输出、日志和本机 tessdata。
- 前端只调用后端 API，不应直接暴露外部服务密钥。
- 后端返回项目配置时应持续保持密钥脱敏。

## 接手顺序

新窗口或新 Agent 继续开发时，优先阅读：

1. `PROJECT-STATUS.md`
2. `tasks/TASKS-v0.1.md`（V2 任务清单）
3. `DECISION-LOG-微信读书播客Agent.md`
4. `ADDENDUM-微信读书播客Agent.md`
5. `PRD-微信读书播客Agent.md`
6. `docs/ARCHITECTURE-MULTI-AGENT.md`

当前本机开发目录：

```text
E:\Agent项目\微信读书播客ai
```

## v3 版本更新目标

v3 目标是把当前“本地可跑通的整书播客工作台”升级为更稳定、更适合连续生产的版本，重点从单点功能补齐转向质量管理、失败恢复和交付体验。

- 生产中控台 v3：集中展示整书进度、章节状态、批量脚本审核结果、失败章节和下一步操作建议。
- 内容质量 v3：强化 Reader Insight、Book Profile、Script Review 的联动，让整本书的脚本风格、信息密度和角色分工更一致。
- 解析验收 v3：完善低置信章节筛选、OCR 风险提示、目录修订记录和章节结构变更反馈。
- TTS 稳定性 v3：增加失败原因分类、重试建议、失败章节续跑、耗时和轮次统计。
- 交付管理 v3：补齐分章 MP3、全集 MP3、ZIP、manifest、播放/下载状态的交付检查清单。
- 演示与文档 v3：补充 GitHub README 截图、完整流程演示素材和典型长书案例说明。
