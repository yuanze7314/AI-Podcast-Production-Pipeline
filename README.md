# AI 播客生产流水线

一个面向个人创作者的本地 AI 播客制作工具。它可以把书籍 PDF、目录和读者评论转换为可审阅、可修改、可分章生成音频的双人播客项目，最后合成为完整 MP3。

项目重点不是一次性“黑盒生成”，而是把生产流程拆成清晰阶段：先提炼章节内容，再生成对话脚本，人工审阅文本，按章节生成音频，最后合成完整节目。

## 主要能力

- 通过网页控制台创建和管理播客项目
- 输入书籍 PDF、目录 TXT、读者评论 TXT 和声线配置
- 在网页中填写 Agent 使用的 OpenAI 兼容 LLM API
- 在网页中填写豆包/火山引擎播客 TTS API
- 根据目录自动识别章节
- 分阶段运行 Phase 1、Phase 2、Review、Audio、Merge
- 查看每章生成的对话文本，并人工修改
- 保存单章文本后同步生成 TTS JSON
- 单独重跑某一章脚本
- 单独生成某一章音频
- 修改某一章后重新合成完整音频
- 查看阶段进度，并支持终止正在运行的任务

## 生产流程

```text
PDF 书籍 + 目录 TXT + 读者评论 TXT
  -> Phase 1：解析书籍，提炼章节知识
  -> Phase 2：生成、润色、审核对话脚本
  -> Review：导出可人工审阅的 Markdown 对话文本
  -> Audio：按章节生成播客音频
  -> Merge：合成完整 MP3
```

## 快速启动

```bash
npm install
npm run ui
```

打开浏览器访问：

```text
http://localhost:4317
```

如果只想使用命令行，也可以运行：

```bash
npm start
```

## 网页控制台

网页控制台适合实际制作时使用。每个项目都会保存独立配置和产物，默认位于：

```text
projects/<project-id>/
  project.json
  temp/
  output/
```

网页中可以完成：

- 保存项目输入
- 读取目录并列出章节
- 分阶段生成内容
- 逐章查看和编辑对话文本
- 逐章生成音频
- 重新合成完整音频
- 查看产物路径和任务进度
- 终止长时间运行的制作任务

详细使用说明见：[docs/WEB_USAGE.md](docs/WEB_USAGE.md)

项目介绍文档见：[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)

## 命令行

```bash
npm run status              # 查看当前默认项目产物状态
npm run ui                  # 启动本地网页控制台
npm run phase1              # 解析 PDF 并提炼章节知识
npm run phase2              # 生成、润色、审核对话脚本
npm run review              # 导出可审阅对话文本
npm run audio               # 生成全部分章音频
node src/cli.js audio 03    # 只生成第 3 章音频
npm run merge               # 合成完整 MP3
npm start                   # 运行完整 CLI 流水线
```

## 主要目录

```text
src/
  agents/                 # 多阶段 Agent 编排
  config/                 # 配置与声线映射
  services/               # LLM 与 TTS 客户端
  utils/                  # PDF、音频、脚本解析等工具
  pipeline.js             # 核心生产流水线
  server.js               # 本地网页控制台服务
web/                      # 前端控制台
docs/                     # 使用说明与项目介绍
projects/                 # 本地项目数据，默认不提交
```

## 主要产物

| 路径 | 说明 |
| --- | --- |
| `temp/raw_chapters/` | 从 PDF 提取的原始章节文本 |
| `temp/processed/chapter_*.json` | 每章提炼后的知识档案 |
| `output/config/metadata.json` | 播客基调、受众、风格等元数据 |
| `output/scripts/final_script.json` | Phase 2 生成的完整脚本 |
| `output/review/dialogue_*.md` | 可人工审阅的章节对话文本 |
| `output/review/dialogue_*.json` | TTS 使用的结构化对话 |
| `output/audio/podcast_ch*.mp3` | 分章音频 |
| `output/final/podcast_full.mp3` | 最终合成的完整播客 |
| `output/run_report.json` | 阶段运行报告 |

网页项目的产物位于：

```text
projects/<project-id>/output/
```

## 配置

复制 `.env.example` 为 `.env` 后填写：

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

VOLCENGINE_APP_ID=your-app-id
VOLCENGINE_ACCESS_TOKEN=your-access-token
VOLCENGINE_APP_KEY=your-app-key
```

网页项目表单中的配置优先级高于 `.env`。

## 安全说明

本项目默认不会提交以下本地产物和敏感配置：

- `.env`
- `.env.local`
- `projects/`
- `temp/`
- `output/`
- `node_modules/`
- `*.log`

网页接口返回项目配置时会对 API Key、Access Token 和 App Key 做脱敏处理。

## 依赖

- Node.js
- OpenAI 兼容 LLM API
- 豆包/火山引擎播客 TTS API
- 可选：`ffmpeg`，用于更稳定地合成 MP3

如果本机没有 `ffmpeg`，系统会退回到二进制拼接方式，并在运行报告中记录提示。

## 适用场景

- 根据书籍生成长音频播客
- 制作章节制知识节目
- 在 AI 生成和人工编辑之间保留可控流程
- 需要先审阅文本，再付费生成 TTS 音频的个人项目
