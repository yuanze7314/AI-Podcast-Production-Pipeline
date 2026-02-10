/**
 * ============================================================================
 * Phase 2 运行脚本
 * ============================================================================
 *
 * 功能概述：
 * 本脚本用于独立运行 Phase 2（编剧层 - 剧本化）。
 *
 * ============================================================================
 * 使用方法：
 * ============================================================================
 *
 * 在 package.json 中已配置脚本命令：
 *
 *   npm run phase2
 *
 * 等效于直接运行：
 *
 *   node src/run-phase2.js
 *
 * ============================================================================
 * 执行内容：
 * ============================================================================
 *
 * 1. 读取 Phase 1 生成的 metadata.json 和章节档案
 * 2. 为每章生成对话脚本（编剧）
 * 3. 润色脚本（导演）
 * 4. 审核脚本（审核员）
 * 5. 合并所有章节为最终脚本
 *
 * ============================================================================
 * 前置条件：
 * ============================================================================
 *
 * 1. Phase 1 已成功运行
 * 2. 已生成 metadata.json
 * 3. 已生成 chapter_*.json 文件
 *
 * ============================================================================
 * 依赖文件：
 * ============================================================================
 *
 * - output/config/metadata.json   # 必须存在
 * - temp/processed/chapter_*.json # 必须存在
 *
 * ============================================================================
 * 输出文件：
 * ============================================================================
 *
 * - output/scripts/script_*.json   # 编剧初稿
 * - output/scripts/polished_*.txt   # 导演润色
 * - output/scripts/final_*.txt     # 最终脚本
 * - output/final/final_script.json # 合并后的完整脚本
 *
 * @module run-phase2
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// Phase 2 配置
const CONFIG = {
  outputConfigDir: './output/config'
};

/**
 * 主函数
 */
async function run() {
  // 检查前置条件
  const metadataPath = path.join(CONFIG.outputConfigDir, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    console.error('[错误] 请先运行 Phase 1 生成 metadata.json');
    process.exit(1);
  }

  // 动态导入并运行 Phase 2
  const { runPhase2 } = await import('./orchestrate.js');
  await runPhase2(metadataPath);
}

// 运行
run()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
