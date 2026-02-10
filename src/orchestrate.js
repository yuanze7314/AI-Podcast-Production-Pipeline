/**
 * ============================================================================
 * AI Podcast Generator - 主流程编排器
 * ============================================================================
 *
 * 功能概述：
 * 本模块是AI播客生成系统的核心编排器。
 * 负责协调三个处理阶段，实现从书籍到播客音频的完整转换流程。
 *
 * ============================================================================
 * 三阶段流水线架构：
 * ============================================================================
 *
 * Phase 1: 数据层 - 原子化
 *   输入: PDF书籍 + 读者评论 + 目录
 *   处理:
 *     - Agent 1: 评论分析师 -> metadata.json (播客定调)
 *     - Agent 2: 章节内容矿工 -> chapter_xx.json (逻辑原子+金句)
 *   输出: 定调元数据 + 章节档案
 *
 * Phase 2: 编剧层 - 剧本化
 *   输入: metadata.json + chapter_xx.json
 *   处理:
 *     - Agent 3: 编剧 -> 对话初稿
 *     - Agent 4: 导演 -> 口语润色
 *     - Agent 5: 审核 -> 安全质检
 *   输出: final_script.json (最终对话脚本)
 *
 * Phase 3: 演播层 - 协议化
 *   输入: final_script.json + voice_map.json
 *   处理:
 *     - 载荷组装: 将脚本转换为API格式
 *     - API调度: 调用豆包TTS WebSocket服务
 *   输出: podcast_xx.mp3 (最终音频)
 *
 * ============================================================================
 * 数据流转图：
 * ============================================================================
 *
 * [书籍PDF] ----+
 * [目录TXT] ----+----> [Phase 1] ---> [metadata.json]
 * [评论TXT] ----+                     |
 *                                   +---> [chapter_01.json] ----+
 *                                   |   [chapter_02.json]      |
 *                                   |   ...                    |
 *                                   +------------------------->|
 *                                                              |
 *                                   +------------------------->|
 *                                   |                          |
 *                                   |   [Phase 2] ---------> [final_script.json]
 *                                   |                          |
 *                                   +------------------------->|
 *                                                              |
 *                                   +------------------------->|
 *                                   |                          |
 *                                   |   [Phase 3] ---------> [podcast.mp3]
 *                                   |                          |
 *                                   +------------------------->|
 *
 * ============================================================================
 * 目录结构约定：
 * ============================================================================
 *
 * temp/
 * ├── raw_chapters/        # 原始章节文本
 * │   ├── raw_ch01.txt
 * │   └── raw_ch02.txt
 * ├── processed/           # 处理后的章节档案
 * │   ├── chapter_01.json
 * │   └── chapter_02.json
 * └── cleaned_book.txt     # 清洗后的完整文本
 *
 * output/
 * ├── config/              # 配置和元数据
 * │   └── metadata.json
 * ├── scripts/             # 对话脚本
 * │   ├── script_01.json
 * │   ├── polished_01.txt
 * │   └── final_01.txt
 * └── final/               # 最终输出
 *     └── podcast_01.mp3
 *
 * @module orchestrate
 * @author AI Podcast Generator
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// 导入依赖模块
import { parseBook, parseTOC } from './utils/pdf-parser.js';
import { agentRunner } from './agents/index.js';
import { podcastTTSClient } from './services/podcast-tts.js';

// ============================================================================
// 配置定义
// ============================================================================

/**
 * 系统配置
 *
 * 包含所有路径和目录配置。
 * 支持通过环境变量覆盖默认值。
 *
 * @constant {Object} CONFIG
 */
const CONFIG = {
  // ----------------------
  // 输入文件路径
  // ----------------------

  /** @member {string} - 书籍PDF文件路径 */
  bookPath: process.env.BOOK_PATH ||
    './测试书籍/蛤蟆先生去看心理医生 (（英）罗伯特•戴博德) (z-library.sk, 1lib.sk, z-lib.sk).pdf',

  /** @member {string} - 读者评论文件路径 */
  reviewsPath: process.env.REVIEWS_PATH || './测试书籍/相关评论三条.txt',

  /** @member {string} - 目录文件路径 */
  tocPath: process.env.TOC_PATH || './测试书籍/蛤蟆先生去看心理医生目录.txt',

  /** @member {string} - 声音映射配置路径 */
  voiceMapPath: process.env.VOICE_MAP_PATH || './src/config/voice_map.json',

  // ----------------------
  // 输出目录路径
  // ----------------------

  /** @member {string} - 临时文件目录 */
  tempDir: './temp',

  /** @member {string} - 原始章节目录 */
  rawChaptersDir: './temp/raw_chapters',

  /** @member {string} - 处理后章节目录 */
  processedDir: './temp/processed',

  /** @member {string} - 配置输出目录 */
  outputConfigDir: './output/config',

  /** @member {string} - 脚本输出目录 */
  outputScriptsDir: './output/scripts',

  /** @member {string} - 最终输出目录 */
  outputFinalDir: './output/final'
};

// ============================================================================
// Phase 1: 数据层 - 原子化
// ============================================================================

/**
 * Phase 1: 数据层 - 原子化
 *
 * 此阶段的核心任务是将书籍内容转换为结构化的"知识原子"。
 *
 * 执行步骤：
 * 1. 分析读者评论，生成播客定调元数据 (metadata.json)
 * 2. 解析PDF并按章节切分文本
 * 3. 对每个章节提取逻辑原子和金句 (chapter_xx.json)
 *
 * @async
 * @returns {Promise<Object>} Phase 1执行结果
 * @returns {string} returns.metadataPath - metadata.json文件路径
 * @returns {Array} returns.chapterResults - 章节处理结果
 *
 * @example
 * ```javascript
 * const { metadataPath, chapterResults } = await runPhase1();
 * ```
 */
async function runPhase1() {
  // 日志：标记Phase开始
  console.log('\n========== Phase 1: 数据层 - 原子化 ==========\n');

  // 记录开始时间
  const startTime = Date.now();

  // ========================================================================
  // Step 1A: 评论分析 -> metadata.json
  // ========================================================================
  console.log('[Phase1] Step 1A: 分析读者评论...');

  // 定义输出路径
  const metadataPath = path.join(CONFIG.outputConfigDir, 'metadata.json');

  // 执行评论分析师任务
  await agentRunner.runToneAnalyst(CONFIG.reviewsPath, metadataPath);

  // ========================================================================
  // Step 1B: 解析PDF并切分章节
  // ========================================================================
  console.log('[Phase1] Step 1B: 解析PDF并切分章节...');

  // 解析书籍PDF和目录
  const { parser, toc } = await parseBook(CONFIG.bookPath, CONFIG.tocPath);

  // 导出完整清洗文本（用于调试）
  const cleanedTextPath = path.join(CONFIG.tempDir, 'cleaned_book.txt');
  parser.exportCleanedText(cleanedTextPath);

  // 将文本按章节分割
  const chapters = splitIntoChunks(parser.cleanedText, toc);

  // ========================================================================
  // 保存每章原始文本
  // ========================================================================
  for (const chapter of chapters) {
    // 构建章节文件路径
    const chapterPath = path.join(CONFIG.rawChaptersDir, `raw_ch${chapter.id}.txt`);

    // 写入文件
    fs.writeFileSync(chapterPath, chapter.text, 'utf8');

    // 日志：显示章节信息
    console.log(`  - 章节 ${chapter.id}: ${chapter.title} (${chapter.text.length} 字)`);
  }

  // ========================================================================
  // Step 2: 章节内容矿工 -> chapter_xx.json
  // ========================================================================
  console.log('[Phase1] Step 2: 提取逻辑原子和金句...');

  // 批量处理所有章节
  const chapterResults = await agentRunner.batchProcessChapters(
    metadataPath,
    CONFIG.rawChaptersDir,
    CONFIG.processedDir
  );

  // 计算耗时
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n[Phase1] 完成！耗时 ${duration.toFixed(1)} 秒`);

  // 返回结果供Phase 2使用
  return { metadataPath, chapterResults };
}

/**
 * 章节分割函数
 *
 * 将书籍文本按章节进行粗略分割。
 *
 * 注意：这是一个简化实现。
 * 实际项目中，PDF页码与字符位置之间没有直接对应关系，
 * 需要更复杂的算法（如基于标题匹配的智能分割）来实现精确分割。
 *
 * 算法说明：
 * - 首先计算平均每章的字符数
 * - 然后按字符范围划分各章节
 * - 假设每章内容长度大致相等
 *
 * @param {string} text - 完整清洗后的文本
 * @param {Array} toc - 目录数组
 * @returns {Array} 章节数组
 *
 * @example
 * ```javascript
 * const chapters = splitIntoChunks(fullText, toc);
 * // 返回: [{id: '01', title: '第一章', page: 1, text: '...'}, ...]
 * ```
 */
function splitIntoChunks(text, toc) {
  const chapters = [];
  let currentPos = 0;

  // 计算平均每章字符数
  const avgCharsPerChapter = Math.floor(text.length / toc.length);

  // 遍历目录
  for (let i = 0; i < toc.length; i++) {
    const chapter = toc[i];
    const nextChapter = toc[i + 1];

    // 简单分割：平均分配
    const startPos = i * avgCharsPerChapter;
    const endPos = (i + 1) * avgCharsPerChapter;

    // 构建章节对象
    chapters.push({
      /** @property {string} id - 章节ID，两位数格式 */
      id: String(i + 1).padStart(2, '0'),

      /** @property {string} title - 章节标题 */
      title: chapter.title,

      /** @property {number} page - 章节页码 */
      page: chapter.page || (i + 1),

      /** @property {string} text - 章节文本内容 */
      text: text.slice(startPos, endPos).trim()
    });
  }

  return chapters;
}

// ============================================================================
// Phase 2: 编剧层 - 剧本化
// ============================================================================

/**
 * Phase 2: 编剧层 - 剧本化
 *
 * 此阶段的核心任务是将知识原子转换为生动的对话脚本。
 *
 * 执行步骤：
 * 1. 读取所有章节档案
 * 2. 对每个章节依次执行：
 *   - Agent 3: 编剧生成对话初稿
 *   - Agent 4: 导演润色口语化
 *   - Agent 5: 审核安全质检
 * 3. 合并所有章节为最终脚本
 *
 * @async
 * @param {string} metadataPath - metadata.json文件路径
 * @returns {Promise<string>} final_script.json文件路径
 *
 * @example
 * ```javascript
 * const scriptPath = await runPhase2('./output/config/metadata.json');
 * ```
 */
async function runPhase2(metadataPath) {
  // 日志：标记Phase开始
  console.log('\n========== Phase 2: 编剧层 - 剧本化 ==========\n');

  // 记录开始时间
  const startTime = Date.now();

  // ========================================================================
  // 读取所有章节档案
  // ========================================================================
  // 过滤出 chapter_XX.json 文件
  const chapterFiles = fs.readdirSync(CONFIG.processedDir)
    .filter(f => f.startsWith('chapter_') && f.endsWith('.json'))
    .sort();  // 排序确保顺序

  // 存储所有对话
  const allDialogues = [];

  // 遍历处理每个章节
  for (const file of chapterFiles) {
    // 从文件名提取章节编号
    const chapterNum = file.match(/chapter_(\d+)\.json/)[1];
    console.log(`[Phase2] 处理第 ${chapterNum} 章...`);

    // 构建各阶段文件路径
    const chapterPath = path.join(CONFIG.processedDir, file);                    // 章节档案
    const chapter档案Path = path.join(CONFIG.rawChaptersDir, `raw_ch${chapterNum}.txt`); // 原始文本
    const scriptPath = path.join(CONFIG.outputScriptsDir, `script_${chapterNum}.json`); // 编剧输出
    const polishedPath = path.join(CONFIG.outputScriptsDir, `polished_${chapterNum}.txt`); // 导演润色
    const finalPath = path.join(CONFIG.outputScriptsDir, `final_${chapterNum}.txt`); // 最终脚本

    // ========================================================================
    // Agent 3: 编剧生成对话
    // ========================================================================
    console.log(`  - 编剧生成...`);
    await agentRunner.runScreenwriter(metadataPath, chapterPath, scriptPath);

    // ========================================================================
    // Agent 4: 导演润色
    // ========================================================================
    console.log(`  - 导演润色...`);
    await agentRunner.runDirector(scriptPath, polishedPath);

    // ========================================================================
    // Agent 5: 审核质检
    // ========================================================================
    console.log(`  - 审核质检...`);
    const checkResult = await agentRunner.runCensor(polishedPath, finalPath);

    // ========================================================================
    // 收集最终脚本
    // ========================================================================
    const finalScript = fs.readFileSync(finalPath, 'utf8');
    allDialogues.push({
      chapter: chapterNum,
      script: finalScript,
      passed: checkResult.passed
    });
  }

  // ========================================================================
  // 合并所有章节为最终脚本
  // ========================================================================
  const mergedScript = {
    title: 'AI播客',
    chapters: allDialogues,
    generatedAt: new Date().toISOString()
  };

  // 保存合并后的脚本
  const finalScriptPath = path.join(CONFIG.outputFinalDir, 'final_script.json');
  fs.writeFileSync(finalScriptPath, JSON.stringify(mergedScript, null, 2), 'utf8');

  // 计算耗时
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n[Phase2] 完成！耗时 ${duration.toFixed(1)} 秒`);

  return finalScriptPath;
}

// ============================================================================
// Phase 3: 演播层 - 协议化
// ============================================================================

/**
 * Phase 3: 演播层 - 协议化
 *
 * 此阶段的核心任务是将对话脚本转换为最终音频文件。
 *
 * 执行步骤：
 * 1. 读取最终脚本
 * 2. 对每章：
 *   - 解析文本为对话格式
 *   - 调用TTS服务生成音频
 *   - 保存MP3文件
 *
 * @async
 * @param {string} scriptPath - final_script.json文件路径
 * @returns {Promise<void>}
 *
 * @example
 * ```javascript
 * await runPhase3('./output/final/final_script.json');
 * ```
 */
async function runPhase3(scriptPath) {
  // 日志：标记Phase开始
  console.log('\n========== Phase 3: 演播层 - 协议化 ==========\n');

  // 记录开始时间
  const startTime = Date.now();

  // 读取最终脚本
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));

  // ========================================================================
  // 为每章生成音频
  // ========================================================================
  for (const chapter of script.chapters) {
    console.log(`[Phase3] 生成第 ${chapter.chapter} 章音频...`);

    // 解析润色后的脚本为 dialogue 格式
    const dialogue = parseScriptToDialogue(chapter.script);

    // 保存解析后的对话JSON
    const chapterScriptPath = path.join(CONFIG.outputScriptsDir, `dialogue_${chapter.chapter}.json`);
    fs.writeFileSync(chapterScriptPath, JSON.stringify({ dialogue }, null, 2), 'utf8');

    // 输出文件路径
    const audioPath = path.join(CONFIG.outputFinalDir, `podcast_ch${chapter.chapter}.mp3`);

    try {
      // 调用TTS服务生成播客
      await podcastTTSClient.generatePodcast(
        chapterScriptPath,
        CONFIG.voiceMapPath,
        audioPath
      );
    } catch (err) {
      console.error(`  [错误] 第 ${chapter.chapter} 章生成失败: ${err.message}`);
    }
  }

  // 计算耗时
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n[Phase3] 完成！耗时 ${duration.toFixed(1)} 秒`);
}

/**
 * 脚本解析函数
 *
 * 将文本格式的对话脚本解析为结构化格式。
 *
 * 支持的输入格式：
 * 1. 直接文本格式：
 *    Alice: 你好！
 *    Dr.Ye: 你好，有什么可以帮你的？
 *
 * 2. JSON格式：
 *    {"cleaned_script": "Alice: 你好！\nDr.Ye: ..."}
 *
 * 输出格式：
 * [
 *   { speaker: 'Alice', text: '你好！' },
 *   { speaker: 'Dr_Ye', text: '你好，有什么可以帮你的？' }
 * ]
 *
 * @param {string} scriptContent - 原始脚本内容
 * @returns {Array} 对话数组
 *
 * @example
 * ```javascript
 * const dialogue = parseScriptToDialogue('Alice: 你好！\nDr.Ye: 你好！');
 * // [{speaker: 'Alice', text: '你好！'}, {speaker: 'Dr_Ye', text: '你好！'}]
 * ```
 */
function parseScriptToDialogue(scriptContent) {
  let scriptText = scriptContent;

  // ========================================================================
  // 格式检测与转换
  // ========================================================================

  // 检测是否为JSON格式
  if (typeof scriptContent === 'string' && scriptContent.includes('"cleaned_script"')) {
    try {
      // 尝试解析JSON
      const parsed = JSON.parse(scriptContent);
      scriptText = parsed.cleaned_script || scriptContent;
    } catch (e) {
      // 解析失败，使用原始文本
      scriptText = scriptContent;
    }
  }

  // ========================================================================
  // 解析对话行
  // ========================================================================

  // 按行分割并过滤空行
  const lines = scriptText.split('\n').filter(l => l.trim());
  const dialogue = [];

  // 遍历每行
  for (const line of lines) {
    // 匹配角色名和内容
    // 支持的格式：Alice:, Dr.Ye:, Dr_Ye:, 大衣先生:, 咪仔同学:
    const match = line.match(/^(Alice|大衣先生|咪仔同学|Dr\.Ye|Dr_Ye)[:：]\s*(.+)/);

    if (match) {
      // 提取角色名和文本
      let speaker = match[1];

      // 统一角色名映射
      // Alice / 咪仔同学 -> Alice
      // Dr.Ye / Dr_Ye / 大衣先生 -> Dr_Ye
      if (speaker === 'Alice' || speaker === '咪仔同学') {
        speaker = 'Alice';
      } else if (speaker === 'Dr.Ye' || speaker === 'Dr_Ye' || speaker === '大衣先生') {
        speaker = 'Dr_Ye';
      }

      // 添加到对话数组
      dialogue.push({
        speaker: speaker,
        text: match[2].trim()
      });
    }
  }

  // 日志：显示解析结果
  console.log(`  [解析] 提取到 ${dialogue.length} 轮对话`);

  return dialogue;
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 主入口函数
 *
 * 执行完整的三阶段流程：
 * 1. 确保输出目录存在
 * 2. 运行 Phase 1 (数据层)
 * 3. 运行 Phase 2 (编剧层)
 * 4. 运行 Phase 3 (演播层)
 *
 * @async
 * @returns {Promise<void>}
 *
 * @example
 * ```javascript
 * await main();
 * // 完成后，./output/final/ 目录包含播客音频
 * ```
 */
async function main() {
  console.log('AI Podcast Generator - 开始运行');
  console.log('='.repeat(50));

  // ========================================================================
  // 确保输出目录存在
  // ========================================================================
  const dirs = [
    CONFIG.tempDir,
    CONFIG.rawChaptersDir,
    CONFIG.processedDir,
    CONFIG.outputConfigDir,
    CONFIG.outputScriptsDir,
    CONFIG.outputFinalDir
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // ========================================================================
  // 运行三阶段流程
  // ========================================================================

  // Phase 1: 数据层
  const phase1Result = await runPhase1();

  // Phase 2: 编剧层
  const phase2Result = await runPhase2(phase1Result.metadataPath);

  // Phase 3: 演播层
  await runPhase3(phase2Result);

  // 完成日志
  console.log('\n' + '='.repeat(50));
  console.log('AI Podcast Generator - 运行完成');
  console.log('输出文件位置: ./output/final/');
}

// ============================================================================
// 命令行接口
// ============================================================================

/**
 * 支持分阶段运行
 *
 * 用法：
 * - node src/orchestrate.js        # 运行全部阶段
 * - node src/orchestrate.js 1      # 仅运行 Phase 1
 * - node src/orchestrate.js 2      # 仅运行 Phase 2
 * - node src/orchestrate.js 3      # 仅运行 Phase 3
 */

// 获取命令行参数
const runPhase = process.argv[2];

// 导出函数供外部使用
export { runPhase1, runPhase2, runPhase3 };

// 根据参数决定运行模式
if (runPhase === '1') {
  // 仅运行 Phase 1
  runPhase1().catch(console.error);
} else if (runPhase === '2') {
  // 仅运行 Phase 2
  const metadataPath = process.env.BOOK_PATH ? undefined : './output/config/metadata.json';
  runPhase2(metadataPath).catch(console.error);
} else if (runPhase === '3') {
  // 仅运行 Phase 3
  runPhase3('./output/final/final_script.json').catch(console.error);
} else {
  // 运行全部阶段
  main().catch(console.error);
}
