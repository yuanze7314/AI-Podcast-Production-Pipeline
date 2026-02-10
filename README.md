# AI Podcast Generator

[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-green)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()

将书籍转换为 AI 播客的三阶段流水线系统。

## 目录

- [项目简介](#项目简介)
- [功能特点](#功能特点)
- [技术架构](#技术架构)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [项目结构](#项目结构)
- [配置说明](#配置说明)
- [API 参考](#api-参考)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 项目简介

AI Podcast Generator 是一个端到端的自动化系统，能够将任意书籍（PDF 格式）转换为高质量的双人 AI 播客音频。

### 核心流程

```
输入书籍（PDF）
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: 数据层 - 原子化                                  │
│  • PDF 解析与清洗                                          │
│  • 评论分析 → 定调元数据 (metadata.json)                    │
│  • 章节内容矿工 → 逻辑原子 + 金句 (chapter_xx.json)        │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: 编剧层 - 剧本化                                  │
│  • AI 编剧 → 对话初稿                                       │
│  • AI 导演 → 口语润色                                       │
│  • AI 审核 → 安全质检                                       │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: 演播层 - 协议化                                  │
│  • 载荷组装 → API 格式转换                                  │
│  • API 调度 → 豆包 TTS WebSocket                            │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
输出播客（MP3）
```

### 应用场景

- 📚 **知识付费**：将书籍内容转化为音频课程
- 🎧 **有声读物**：自动生成有声书
- 📻 **播客制作**：批量生产播客内容
- ♿ **无障碍阅读**：为视障用户提供音频内容

---

## 功能特点

### 多 Agent 协作架构

系统采用 5 个专业 AI Agent 协作：

| Agent | 角色 | 职责 |
|-------|------|------|
| Agent 1 | 评论分析师 | 分析读者评论，确定播客基调 |
| Agent 2 | 章节内容矿工 | 提取逻辑原子和金句 |
| Agent 3 | 编剧 | 将知识转化为对话脚本 |
| Agent 4 | 导演 | 润色对话，增加口语化 |
| Agent 5 | 审核员 | 安全检查和质量把关 |

### 双人对话模式

播客采用自然的双人对话形式：

- **Alice**（咪仔同学）：活泼好奇的提问者，代表听众视角
- **Dr.Ye**（叶博士）：睿智沉稳的回答者，代表专家视角

### 高质量语音合成

使用豆包火山引擎的播客 TTS 服务，支持：
- 自然对话节奏
- 多角色声音区分
- 背景音乐（可选）
- AI 生成水印（可选）

---

## 技术架构

### 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js 18+ |
| 模块系统 | ES Modules |
| LLM 客户端 | OpenAI 兼容协议 / Google Gemini |
| TTS 服务 | 豆包火山引擎 |
| PDF 处理 | pdf-parse |
| WebSocket | ws |

### 目录结构

```
ai-podcast-generator/
├── src/
│   ├── agents/                  # AI Agent 封装
│   │   └── index.js             # Agent 执行器
│   ├── config/                  # 配置文件
│   │   └── voice_map.json       # 声音映射配置
│   ├── services/                # 服务模块
│   │   ├── llm-client.js        # LLM 客户端
│   │   ├── tts-client.js       # 标准 TTS 客户端
│   │   └── podcast-tts.js       # 播客 TTS 客户端
│   ├── templates/               # Prompt 模板
│   │   └── system-prompts.js   # Agent Prompt 模板
│   ├── utils/                  # 工具函数
│   │   └── pdf-parser.js       # PDF 解析器
│   ├── orchestrate.js          # 主流程编排器
│   ├── run-phase1.js           # Phase 1 入口
│   ├── run-phase2.js           # Phase 2 入口
│   ├── run-phase3.js           # Phase 3 入口
│   └── batch-generate.js       # 批量生成脚本/                        #
├── temp临时文件目录
│   ├── raw_chapters/           # 原始章节文本
│   └── processed/              # 处理后的章节档案
├── output/                      # 输出目录
│   ├── config/                 # 定调元数据
│   │   └── metadata.json
│   ├── scripts/                # 对话脚本
│   └── final/                  # 最终音频
│       └── *.mp3
├── 测试书籍/                    # 测试数据
├── package.json
├── .env.example
└── README.md
```

---

## 快速开始

### 前置条件

- Node.js 18.0 或更高版本
- npm 或 yarn
- 豆包火山引擎账号（用于 TTS）
- LLM API 密钥（OpenAI 或 Gemini）

### 步骤 1：克隆项目

```bash
git clone https://github.com/yourusername/ai-podcast-generator.git
cd ai-podcast-generator
```

### 步骤 2：安装依赖

```bash
npm install
```

### 步骤 3：配置环境变量

复制示例配置并填写你的 API 密钥：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# ============================================
# 豆包 API 凭证
# 从火山引擎控制台获取：https://console.volcengine.com/speech/service/10028
# ============================================
VOLCENGINE_APP_ID=your-app-id
VOLCENGINE_ACCESS_TOKEN=your-access-token

# ============================================
# LLM API 配置
# 支持 OpenAI 兼容协议（包括 Azure、本地部署等）
# 或 Google Gemini
# ============================================
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# ============================================
# 输入文件配置
# ============================================
BOOK_PATH=./测试书籍/蛤蟆先生去看心理医生.pdf
REVIEWS_PATH=./测试书籍/相关评论三条.txt
TOC_PATH=./测试书籍/蛤蟆先生去看心理医生目录.txt
```

### 步骤 4：准备输入文件

```
测试书籍/
├── 蛤蟆先生去看心理医生.pdf     # 书籍 PDF
├── 蛤蟆先生去看心理医生目录.txt  # 目录文件
└── 相关评论三条.txt             # 读者评论
```

**目录文件格式**：
```
第一章：走进心理咨询室
第二章：抑郁的来源
第三章：愤怒的意义
...
```

**评论文件格式**：
```
这本书真的治愈了我，让我重新认识了自己...
非常专业的心理学入门读物，推荐给有困惑的朋友...
读完后对生活有了新的理解...
```

### 步骤 5：运行系统

```bash
# 运行完整流程（三个阶段）
npm start

# 或分阶段运行
npm run phase1    # 仅运行 Phase 1
npm run phase2    # 仅运行 Phase 2
npm run phase3    # 仅运行 Phase 3
```

---

## 使用指南

### 运行完整流程

```bash
npm start
```

这将依次执行：
1. Phase 1：生成 `metadata.json` 和 `chapter_xx.json`
2. Phase 2：生成 `final_script.json`
3. Phase 3：生成 `podcast_xx.mp3`

### 分阶段运行

#### Phase 1：数据处理

```bash
npm run phase1
```

输出：
- `output/config/metadata.json` - 播客定调
- `temp/processed/chapter_*.json` - 章节档案

#### Phase 2：脚本生成

```bash
npm run phase2
```

输出：
- `output/scripts/script_*.json` - 编剧初稿
- `output/scripts/polished_*.txt` - 导演润色
- `output/final/final_script.json` - 最终脚本

#### Phase 3：音频合成

```bash
npm run phase3
```

输出：
- `output/final/podcast_*.mp3` - 播客音频

### 批量生成音频

如果音频生成失败，可以使用批量脚本重新生成：

```bash
node src/batch-generate.js
```

此脚本会跳过已存在的文件，支持断点续传。

---

## 配置说明

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `VOLCENGINE_APP_ID` | 是 | 火山引擎应用 ID |
| `VOLCENGINE_ACCESS_TOKEN` | 是 | 火山引擎访问令牌 |
| `OPENAI_API_KEY` | 是 | LLM API 密钥 |
| `OPENAI_BASE_URL` | 否 | LLM API 地址（默认：OpenAI 官方） |
| `OPENAI_MODEL` | 否 | 模型名称（默认：gpt-4o） |
| `BOOK_PATH` | 否 | 书籍路径 |
| `REVIEWS_PATH` | 否 | 评论文件路径 |
| `TOC_PATH` | 否 | 目录文件路径 |

### 声音配置

编辑 `src/config/voice_map.json` 自定义声音：

```json
{
  "speakers": {
    "Alice": {
      "voice_id": "zh_female_mizaitongxue_v2_saturn_bigtts",
      "name": "咪仔同学",
      "description": "年轻女性，活泼开朗"
    },
    "Dr_Ye": {
      "voice_id": "zh_male_dayixiansheng_v2_saturn_bigtts",
      "name": "大衣先生",
      "description": "成熟男性，睿智沉稳"
    }
  },
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000,
    "speech_rate": 0
  }
}
```

### 可用声音列表

| 系列 | 女声 | 男声 |
|------|------|------|
| 黑猫侦探社咪仔 | `zh_female_mizaitongxue_v2_saturn_bigtts` | `zh_male_dayixiansheng_v2_saturn_bigtts` |
| 刘飞和潇磊 | - | `zh_male_liufei_v2_saturn_bigtts` |
| | - | `zh_male_xiaolei_v2_saturn_bigtts` |

---

## API 参考

### AgentRunner

AI Agent 执行器类。

```javascript
import { agentRunner } from './src/agents/index.js';

// 运行评论分析师
const metadata = await agentRunner.runToneAnalyst(reviewsPath, outputPath);

// 运行章节矿工
const chapterData = await agentRunner.runChapterMiner(metadataPath, chapterText, chapterId, outputPath);

// 运行编剧
const script = await agentRunner.runScreenwriter(metadataPath, chapterPath, outputPath);

// 运行导演
const polished = await agentRunner.runDirector(scriptPath, outputPath);

// 运行审核
const result = await agentRunner.runCensor(scriptPath, outputPath);

// 批量处理章节
const results = await agentRunner.batchProcessChapters(metadataPath, chaptersDir, outputDir);
```

### PodcastTTSClient

播客 TTS 客户端。

```javascript
import { podcastTTSClient } from './src/services/podcast-tts.js';

const result = await podcastTTSClient.generatePodcast(
  scriptPath,      // 对话脚本路径
  voiceMapPath,    // 声音配置路径
  outputPath       // 输出音频路径
);

console.log(result.outputPath);  // 输出文件路径
console.log(result.size);        // 文件大小（字节）
```

### LLMClient

LLM 客户端。

```javascript
import { llmClient } from './src/services/llm-client.js';

// 发送消息
const response = await llmClient.chat(systemPrompt, userContent, options);

// 发送消息并解析 JSON
const data = await llmClient.chatJSON(systemPrompt, userContent);

// 流式响应
for await (const chunk of llmClient.chatStream(systemPrompt, userContent)) {
  process.stdout.write(chunk);
}
```

---

## 常见问题

### Q1: TTS 生成失败怎么办？

1. 检查 `VOLCENGINE_APP_ID` 和 `VOLCENGINE_ACCESS_TOKEN` 是否正确
2. 确认火山引擎服务已开通：https://console.volcengine.com/speech/service/10028
3. 查看错误日志，确认是网络问题还是参数问题
4. 使用批量生成脚本重试：`node src/batch-generate.js`

### Q2: LLM 调用失败怎么办？

1. 检查 `OPENAI_API_KEY` 是否有效
2. 如果使用代理，确保 `OPENAI_BASE_URL` 配置正确
3. 系统已内置重试机制（最多 3 次）

### Q3: 如何自定义播客风格？

1. 修改 `src/templates/system-prompts.js` 中的 Prompt 模板
2. 编辑 `metadata.json`（由 Agent 1 生成）
3. 调整 `src/config/voice_map.json` 中的声音配置

### Q4: 如何处理大书籍？

系统会自动分章节处理，但需要注意：
- 确保 LLM 上下文窗口足够大
- 建议每章不超过 10000 字
- 可以调整 `MAX_TOKENS` 参数

### Q5: 音频生成很慢？

1. TTS 服务本身需要 1-2 分钟生成完整音频
2. 网络延迟会影响速度
3. 批量生成时已内置 3 秒间隔，避免限流

### Q6: 支持其他语言吗？

当前版本主要支持中文播客。如需支持其他语言：
1. 修改声音配置为对应语言的声音 ID
2. 调整 Prompt 模板的语言设置
3. 准备对应语言的输入文件

---

## 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交改动：`git commit -m 'Add my feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 创建 Pull Request

### 开发指南

- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化
- 确保添加充分的注释
- 编写测试用例（如果适用）

---

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

---

## 致谢

- [豆包火山引擎](https://www.volcengine.com/) - TTS 服务
- [OpenAI](https://openai.com/) - LLM 服务
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) - PDF 处理

---

## 更新日志

### v1.0.0 (2024)

- 初始版本发布
- 支持三阶段完整流程
- 支持 OpenAI 和 Gemini LLM
- 支持豆包播客 TTS
- 5 个 AI Agent 协作
