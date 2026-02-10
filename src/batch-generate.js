/**
 * ============================================================================
 * 批量生成播客音频脚本
 * ============================================================================
 *
 * 功能概述：
 * 本脚本用于批量生成播客音频。
 * 当Phase 2完成后，可以使用此脚本重新生成音频（支持断点续传）。
 *
 * ============================================================================
 * 使用场景：
 * ============================================================================
 *
 * 1. 首次生成：
 *    运行 batch-generate.js 为所有章节生成音频
 *
 * 2. 断点续传：
 *    如果某章生成失败，修复后可重新运行
 *    已存在的文件会被跳过
 *
 * 3. 单独重试：
 *    修改 generateChapter() 函数可以单独生成指定章节
 *
 * ============================================================================
 * 与主流程的区别：
 * ============================================================================
 *
 * orchestrate.js:
 *   - 执行完整的三阶段流程
 *   - 包含AI内容生成
 *   - 适合首次运行
 *
 * batch-generate.js:
 *   - 仅执行 Phase 3
 *   - 不重新生成内容
 *   - 适合音频生成失败时重试
 *   - 支持跳过已完成的章节
 *
 * @module batch-generate
 * @author AI Podcast Generator
 * @version 1.0.0
 */

import { PodcastTTSClient } from './services/podcast-tts.js';
import fs from 'fs';

// ============================================================================
// 配置
// ============================================================================

/** @member {PodcastTTSClient} - TTS客户端实例 */
const client = new PodcastTTSClient();

/** @member {string} - 声音映射配置路径 */
const voiceMapPath = './src/config/voice_map.json';

/** @member {string} - 输出目录 */
const outputDir = './output/final';

/**
 * 生成单章播客
 *
 * @async
 * @param {number} chapterNum - 章节编号
 * @returns {Promise<Object>} 生成结果
 *
 * @example
 * ```javascript
 * const result = await generateChapter(1);
 * // { chapter: 1, success: true, size: 1234567 }
 * ```
 */
async function generateChapter(chapterNum) {
  // 构建路径
  const scriptPath = `./output/scripts/dialogue_${String(chapterNum).padStart(2, '0')}.json`;
  const outputPath = `${outputDir}/podcast_ch${String(chapterNum).padStart(2, '0')}.mp3`;

  // 检查是否已存在（断点续传）
  if (fs.existsSync(outputPath)) {
    console.log(`[Ch${chapterNum}] 已存在，跳过`);
    return { chapter: chapterNum, skipped: true };
  }

  // 日志
  console.log(`\n========== 开始生成第 ${chapterNum} 章 ==========`);

  try {
    // 调用TTS服务
    const result = await client.generatePodcast(scriptPath, voiceMapPath, outputPath);
    console.log(`[Ch${chapterNum}] 成功! 大小: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
    return { chapter: chapterNum, success: true, size: result.size };
  } catch (err) {
    console.error(`[Ch${chapterNum}] 失败: ${err.message}`);
    return { chapter: chapterNum, success: false, error: err.message };
  }
}

/**
 * 主函数 - 批量生成所有章节音频
 *
 * @async
 * @returns {Promise<void>}
 *
 * @example
 * ```javascript
 * await main();
 * // 完成后，output/final/ 目录包含所有MP3文件
 * ```
 */
async function main() {
  console.log('开始批量生成播客音频...');
  console.log('='.repeat(50));

  // 存储结果
  const results = [];

  // 生成所有16章
  for (let i = 1; i <= 16; i++) {
    const result = await generateChapter(i);
    results.push(result);

    // 每章之间等待3秒，避免请求过快导致限流
    if (i < 16) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // 输出统计
  console.log('\n' + '='.repeat(50));
  console.log('批量生成完成!');
  console.log('='.repeat(50));

  // 统计结果
  const successful = results.filter(r => r.success).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success && !r.skipped).length;

  console.log(`成功: ${successful}`);
  console.log(`跳过: ${skipped}`);
  console.log(`失败: ${failed}`);

  // 列出生成的文件
  console.log('\n生成的文件:');
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.mp3'));
  files.sort();
  files.forEach(f => {
    const size = fs.statSync(`${outputDir}/${f}`).size;
    console.log(`  ${f} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  });
}

// 运行
main().catch(console.error);
