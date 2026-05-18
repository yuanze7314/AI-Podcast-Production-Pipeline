# 网站控制台使用说明

本文档说明如何通过本地网站控制台完成一个 AI 播客项目的生产、审阅、分章音频生成和完整音频合成。

## 1. 启动网站

在项目根目录运行：

```bash
npm install
npm run ui
```

浏览器打开：

```text
http://localhost:4317
```

如果端口被占用，可以在 `.env` 中设置：

```env
UI_PORT=4320
```

## 2. 创建项目

在左侧“输入”区域填写：

- 项目名称：用于区分不同播客项目
- 书籍 PDF 路径：例如 `./测试书籍/book.pdf`
- 读者评论路径：例如 `./测试书籍/reviews.txt`
- 目录路径：例如 `./测试书籍/toc.txt`
- 声线配置：默认 `./src/config/voice_map.json`

然后点击“保存项目”。每个项目会保存到：

```text
projects/<project-id>/project.json
```

每个项目都有独立产物目录：

```text
projects/<project-id>/output/
```

## 3. 填写 Agent 与豆包 TTS API

“Agent / LLM API”用于生成和润色对话脚本：

- API Key：OpenAI 兼容接口密钥
- Base URL：接口地址，例如 `https://api.openai.com/v1`
- Model：模型名，例如 `gpt-4o`

“豆包 TTS API”用于生成分章音频：

- App ID：火山引擎控制台中的应用 ID
- Access Token：火山引擎控制台中的访问令牌
- Endpoint、Resource ID、App Key：通常可以不填，默认使用项目内置配置

项目表单里的 API 配置优先级高于 `.env`。

## 4. 按阶段生产内容

推荐流程：

1. 点击“Phase 1 提取”：解析 PDF、目录和评论，生成章节知识。
2. 点击“Phase 2 编剧”：生成、润色并审核每章对话脚本。
3. 点击“导出审阅”：导出可人工编辑的 `dialogue_XX.md` 文本。
4. 在“章节工作台”逐章检查和修改文本。
5. 生成分章音频，确认无误后合成完整音频。

也可以点击“完整流水线”一次性运行全部阶段。

## 5. 使用章节工作台

点击“读取目录”后，页面会根据目录文件列出每一章。每章会显示：

- 是否已提炼章节知识
- 是否已有可编辑文本
- 是否已有分章音频
- 文本是否比音频更新，是否需要重新生成音频

点击任意章节后，右侧会显示该章：

- 可编辑 Markdown 对话文本
- 分章音频状态
- 分章音频播放器

修改文本后可以执行：

- “保存文本”：只保存当前章节文本，并同步生成 TTS 使用的 JSON。
- “保存并生成本章音频”：保存文本后，只重新生成当前章节的 mp3。
- “保存并重合成完整音频”：保存文本，重新生成当前章节音频，然后覆盖式重新合成 `podcast_full.mp3`。
- “重跑本章脚本”：重新调用 Agent 生成当前章节脚本，会覆盖该章现有文本。

章节文本保存到：

```text
projects/<project-id>/output/review/dialogue_XX.md
projects/<project-id>/output/review/dialogue_XX.json
```

分章音频保存到：

```text
projects/<project-id>/output/audio/podcast_chXX.mp3
```

完整音频保存到：

```text
projects/<project-id>/output/final/podcast_full.mp3
```

## 6. 重新生成完整音频

如果只改了某一章，推荐使用该章右侧的“保存并重合成完整音频”。系统会：

1. 保存当前章节文本。
2. 重新生成该章分章音频。
3. 按章节顺序重新合成完整音频。
4. 覆盖旧的 `output/final/podcast_full.mp3`。

如果已经手动生成好了所有分章音频，也可以点击顶部“合成完整音频”直接重新合成。

## 7. 常见问题

### 修改文本后为什么没有重新生成音频？

系统只会跳过“已经是最新”的分章音频。只要你保存了章节文本，对应的 JSON 会更新，音频会被标记为需要重新生成。

### 页面提示任务正在运行

同一个项目同一时间只允许一个任务运行。等待进度条完成后再执行下一步。

### 章节没有文本

通常是还没有完成 Phase 2，或者还没有点击“导出审阅”。先运行 Phase 2，再导出审阅文本。

### 完整音频合成失败

系统优先使用 `ffmpeg` 无损拼接 MP3。如果本机没有安装 `ffmpeg`，会退回到二进制拼接，并在 `run_report.json` 中记录提示。
