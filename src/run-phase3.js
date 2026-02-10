/**
 * ============================================================================
 * Phase 3 运行脚本
 * ============================================================================
 *
 * 功能概述：
 * 本脚本用于独立运行 Phase 3（演播层 - 协议化）。
 *
 * ============================================================================
 * 使用方法：
 * ============================================================================
 *
 * 在 package.json 中已配置脚本命令：
 *
 *   npm run phase3
 *
 * 等效于直接运行：
 *
 *   node src/run-phase3.js
 *
 * ============================================================================
 * 执行内容：
 * ============================================================================
 *
 * 1. 读取 Phase 2 生成的 final_script.json
 * 2. 解析对话文本为结构化格式
 * 3. 调用豆包 TTS WebSocket 服务
 * 4. 生成每章的播客音频文件
 *
 * ============================================================================
 * 前置条件：
 * ============================================================================
 *
 * 1. Phase 2 已成功运行
 * 2. 已生成 final_script.json
 * 3. 已配置 VOLCENGINE_APP_ID 和 VOLCENGINE_ACCESS_TOKEN
 *
 * ============================================================================
 * 依赖文件：
 * ============================================================================
 *
 * - output/final/final_script.json # 必须存在
 * - src/config/voice_map.json    # 必须存在
 *
 * ============================================================================
 * 输出文件：
 * ============================================================================
 *
 * - output/scripts/dialogue_*.json  # 解析后的对话格式
 * - output/final/podcast_*.mp3     # 最终音频文件
 *
 * @module run-phase3
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// Phase 3 配置
const CONFIG = {
  outputFinalDir: './output/final'
};

/**
 * 主函数
 */
async function run() {
  // 检查前置条件
  const scriptPath = path.join(CONFIG.outputFinalDir, 'final_script.json');

  if (!fs.existsSync(scriptPath)) {
    console.error('[错误] 请先运行 Phase 2 生成 final_script.json');
    process.exit(1);
  }

  // 动态导入并运行 Phase 3
  const { runPhase3 } = await import('./orchestrate.js');
  await runPhase3(scriptPath);
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
