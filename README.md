# 微信读书播客 AI

本项目是一个本地单机 Web 工作台，用于将微信读书相关书籍 PDF、评论/笔记和角色声线配置转成可审核、可编辑、可重跑的双人播客生产流程。

项目根目录：

```text
E:\Agent项目\微信读书播客ai
```

## 新窗口接手顺序

新开窗口或新 Agent 继续开发时，优先阅读：

1. `PROJECT-STATUS.md`
2. `tasks/TASKS-v0.1.md`
3. `DECISION-LOG-微信读书播客Agent.md`
4. `ADDENDUM-微信读书播客Agent.md`
5. `PRD-微信读书播客Agent.md`

## 当前目标

v0.1 单章真实闭环：

```text
创建项目
→ 导入 PDF
→ PDF 解析和章节保存
→ DeepSeek 单章分析
→ DeepSeek 单章播客策划
→ DeepSeek 分轮次脚本
→ 人工确认
→ 火山/豆包 action=3 TTS
→ 单章 MP3
```

## 项目结构

```text
backend/      FastAPI backend, SQLite, workflows, services
frontend/     React/Vite workbench
storage/      Local runtime data, ignored by git
tasks/        Task tracking docs for handoff
scripts/      Experiments and utilities
tests/        Tests and smoke checks
```

## 安全规则

不要提交真实 API keys。复制 `.env.example` 为 `.env`，只在本地填写密钥。
