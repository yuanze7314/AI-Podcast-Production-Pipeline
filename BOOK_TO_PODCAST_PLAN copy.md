# 书籍转AI播客工作流开发计划
#数据层面切割
    模块设计文档：数据层（Data Layer）
1. 核心目标
将非结构化的电子书（PDF/EPUB）转化为结构化、原子化、带元数据的JSON档案库，为后续的“AI脚本”提供高质量的内容基础。

2. 核心架构逻辑
本模块采用“T型数据处理流程” ：

横向（Global）：提取全书元数据与目录结构，控制播客整体基调。

纵向（局部）：按章节物理切分，配合滑动窗口夺取细节，确保内容无遗漏。

流程图解
代码片段
graph TD
    Input[电子书源文件 PDF/EPUB] --> Parser(基础解析与清洗);
    Parser --> |前5%内容 + 目录| GlobalAgent[全书分析 Agent];
    Parser --> |全文内容| Splitter(章节物理切分器);

    %% 分支1: 全局元数据
    GlobalAgent --> |生成| Meta[metadata.json];
    GlobalAgent --> |生成| TOC[structure_map.json];

    %% 分支2: 章节细节处理
    Splitter -- 按H2/H3切分 --> RawChapters[原始章节文本];
    RawChapters -- 6k Token窗口+重叠 --> Windowing(滑动窗口切片);
    Windowing -- 提取观点/金句 --> Fragments[碎片化摘要];
    Fragments -- 聚合/去重 --> ChapterAgent[章节聚合 Agent];
    ChapterAgent --> |生成| ChapFiles[chapter_xx.json];

    %% 最终输出
    Meta & TOC & ChapFiles --> OutputFolder[/processed/book_id/];
3.详细处理步骤
步骤一：全局扫描（Global Scanning）
输入：书籍的前5-10%内容（封面、前言、目录、第一章）。

任务：识别书籍风格、观众画像及整体架构。

总量：

metadata.json：定义播客的人设参数（冷静/幽默）、BGM 风格、语速建议。

structure_map.json：提取目录树，用于后续章节间的“预告”和逻辑总线。

步骤二：章节物理切分 (Physical Split)
逻辑：基于Regex或DOM解析，识别H1/H2章节标题。

清洗：前往页眉、页脚、页码、图片占位符。

统计：独立的章节文本块（Raw Text）。

步骤三：窗口化提取(Windowing & Extraction)
策略： Map-Reduce 模式。

切片（地图）：将单章文本按6k Tokens切分（保留500 Tokens重叠区）。

达成目标：

核心逻辑：核心论点逻辑链。

黄金语录：必须保留3-5句原话（用于提升播客权威感）。

关键词：母语解释。

步骤四：头部聚合（Aggregation）
任务（Reduce）：完成章节下的所有片段提取结果合并。

处理：逻辑去重、金句筛选、生成该章节的完整综述（约800-1000字）。

总量：最终的章节数据文件。

4. 数据结构定义（JSON Schemas）
请严格遵守以下JSON结构，这是后续“剧本模块”的输入标准。

4.1 全书元数据 ( metadata.json)
JSON
{
  "book_info": {
    "title": "书名",
    "author": "作者",
    "category": "商业/历史/心理学",
    "core_message": "一句话概括全书核心思想（电梯演讲）"
  },
  "podcast_settings": {
    "target_audience": "目标听众画像（如：25岁职场新人）",
    "tone": "Deep/Humorous/Fast-paced",
    "host_persona_hint": "主持人应表现得像个好奇的学生，嘉宾应表现得像个耐心的导师",
    "bgm_mood": "Reflective/Upbeat"
  }
}
4.2 全书重构 ( structure_map.json)
JSON
{
  "total_chapters": 10,
  "chapters": [
    {
      "index": 1,
      "title": "第一章：认知革命",
      "hook": "本章解释了为什么智人能统治世界",
      "next_chapter_hint": "下一章我们将讨论农业革命是骗局还是进步"
    },
    { "index": 2, "title": "..." }
  ]
}
4.3 章节档案 ( chapter_xx.json)
JSON
{
  "chapter_index": 1,
  "title": "第一章标题",
  "content_summary": "本章详细讲述了...（800字逻辑通顺的综述）",
  "key_points": [
    { "point": "观点A", "explanation": "解释..." },
    { "point": "观点B", "explanation": "解释..." }
  ],
  "gold_quotes": [
    "原书金句1...",
    "原书金句2..."
  ],
  "keywords": ["关键词1", "关键词2"],
  "stats": {
    "word_count": 12000,
    "estimated_reading_time": 30
  }
}
5.文件存储目录结构
采用解耦存储方案，方便负载读取与单章调试。

纯文本
/output/processed/{book_id}/
├── metadata.json           # [全局] 全书灵魂
├── structure_map.json      # [全局] 全书骨架
├── chapters/
│   ├── chapter_01.json     # [局部] 第一章数据
│   ├── chapter_02.json     # [局部] 第二章数据
│   └── ...
└── logs/                   # 处理日志 (可选)
6. 开发注意事项（Architect's Notes）
切片工具推荐：不要手写正则切片，推荐使用langchain的RecursiveCharacterTextSplitter，它可以智能识别段落边界，避免切断句子。

提示修改关键点：在提取gold_quotes时，提示必须包含强约束：“请摘录原文，严禁或润色原句”。

内容错误处理：如果某章节内容过少（<500字），建议逻辑上将其合并入上一章或下一章，或者在structure_map.json中标记为skip: true。



没问题，我们保持一致的工程颗粒度。这是 数据层 (Data Layer) 的工程实施规格书。它定义了如何将一本乱糟糟的电子书，变成编剧层（Scripting Layer）那个精密机器所需的标准燃料。请直接参照此文档构建 src/document/ 和 src/ai/agents/data_agents/ 下的代码。模块三：数据层 (Data Layer) 工程规格书1. 模块级输入与输出 (System I/O)这是数据清洗模块（黑盒）的接口定义。类型数据对象来源描述输入raw_file.pdf / .epub用户上传原始电子书文件，包含页眉、页脚、乱码。输出metadata.json编剧层 (Input)全书的灵魂（人设基调、BGM风格、受众画像）。输出structure_map.json编剧层 (Director)全书的骨架（目录树、章节逻辑关系）。输出chapter_xx.json编剧层 (Writer)分章的血肉（清洗后的摘要、原书金句、关键词）。2. Agent 构建清单 (Agent Build List)我们需要构建 3 个不同职能的处理单元。🧠 Agent A: 全局分析师 (The Global Analyst)定位： 战略层。只读前 5% 的内容。输入 (Inputs): 书籍的前 10 页文本 (封面、序言、目录)。任务:定调: 分析本书是严肃心理学还是通俗读物？决定 Alice 和 Dr. Ye 的对话语态。建树: 提取目录结构，构建章节间的逻辑链（“下一章预告”的数据源）。输出 (Outputs): metadata.json, structure_map.json。⛏️ Agent B: 矿工 (The Content Miner)定位： 执行层。干脏活累活，并行工作。输入 (Inputs): 一个 6k Token 的文本切片 (Chunk)。任务:提取观点: 总结这段文字讲了什么核心逻辑。挖掘金句 (关键): 摘录 3-5 句原话。必须是原文，不能改写。关键词: 提取专有名词（如“习得性无助”）。输出 (Outputs): fragment_data.json (碎片化数据)。🏗️ Agent C: 建筑师 (The Architect)定位： 整合层。将碎片拼成章节。输入 (Inputs): 某章节下的所有 fragment_data.json 列表。任务:去重: 合并重复的观点。连贯: 将碎片化的摘要重写为一篇 800-1000 字的通顺综述。筛选: 从几十句金句中，选出最震撼的 5-8 句。输出 (Outputs): chapter_xx.json。3. 中间数据流转图 (Data Flow Pipeline)ShutterstockExplore这是你的 src/document/processor.js 需要调度的流程。Code snippetgraph TD
    %% 阶段 1: 物理层处理
    File[电子书源文件] --> Cleaner[正则清洗器]
    Cleaner -- 去除页眉页脚 --> CleanText[纯净文本]
    
    %% 阶段 2: 全局分析
    CleanText -- 提取前10k字 --> GlobalAgent[全局分析师]
    GlobalAgent --> Meta[输出: metadata.json]
    GlobalAgent --> Structure[输出: structure_map.json]
    
    %% 阶段 3: 切片与挖掘 (Map)
    CleanText -- 按H2/H3拆分 --> RawChapters[原始章节文本]
    RawChapters -- 滑动窗口(6k) --> Chunks[文本切片]
    Chunks -- 并发调用 --> MinerAgent[矿工 Agent]
    MinerAgent --> Fragments[输出: 碎片化JSON]
    
    %% 阶段 4: 聚合 (Reduce)
    Fragments -- 按章节分组 --> ArchitectAgent[建筑师 Agent]
    ArchitectAgent --> ChapterFile[输出: chapter_xx.json]
4. 关键数据结构快照4.1 全书元数据 (Metadata) - 全局分析师产出JSON// metadata.json
{
  "book_info": {
    "title": "蛤蟆先生去看心理医生",
    "author": "罗伯特·戴博德",
    "core_message": "通过童话隐喻，讲解TA沟通分析心理学。"
  },
  "podcast_settings": {
    "tone": "Healing/Warm", // 治愈/温暖
    "target_audience": "感到迷茫、需要心理慰藉的成年人",
    "bgm_style": "Piano/Ambient",
    "host_persona_tweak": "Alice 应该表现得像个迷路的孩子", // 微调人设
    "guest_persona_tweak": "Dr. Ye 应该表现得像苍鹭（书中角色）"
  }
}
4.2 章节档案 (Chapter Profile) - 建筑师产出这是编剧层最直接的输入源。JSON// chapter_01.json
{
  "chapter_index": 1,
  "title": "整个人都不太好",
  "summary": "本章通过蛤蟆先生的抑郁状态，引出了...", // 800字综述
  "gold_quotes": [
    "他觉得自己没有任何价值，也没有任何人爱他。",
    "所谓的快乐，不过是悲伤的假面。"
  ],
  "keywords": [
    { "term": "抑郁", "definition": "一种持续的情绪低落..." },
    { "term": "心理咨询", "definition": "..." }
  ],
  "stats": {
    "word_count": 5200,
    "reading_time": 15
  }
}
5. 工程约束与避坑 (Constraints)5.1 正则清洗 (The Cleaning Rules)在送给 AI 之前，必须用代码（Regex）干掉以下内容，否则 AI 会读出来：页码: ^\d+$ (如 "42")页眉/页脚: 包含书名或章节名的重复行。图片占位符: [image] 或 Figure x.x。URL: http://...5.2 窗口重叠 (Window Overlap)问题: 如果金句刚好被切在两个 Chunk 中间，会被截断。规范: 每个 6k Token 的 Chunk，必须包含 500 Token 的 Overlap (重叠区)。5.3 引用一致性校验 (Quote Validation)问题: 矿工 Agent 可能会自己编造“金句”。规范: 在 Architect (建筑师) 聚合时，最好加一步 Fuzzy Match (模糊匹配)，确认 Agent 提取的句子确实存在于 CleanText 原文中。如果找不到，丢弃该句子。


模块四：编剧层 (Scripting Layer) 工程规格书1. 模块级输入与输出 (System I/O)这是整个编剧模块（黑盒）的接口定义。类型数据对象来源/去向描述输入chapter_xx.json数据层本章的摘要、金句、关键词、统计数据。输入metadata.json数据层全书人设（Alice & Dr. Ye）、基调、目标受众。输入context_cache.json缓存系统上一章的“核心结论”和“结尾钩子”（用于连贯性）。输出script_xx.json演播层包含角色、台词、情绪标签 (mood)、音效标记的最终脚本。输出new_context.json缓存系统本章生成的结论和悬念，供下一章使用。2. Agent 构建清单 (Agent Build List)我们需要构建 3 个独立的 Agent。请在 src/ai/agents/ 下创建对应的处理逻辑。🤖 Agent A: 导演 (The Director)定位： 逻辑与结构的大脑。不写一句台词，只负责“分镜”。输入 (Inputs):chapter_summary (本章讲什么)prev_chapter_hook (上一章留了什么坑)4A_model_template (心理学标准叙事结构)处理逻辑 (Process):接龙: 用 prev_chapter_hook 设计开场白 (Hook)。结构化: 将摘要拆解进 4A 模型 (觉察 -> 接纳 -> 分析 -> 行动)。预告: 扫描下一章标题，设计结尾悬念。输出 (Outputs) -> beat_sheet.json:JSON{
  "beats": [
    {
      "step": 1,
      "section": "Awareness",
      "intent": "Alice 描述一种'明明很累却不想睡'的报复性熬夜心理。",
      "key_point_ref": "摘要中的第一点"
    },
    {
      "step": 2,
      "section": "Analysis",
      "intent": "Dr. Ye 引入'自我损耗'概念，必须引用金句 A。",
      "required_quote": "金句原文..."
    }
  ]
}
✍️ Agent B: 编剧 (The Writer)定位： 内容与情感的创作者。负责填肉。输入 (Inputs):beat_sheet.json (来自导演)gold_quotes (来自数据层，必须原文引用)personas (Alice & Dr. Ye 的详细性格 Prompt)处理逻辑 (Process):逐行生成: 根据 Beat Sheet 的每一步生成对话。口语化注入: 强制将书面语转换为口语（添加 "嗯..."、"那个..."）。情绪标注: 根据对话内容，分析并打上 TTS 情绪标签。输出 (Outputs) -> raw_script.json:JSON[
  {
    "role": "Alice",
    "text": "（叹气）叶医生，我最近总是感觉...",
    "mood": "depressed",
    "beat_ref": 1
  },
  ...
]
⚖️ Agent C: 审稿人 (The Reviewer)定位： 安全与质量的质检员。输入 (Inputs):raw_script.json (来自编剧)safety_guidelines (自杀干预、医疗免责声明)engagement_metrics (枯燥度阈值：单句 < 150字)处理逻辑 (Process):红线扫描: 检测是否有“建议自杀”或“绝对化诊断”。枯燥度扫描: 检测是否有长篇大论的说教。修正: 如果有问题，直接重写该段落；没问题则 Pass。输出 (Outputs) -> final_script.json:结构同 raw_script.json，但内容已清洗。3. 中间数据流转图 (Data Flow Pipeline)这是你的主程序 main.js 或 script_generator.js 需要调度的流程。Code snippetgraph TD
    %% 阶段 1: 准备数据
    Data[数据层: chapter_01.json] --> Director
    Context[缓存: context_cache.json] --> Director
    
    %% 阶段 2: 导演规划
    Director -- 提示词: 4A模型+连贯性 --> Beats[输出: beat_sheet.json]
    
    %% 阶段 3: 编剧撰写
    Beats --> Writer
    Quotes[金句库] --> Writer
    Personas[人设Prompt] --> Writer
    Writer -- 提示词: 口语化+情绪标 --> Raw[输出: raw_script.json]
    
    %% 阶段 4: 审稿清洗
    Raw --> Reviewer
    Rules[安全红线] --> Reviewer
    Reviewer -- 检查 & 修正 --> Final[输出: final_script.json]
    
    %% 阶段 5: 更新记忆
    Final --> MemoryExtractor[记忆提取器]
    MemoryExtractor --> NewContext[输出: new_context.json]
4. 关键数据结构快照4.1 节拍表 (Beat Sheet) - 导演产出这是编剧的“大纲”。JSON// beat_sheet.json
{
  "chapter_id": "ch01",
  "beats": [
    {
      "step_index": 1,
      "type": "Hook/Awareness",
      "instruction": "Alice 从生活场景切入...",
      "emotional_tone": "Anxious"
    },
    {
      "step_index": 2,
      "type": "Analysis",
      "instruction": "Dr. Ye 解释理论...",
      "must_include_quote_id": "quote_01" 
    }
  ]
}
4.2 最终脚本 (Final Script) - 审稿人产出这是给 TTS 读的最终稿。JSON// script_ch01.json
{
  "meta": {
    "duration_est": "600s",
    "bgm_mood": "healing"
  },
  "dialogue": [
    {
      "id": 1,
      "role": "Alice",
      "text": "叶医生，真的...",
      "mood": "sad",
      "break_after": 500 // 毫秒
    },
    {
      "id": 2,
      "role": "Dr. Ye",
      "text": "书里有句话是这么说的...",
      "mood": "warm",
      "is_quote": true
    }
  ]
}
这份规格书涵盖了所有的输入、输出和中间 Agent。你可以直接照着这个去写 Prompt 和 Function Call 了。
