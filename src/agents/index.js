/**
 * ============================================================================
 * AI Agent 执行器模块 (Agent Runner)
 * ============================================================================
 *
 * 功能概述：
 * 本模块封装了AI播客生成系统中的所有AI Agent调用逻辑。
 * 通过统一的接口，简化与大语言模型(LLM)的交互。
 *
 * ============================================================================
 * Agent 角色说明：
 * ============================================================================
 *
 * 本系统采用多Agent协作架构，每个Agent负责特定任务：
 *
 * Agent 1 - 评论分析师 (Tone Analyst)
 *   职责：分析读者评论，确定播客的整体基调
 *   输入：3条读者评论
 *   输出：metadata.json（定调元数据）
 *
 * Agent 2 - 章节内容矿工 (Chapter Miner)
 *   职责：从章节文本中提取逻辑原子和金句
 *   输入：metadata.json + 章节纯文本
 *   输出：chapter_xx.json（章节档案）
 *
 * Agent 3 - 编剧 (Screenwriter)
 *   职责：将知识转化为双人对话脚本
 *   输入：metadata.json + chapter_xx.json
 *   输出：对话初稿
 *
 * Agent 4 - 导演 (Director)
 *   职责：润色对话，增加口语化表达
 *   输入：编剧初稿
 *   输出：润色后脚本
 *
 * Agent 5 - 审核员 (Censor)
 *   职责：安全检查和质量把关
 *   输入：润色后脚本
 *   输出：审核结果
 *
 * ============================================================================
 * 工作流程：
 * ============================================================================
 *
 * Phase 1 (数据层):
 *   Agent 1 (一次) + Agent 2 (每章一次) -> 生成章节档案
 *
 * Phase 2 (编剧层):
 *   Agent 3 (每章一次) + Agent 4 (每章一次) + Agent 5 (每章一次)
 *
 * Phase 3 (演播层):
 *   不需要Agent，使用TTS服务生成音频
 *
 * @module agents
 * @author AI Podcast Generator
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';

import { llmClient } from '../services/llm-client.js';
import * as prompts from '../templates/system-prompts.js';

/**
 * Agent 执行器类
 *
 * 核心职责：
 * - 封装每个Agent的调用逻辑
 * - 处理输入输出的文件读写
 * - 调用LLM客户端执行AI任务
 *
 * 设计模式：
 * - 使用单例模式（module.exports导出实例）
 * - 依赖注入LLM客户端，便于测试和替换
 *
 * @class AgentRunner
 */
export class AgentRunner {
  /**
   * 创建AgentRunner实例
   *
   * @constructor
   * @param {Object} config - 配置对象（可选）
   */
  constructor() {
    /** @member {LLMClient} - LLM客户端实例，用于发送AI请求 */
    this.llm = llmClient;
  }

  // ========================================================================
  // Agent 1: 评论分析师 (Tone Analyst)
  // ========================================================================

  /**
   * 执行评论分析任务
   *
   * 此方法是系统入口点，负责分析读者评论并生成播客定调元数据。
   * 生成的metadata.json将作为后续所有Agent的"基调指导"。
   *
   * 处理流程：
   * 1. 读取用户提供的评论文件
   * 2. 拼接System Prompt和用户评论
   * 3. 调用LLM进行JSON格式输出
   * 4. 保存结果到指定路径
   *
   * @async
   * @param {string} reviewsPath - 评论文件路径（.txt格式）
   * @param {string} outputPath - 输出文件路径（.json格式）
   * @returns {Promise<Object>} 解析后的metadata JSON对象
   * @throws {Error} 当LLM调用失败或文件操作失败时抛出
   *
   * @example
   * ```javascript
   * const metadata = await agentRunner.runToneAnalyst(
   *   './reviews.txt',
   *   './output/metadata.json'
   * );
   * console.log(metadata.tone.style); // "治愈系"
   * ```
   */
  async runToneAnalyst(reviewsPath, outputPath) {
    // 日志：标记Agent 1开始执行
    console.log(`[Agent1] 评论分析师启动...`);

    // 读取评论文件内容
    // 假设文件格式为纯文本，每条评论一行或用分隔符分开
    const reviews = fs.readFileSync(reviewsPath, 'utf8');

    // 获取评论分析师的系统提示模板
    const systemPrompt = prompts.toneAnalystPrompt;

    // 调用LLM，发送Prompt + 评论内容
    // chatJSON方法会自动解析JSON响应
    const result = await this.llm.chatJSON(systemPrompt, reviews);

    // ========================================================================
    // 文件保存逻辑
    // ========================================================================

    // 检查输出目录是否存在
    // path.dirname获取文件路径的目录部分
    // 如果目录不存在，使用recursive: true选项递归创建
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 将结果保存为JSON文件
    // 使用2空格缩进，使文件易于阅读
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

    // 日志：标记完成并显示输出路径
    console.log(`[Agent1] 定调元数据已生成: ${outputPath}`);

    // 返回结果供后续使用
    return result;
  }

  // ========================================================================
  // Agent 2: 章节内容矿工 (Chapter Miner)
  // ========================================================================

  /**
   * 执行章节内容挖掘任务
   *
   * 此方法从章节文本中提取"逻辑原子"和"金句"。
   * 逻辑原子是以"现象-机制-解法"形式组织的信息单元。
   *
   * 处理流程：
   * 1. 读取定调元数据metadata.json
   * 2. 将metadata与Prompt拼接
   * 3. 发送章节纯文本给LLM
   * 4. 解析并保存结果
   *
   * @async
   * @param {string} metadataPath - metadata.json文件路径
   * @param {string} chapterText - 章节纯文本内容
   * @param {string} chapterId - 章节ID（如 "01", "02"）
   * @param {string} outputPath - 输出文件路径
   * @returns {Promise<Object>} 解析后的章节档案JSON
   *
   * @example
   * ```javascript
   * const chapterData = await agentRunner.runChapterMiner(
   *   './output/metadata.json',
   *   '第三章的文本内容...',
   *   '03',
   *   './output/chapter_03.json'
   * );
   * ```
   */
  async runChapterMiner(metadataPath, chapterText, chapterId, outputPath) {
    // 日志：显示正在处理的章节ID
    console.log(`[Agent2] 章节内容矿工处理第 ${chapterId} 章...`);

    // 读取定调元数据
    // metadata决定了播客的基调，会影响内容提炼的方向
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    // 构建系统提示：将Prompt模板与metadata JSON拼接
    // 这样LLM就能理解当前播客的定位和风格
    const systemPrompt = prompts.chapterMinerPrompt + JSON.stringify(metadata, null, 2);

    // 调用LLM进行内容提炼
    const result = await this.llm.chatJSON(systemPrompt, chapterText);

    // ========================================================================
    // 保存章节档案
    // ========================================================================

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 保存结果
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

    // 日志：显示完成信息
    console.log(`[Agent2] 章节档案已生成: ${outputPath}`);

    return result;
  }

  // ========================================================================
  // Agent 3: 编剧 (Screenwriter)
  // ========================================================================

  /**
   * 执行编剧任务
   *
   * 此方法将章节档案转化为双人对话脚本。
   * 生成的脚本包含角色、台词、情绪标注等信息。
   *
   * 处理流程：
   * 1. 读取定调元数据
   * 2. 读取章节档案（逻辑原子+金句）
   * 3. 拼接Prompt（定调+章节档案）
   * 4. 调用LLM生成对话脚本
   * 5. 保存结果
   *
   * @async
   * @param {string} metadataPath - 定调元数据路径
   * @param {string} chapter档案Path - 章节档案路径
   * @param {string} outputPath - 输出脚本路径
   * @returns {Promise<Object>} 解析后的脚本JSON
   *
   * @example
   * ```javascript
   * const script = await agentRunner.runScreenwriter(
   *   './output/metadata.json',
   *   './output/chapter_03.json',
   *   './scripts/script_03.json'
   * );
   * ```
   */
  async runScreenwriter(metadataPath, chapter档案Path, outputPath) {
    // 日志：标记编剧任务开始
    console.log(`[Agent3] 编剧生成对话脚本...`);

    // 读取定调元数据
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    // 读取章节档案
    const chapter档案 = JSON.parse(fs.readFileSync(chapter档案Path, 'utf8'));

    // 构建系统提示：将编剧Prompt模板与定调拼接
    const systemPrompt = prompts.screenwriterPrompt + JSON.stringify(metadata, null, 2);

    // 构建用户内容：包含章节档案
    // 使用##章节档案作为分隔标记，使LLM能区分定调和章节内容
    const userContent = `## 章节档案
${JSON.stringify(chapter档案, null, 2)}

请根据以上内容创作对话脚本。`;

    // 调用LLM生成对话脚本
    const result = await this.llm.chatJSON(systemPrompt, userContent);

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 保存脚本
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

    // 日志：标记完成
    console.log(`[Agent3] 对话脚本已生成: ${outputPath}`);

    return result;
  }

  // ========================================================================
  // Agent 4: 导演 (Director)
  // ========================================================================

  /**
   * 执行导演润色任务
   *
   * 此方法将书面化的对话脚本转化为更自然的口语表达。
   * 重点是增加填充词、情绪表达和对话节奏。
   *
   * 与其他Agent的区别：
   * - 不需要metadata作为输入
   * - 输出不是JSON格式，而是纯文本
   *
   * @async
   * @param {string} scriptPath - 编剧脚本路径
   * @param {string} outputPath - 润色后脚本输出路径
   * @returns {Promise<string>} 润色后的脚本内容（纯文本）
   *
   * @example
   * ```javascript
   * const polished = await agentRunner.runDirector(
   *   './scripts/script_03.json',
   *   './scripts/polished_03.txt'
   * );
   * ```
   */
  async runDirector(scriptPath, outputPath) {
    // 日志：标记导演任务开始
    console.log(`[Agent4] 导演润色脚本...`);

    // 读取编剧脚本
    const script = fs.readFileSync(scriptPath, 'utf8');

    // 获取导演Prompt模板
    const systemPrompt = prompts.directorPrompt;

    // 调用LLM进行润色
    // 注意：json: false 表示不需要JSON输出，直接返回文本
    const result = await this.llm.chat(systemPrompt, script, { json: false });

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 保存润色后的脚本（纯文本格式）
    fs.writeFileSync(outputPath, result, 'utf8');

    // 日志：标记完成
    console.log(`[Agent4] 润色脚本已生成: ${outputPath}`);

    return result;
  }

  // ========================================================================
  // Agent 5: 审核员 (Censor)
  // ========================================================================

  /**
   * 执行内容审核任务
   *
   * 此方法对润色后的脚本进行安全和质量问题检查。
   * 检查内容包括：
   * - 安全红线：自杀自残、医疗建议、政治敏感等
   * - 质量问题：长难句、逻辑不通、重复等
   *
   * 输出字段说明：
   * - passed: boolean，审核是否通过
   * - safety_issues: 安全问题数组
   * - quality_issues: 质量问题数组
   * - suggestions: 改进建议数组
   * - cleaned_script: 修正后的脚本（如果有）
   *
   * @async
   * @param {string} scriptPath - 待审核脚本路径
   * @param {string} outputPath - 审核结果输出路径
   * @returns {Promise<Object>} 审核结果JSON
   *
   * @example
   * ```javascript
   * const result = await agentRunner.runCensor(
   *   './scripts/polished_03.txt',
   *   './scripts/censor_03.json'
   * );
   * if (result.passed) {
   *   console.log('审核通过！');
   * }
   * ```
   */
  async runCensor(scriptPath, outputPath) {
    // 日志：标记审核任务开始
    console.log(`[Agent5] 审核员检查内容...`);

    // 读取待审核的脚本
    const script = fs.readFileSync(scriptPath, 'utf8');

    // 获取审核Prompt模板
    const systemPrompt = prompts.censorPrompt;

    // 调用LLM进行审核
    const result = await this.llm.chatJSON(systemPrompt, script);

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 保存审核结果
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

    // ========================================================================
    // 审核结果处理
    // ========================================================================

    // 如果审核通过，输出确认信息
    if (result.passed) {
      console.log(`[Agent5] 内容审核通过`);
    } else {
      // 如果未通过，输出发现的问题
      // 使用console.warn输出警告级别日志
      console.warn(`[Agent5] 发现问题: ${result.quality_issues?.join(', ')}`);
    }

    // 返回结果供后续处理
    return result;
  }

  // ========================================================================
  // 批量处理功能
  // ========================================================================

  /**
   * 批量处理所有章节
   *
   * 此方法自动化处理多个章节的矿工任务。
   * 读取temp/raw_chapters目录下的所有原始章节文件，
   * 为每个章节生成对应的章节档案。
   *
   * 文件命名约定：
   * - 输入：raw_ch01.txt, raw_ch02.txt, ...
   * - 输出：chapter_01.json, chapter_02.json, ...
   *
   * 处理顺序：
   * - 按文件名排序，确保章节顺序正确
   * - 顺序处理（非并行），避免API限流
   *
   * @async
   * @param {string} metadataPath - 定调元数据路径
   * @param {string} chaptersDir - 原始章节文件目录
   * @param {string} outputDir - 输出目录
   * @returns {Promise<Array>} 处理结果数组
   *
   * @example
   * ```javascript
   * const results = await agentRunner.batchProcessChapters(
   *   './output/metadata.json',
   *   './temp/raw_chapters',
   *   './temp/processed'
   * );
   * console.log(`成功处理 ${results.length} 章`);
   * ```
   */
  async batchProcessChapters(metadataPath, chaptersDir, outputDir) {
    // 读取原始章节目录下的所有文件
    // 过滤条件：文件名以"raw_ch"开头，以".txt"结尾
    const files = fs.readdirSync(chaptersDir)
      .filter(f => f.startsWith('raw_ch') && f.endsWith('.txt'))
      .sort(); // 排序确保章节顺序

    // 初始化结果数组
    const results = [];

    // 遍历所有章节文件
    for (const file of files) {
      // 从文件名提取章节ID
      // 正表达式：raw_ch(\d+).txt 捕获数字部分
      const chapterId = file.match(/raw_ch(\d+)\.txt/)[1];

      // 构建完整的输入输出路径
      const inputPath = path.join(chaptersDir, file);
      const outputPath = path.join(outputDir, `chapter_${chapterId}.json`);

      // 执行章节矿工任务
      const result = await this.runChapterMiner(
        metadataPath,
        inputPath,
        chapterId,
        outputPath
      );

      // 将结果添加到数组
      results.push({ chapterId, result });
    }

    // 返回所有处理结果
    return results;
  }
}

/**
 * AgentRunner 单例实例
 *
 * 使用模块导出单例，简化外部调用。
 * 外部文件可以直接导入使用：
 *
 *   import { agentRunner } from './agents/index.js';
 *   await agentRunner.runToneAnalyst(...);
 *
 * @type {AgentRunner}
 */
export const agentRunner = new AgentRunner();
