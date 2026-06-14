# Adaptive Multi-Agent Production Architecture

## 1. Purpose

本文档定义微信读书播客 AI 的目标创作架构：Workflow 执行层 + Agent 调度层 + 分类型 Agent Team。它补充 PRD 和 ADDENDUM，解决“不同类型 PDF 不应进入同一套固定播客生成逻辑”的问题。

## 2. Core Principle

Workflow 负责执行秩序，Agent 负责内容智能。

- Workflow 负责：能不能做、什么时候做、做完存哪里、是否允许进入下一步。
- Agent 负责：怎么理解、怎么策划、怎么表达、怎么审核。

Agent 不能直接调用 TTS、不能直接修改项目状态、不能直接覆盖已确认脚本、不能直接删除文件。Agent 只能输出结构化建议或内容产物，再由 Workflow 校验、保存和推进。

## 3. Six-Layer Architecture

1. Workflow Execution Layer：项目管理、PDF 解析、文件存储、状态机、用户确认、TTS 调用和音频合成。
2. Content Understanding Layer：通过 Reader Insight Agent 提炼评论/笔记/划线中的读者需求、情绪基调、真实案例和脚本机会点。
3. Agent Scheduling Layer：判断 PDF 属于哪类书籍，并选择播客模式和 Agent Team。
4. Typed Agent Team Layer：根据书籍类型启用 Concept Explainer、Narrative Story、Research & Report Explainer 等团队。
5. Review & Revision Layer：类型化审核，并把问题转为结构化 revision issue，支持局部重写。
6. Audio Production Layer：脚本确认后调用 TTS，生成分章节音频和完整播客。

## 4. Workflow Execution Layer

Workflow 是确定性工程执行层，不负责内容判断和创作。

| 模块 | 职责 | 是否由 Agent 执行 |
|---|---|---|
| Project Workflow | 创建项目、保存配置、恢复历史任务 | 否 |
| PDF Ingestion Workflow | 上传 PDF、检测文本层、触发 OCR fallback、生成基础文本 | 否 |
| Parsing Workflow | 提取页文本、目录候选、章节候选、文本块 | 否 |
| Artifact Workflow | 保存 book_profile、podcast_strategy、script_blocks、review_report 等中间产物 | 否 |
| State Machine Workflow | 控制项目阶段流转，例如待分类、待确认、待生成、待审核、待 TTS | 否 |
| Human Gate Workflow | 控制用户确认目录、书籍类型、播客策略、章节脚本、音频 | 否 |
| Validation Workflow | 对 Agent 输出做 JSON schema 校验和字段完整性校验 | 否 |
| TTS Workflow | 封装豆包/火山 TTS 请求、记录 round 级事件、失败重试 | 否 |
| Audio Merge Workflow | 合成分章音频、全集音频、导出文件 | 否 |
| Logging Workflow | 保存错误日志、调用日志、成本估算、重跑记录 | 否 |

## 5. Content Understanding Layer

Content Understanding Layer 是 Agent Scheduling Layer 的前置输入层。它不直接决定播客模式，也不写脚本，而是把读者评论、个人笔记和划线转化为可供后续 Agent 使用的读者洞察。

### 5.1 Reader Insight Agent

目标：从高赞评论、读书笔记、划线和用户补充材料中提炼读者真实关注点、情绪基调、困惑、争议点、真实案例和脚本机会点。

输入：高赞评论、个人笔记、划线、章节标题、可选章节正文摘要、用户目标听众。

输出：`reader_insight.json`

关键字段：

```json
{
  "overall_sentiment": "温暖、治愈、带有自我反思",
  "reader_pain_points": [
    "读者把蛤蟆的低谷联想到自己的情绪困境",
    "读者关心心理咨询为什么不是直接给建议"
  ],
  "high_resonance_topics": ["原生家庭", "自我接纳", "情绪识别"],
  "reader_questions": [
    "为什么蛤蟆明明有朋友，还是会陷入抑郁？"
  ],
  "real_life_cases": [
    {
      "case": "有读者提到自己也长期讨好别人，读到蛤蟆开始表达愤怒时很受触动。",
      "usable_for": ["chapter_07", "chapter_11"]
    }
  ],
  "highlight_quotes": [
    {
      "quote": "很多人第一次意识到，自己不是没有情绪，而是不敢承认情绪。",
      "source": "reader_comment"
    }
  ],
  "script_opportunities": [
    {
      "chapter": "chapter_03",
      "suggestion": "让 Alice 代表读者追问：心理咨询为什么不是安慰，而是陪人看见自己？"
    }
  ]
}
```

Reader Insight Agent 的输出会影响：

- Book Profiler Agent：辅助判断读者如何理解这本书，以及书籍更偏概念讲解、故事叙事还是混合类型。
- Podcast Router Agent：决定播客基调、听感、角色互动方式和优先回应的读者需求。
- Typed Analysis Agent：补充每章应重点解释、讲述或澄清的内容。
- Typed Script Agent：为 Alice 的提问、案例引入和情绪共鸣提供素材。
- Typed Review Agent：增加“是否回应读者高共鸣问题”的审核维度。

评论输入为空时，Reader Insight Agent 应输出 `empty_input=true` 的结构化结果，Workflow 允许后续流程继续。

## 6. Agent Scheduling Layer

Agent Scheduling Layer 不直接写脚本，而是回答“这本书应该以什么方式被播客化”。

### 6.1 Book Profiler Agent

目标：判断输入 PDF 属于哪类内容，并提取用于播客路由的内容特征。

输入：PDF 解析结果、目录候选、章节标题、章节正文抽样、`reader_insight.json`、目标听众、目标时长。

输出：`book_profile.json`

关键字段：

```json
{
  "book_category": "concept_explainer",
  "sub_category": "psychology",
  "confidence": 0.86,
  "classification_evidence": [],
  "content_features": {
    "concept_density": "high",
    "narrative_density": "medium",
    "data_density": "low",
    "argument_density": "high",
    "policy_density": "low"
  },
  "recommended_mode": "concept_explainer_podcast",
  "alternative_mode": "narrative_story_podcast"
}
```

MVP 支持三类书籍：

| 类型 | 覆盖范围 | 判断重点 |
|---|---|---|
| 概念讲解类 | 经济学 / 心理学 / 哲学 / 社会科学通识 | 概念密度、理论密度、论证结构 |
| 故事叙事类 | 传记 / 历史 / 小说 / 非虚构故事 | 人物、事件、时间线、冲突转折 |
| 学术报告类 | 行业报告 / 政策文件 / 白皮书 / 研究报告 | 数据、政策术语、框架、结论和影响 |

### 6.2 Podcast Router Agent

目标：根据书籍画像选择播客生产模式，并决定启用哪个 Agent Team。

输入：`book_profile.json`、`reader_insight.json`、用户目标、目标时长、输出格式。

输出：`podcast_strategy.json`

关键字段：

```json
{
  "selected_mode": "concept_explainer_podcast",
  "selected_team": "Concept Explainer Team",
  "routing_reason": "该书概念密度高，适合通过概念解释、类比和现实应用降低理解门槛。",
  "episode_structure": [
    "reader_confusion_intro",
    "core_concept_explanation",
    "analogy_or_example",
    "original_argument",
    "real_world_application",
    "chapter_summary"
  ],
  "role_interaction_pattern": {
    "Alice": "普通读者和困惑提出者",
    "Dr_Ye": "概念解释者和类比提供者"
  },
  "review_policy": "concept_accuracy_and_clarity_first"
}
```

### 6.3 Agent Team Composer

MVP 可以先用规则映射实现，不一定作为独立 LLM Agent：

```text
concept_explainer_podcast -> Concept Explainer Team
narrative_story_podcast -> Narrative Story Team
research_report_explainer_podcast -> Research & Report Explainer Team
```

## 7. Typed Agent Team Layer

MVP 每类 Agent Team 保留三个 Agent：Analysis Agent、Script Agent、Review Agent。

### 7.1 Concept Explainer Team

适用：经济学、心理学、哲学、社会科学通识、理论框架类书籍。

目标：把抽象概念、理论框架和作者论证转化为普通听众能理解的播客内容。

听感：Alice 提出普通读者困惑；Dr_Ye 用简单话解释；Alice 追问现实意义；Dr_Ye 用类比、案例、生活场景帮助理解。

Agent：

- Concept Analysis Agent：核心概念提取、理论框架识别、作者论证逻辑、读者难点、解释机会点。
- Concept Script Agent：类比生成、解释型对话设计、口播化改写、TTS 友好表达。
- Concept Review Agent：概念准确性、论证完整性、解释清晰度、类比合理性、角色稳定性、TTS 友好度。

### 7.2 Narrative Story Team

适用：传记、历史、小说、非虚构故事。

目标：把人物、事件、时间线、冲突和转折组织成有叙事节奏的播客，而不是机械复述章节。

听感：Alice 制造悬念、追问人物动机、推动故事继续；Dr_Ye 补充背景、解释事件意义、分析人物选择。

Agent：

- Narrative Analysis Agent：时间线、人物关系、关键事件、冲突转折、场景候选。
- Narrative Script Agent：故事钩子、事件推进、人物动机、冲突转折、转场、口播化。
- Narrative Review Agent：时间线准确性、人物关系、叙事连贯性、冲突表达、主题收束、角色稳定性、TTS 友好度。

### 7.3 Research & Report Explainer Team

适用：行业报告、政策文件、白皮书、咨询报告、研究报告。

目标：把高密度、结构化、偏正式的报告文本转化为清晰、克制、可快速理解的播客内容。

听感：Alice 代表普通听众追问“这份报告和我有什么关系”；Dr_Ye 解释报告/政策背景、框架、关键结论和影响。

Agent：

- Report Analysis Agent：问题框定、报告/政策框架、关键数据和结论、影响对象、结论边界和风险。
- Report Script Agent：报告口语化解读、政策/行业影响说明、问答结构、结论边界、TTS 友好改写。
- Report Review Agent：数据准确性、政策表述准确性、结论边界、结构清晰度、原文/解读区分、角色稳定性、TTS 友好度。

## 8. Review & Revision Layer

Review Agent 不直接整章重写，而是输出结构化 revision issue。所有 issue 进入 `revision_issue_queue.json` 或数据库表。

```json
{
  "issue_id": "issue_ch03_004",
  "source_agent": "Concept Review Agent",
  "target_agent": "Concept Script Agent",
  "target_block_id": "ch03_b002",
  "issue_type": "analogy_over_simplification",
  "severity": "medium",
  "instruction": "保留行为方向盘的类比，但补充说明激励不只来自外部规则，也包括内在动机和社会规范。",
  "status": "pending"
}
```

Workflow 根据 issue 的 `target_agent` 和 `target_block_id` 触发局部重写。已锁定脚本块不能被覆盖。

## 9. Human-in-the-loop Gates

| Gate | 位置 | 作用 |
|---|---|---|
| G1 目录确认 | PDF 解析后 | 用户确认章节结构 |
| G2 书籍类型确认 | Book Profiler 后 | 用户确认概念讲解类 / 故事叙事类 / 学术报告类 |
| G3 播客策略确认 | Podcast Router 后 | 用户确认播客模式、角色互动方式、目标时长 |
| G4 脚本确认 | Review Agent 后 | 用户编辑、锁定并确认脚本 |
| G5 音频确认 | TTS 生成后 | 用户确认分章音频和全集音频 |

未通过前置 Gate，后续 Workflow 不允许执行。

## 10. Overall Flow

```text
用户上传 PDF / 评论 / 笔记 / TTS 配置
  -> PDF Ingestion Workflow
  -> 目录候选与章节候选生成
  -> G1 目录确认
  -> Reader Insight Agent
  -> Book Profiler Agent
  -> G2 书籍类型确认
  -> Podcast Router Agent
  -> G3 播客策略确认
  -> Agent Team Composer 选择类型团队
  -> Typed Analysis Agent
  -> Typed Script Agent
  -> Typed Review Agent
  -> Revision Issue Queue / 局部重写
  -> G4 脚本确认
  -> TTS Workflow
  -> Audio Merge Workflow
  -> G5 音频确认
  -> 导出分章节音频和完整播客
```

## 11. Compatibility With Current Implementation

当前已实现的 `ChapterAnalysisAgent / PodcastPlanAgent / ScriptWriterAgent` 视为 v0.1 的通用 baseline。新架构不废弃它们，而是将其升级为 fallback 或默认类型团队之前的临时实现。

建议演进方式：

1. 保留当前 Stage 3 的脚本确认 + TTS payload 开发路线，尽快完成单章闭环。
2. 新增 Stage 2.5 或 v0.2：Reader Insight Agent + Book Profiler + Podcast Router + Typed Agent Team。
3. 在类型化 Agent Team 完成后，将通用 Agent 作为 unknown/mixed 类型 fallback。

## 12. Open Decision

是否立即把 Reader Insight / Book Profiler / Podcast Router 插入当前 v0.1 Stage 3 之前，需要产品确认。

选项：

- Option A：继续当前 Stage 3，先完成脚本确认和 TTS，类型化团队作为 v0.2。
- Option B：暂停 Stage 3，先实现 Reader Insight / Book Profiler / Podcast Router，再继续脚本确认和 TTS。

## 13. Implementation Status

2026-06-14 当前轻量实现状态：

- 已实现 Reader Insight Agent，支持评论 / 笔记 / 划线为空时输出 `empty_input=true`。
- 已实现 Book Profiler Agent，结合章节概览和 latest reader insight 输出书籍分类、角色人设和脚本质量规则。
- latest `reader_insight` / `book_profile` 已注入章节 analysis / plan / script 生成上下文。
- 已实现轻量 Script Review Agent，只输出审核报告，不自动改写脚本。
- 已明确不实现全书时长预算 / 章节过多自动压缩重点章节。
- Podcast Router、Typed Agent Team、自动 Review & Revision 仍暂缓。
