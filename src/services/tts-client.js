/**
 * ============================================================================
 * 标准 TTS 客户端模块 (Text-to-Speech Client)
 * ============================================================================
 *
 * 功能概述：
 * 本模块封装了豆包/火山引擎的标准语音合成API调用逻辑。
 * 用于将文本转换为高质量的语音音频。
 *
 * ============================================================================
 * 重要说明：
 * ============================================================================
 *
 * 本模块使用的是豆包的标准TTS API（非播客版）。
 * 对于播客生成场景，推荐使用podcast-tts.js模块。
 *
 * 标准TTS特点：
 * - 单角色语音合成
 * - 支持多种声音选择
 * - 适合短文本合成
 *
 * 播客TTS特点：
 * - 支持多角色对话
 * - 自然对话节奏
 * - WebSocket长连接
 *
 * ============================================================================
 * API配置说明：
 * ============================================================================
 *
 * 需要的配置（通过环境变量）：
 * - VOLCANO_TTS_APP_ID / VOLCENGINE_APP_ID: 应用ID
 * - VOLCANO_TTS_ACCESS_TOKEN / VOLCENGINE_ACCESS_TOKEN: 访问令牌
 *
 * API端点：
 * - 主机: openspeech.bytedance.com
 * - 路径: /api/v1/tts
 *
 * @module tts-client
 * @author AI Podcast Generator
 * @version 1.0.0
 */

import https from 'https';
import { pipeline } from 'stream';
import { promisify } from 'util';
import fs from 'fs';

// 将pipeline转换为Promise风格
const pipe = promisify(pipeline);

/**
 * TTS客户端类
 *
 * 职责：
 * - 管理TTS API连接
 * - 发送语音合成请求
 * - 处理音频响应
 *
 * @class TTSClient
 */
export class TTSClient {
  /**
   * 创建TTS客户端实例
   *
   * @constructor
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    /** @member {string} - 应用ID，兼容两个环境变量名 */
    this.appId = config.appId || process.env.VOLCANO_TTS_APP_ID || process.env.VOLCENGINE_APP_ID;

    /** @member {string} - 访问令牌，兼容两个环境变量名 */
    this.accessToken = config.accessToken || process.env.VOLCANO_TTS_ACCESS_TOKEN || process.env.VOLCENGINE_ACCESS_TOKEN;

    /** @member {string} - API主机地址 */
    this.host = 'openspeech.bytedance.com';

    /** @member {string} - API路径 */
    this.apiPath = '/api/v1/tts';
  }

  /**
   * 将文本转换为语音
   *
   * 这是核心方法，调用TTS API生成语音。
   *
   * 处理流程：
   * 1. 构建请求体（包含应用、用户、音频配置）
   * 2. 发送HTTPS POST请求
   * 3. 解析响应，提取base64编码的音频
   * 4. 解码音频数据并返回
   *
   * @async
   * @param {string} text - 要转换为语音的文本
   * @param {Object} options - 语音配置选项
   * @param {string} options.voice - 声音ID
   * @param {number} options.speed - 语速（0.5-2.0）
   * @param {number} options.volume - 音量（0-100）
   * @param {string} options.format - 音频格式（mp3, wav等）
   * @param {number} options.sampleRate - 采样率
   * @returns {Promise<Buffer>} 音频数据的Buffer
   * @throws {Error} 当API返回错误时抛出
   *
   * @example
   * ```javascript
   * const audio = await ttsClient.speak('你好，这是一个测试。', {
   *   voice: 'zh_female_mizaitongxue_v2_saturn_bigtts',
   *   speed: 1.0,
   *   format: 'mp3'
   * });
   * fs.writeFileSync('test.mp3', audio);
   * ```
   */
  async speak(text, options = {}) {
    // 设置默认值
    const voice = options.voice || 'zh_female_mizaitongxue_v2_saturn_bigtts';
    const speed = options.speed || 1.0;
    const volume = options.volume || 1.0;
    const format = options.format || 'mp3';
    const sampleRate = options.sampleRate || 24000;

    // 生成请求ID和时间戳
    const timestamp = Date.now();
    const reqId = `req_${timestamp}`;

    // 构建请求体JSON
    const requestBody = JSON.stringify({
      // 应用配置
      app: {
        appid: this.appId,
        token: this.accessToken,
        cluster: 'volc_tts_base'
      },

      // 用户配置
      user: {
        uid: 'podcast_generator'
      },

      // 音频配置
      audio: {
        voice_id: voice,
        text: text,
        encoding: format,
        speed_ratio: speed,
        volume_ratio: volume,
        sample_rate: sampleRate,
        enable_parallel: true,
        operation: 'query'
      },

      // 请求配置
      request: {
        reqid: reqId,
        timestamp: timestamp,
        expires: 60000,  // 请求有效期60秒
        operation: 'submit'
      }
    });

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-App-Id': this.appId,
      'X-Api-Access-Key': this.accessToken
    };

    // 发送HTTPS请求
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.host,
        path: this.apiPath,
        method: 'POST',
        headers: headers
      }, async (res) => {
        // 检查HTTP状态码
        if (res.statusCode !== 200) {
          let error = '';
          for await (const chunk of res) {
            error += chunk.toString();
          }
          reject(new Error(`API Error ${res.statusCode}: ${error}`));
          return;
        }

        // 收集响应数据
        const chunks = [];
        for await (const chunk of res) {
          chunks.push(chunk);
        }

        // 解析响应JSON
        const response = JSON.parse(Buffer.concat(chunks).toString());

        // 检查业务状态码
        if (response.code !== 3000) {
          reject(new Error(`TTS Error: ${response.message}`));
          return;
        }

        // 提取并解码音频
        // API返回的是base64编码的音频数据
        const audioBuffer = Buffer.from(response.data, 'base64');
        resolve(audioBuffer);
      });

      // 处理请求错误
      req.on('error', reject);

      // 发送请求体
      req.write(requestBody);
      req.end();
    });
  }

  /**
   * 生成对话音频
   *
   * 将多轮对话文本转换为语音，支持多角色。
   * 每轮对话使用对应角色的声音。
   *
   * 处理流程：
   * 1. 遍历对话列表
   * 2. 根据说话者映射到对应的声音ID
   * 3. 调用speak方法生成每轮音频
   * 4. 返回音频数组
   *
   * @async
   * @param {Array} dialogue - 对话列表，每项包含speaker和text
   * @param {string} outputPath - 输出文件路径
   * @param {Object} voiceMap - 声音映射配置
   * @returns {Promise<Array>} 音频数组，每项包含speaker和audio buffer
   *
   * @example
   * ```javascript
   * const dialogue = [
   *   { speaker: 'Alice', text: '你好！' },
   *   { speaker: 'Dr.Ye', text: '你好，有什么可以帮你的？' }
   * ];
   * const audioData = await ttsClient.generateDialogue(
   *   dialogue,
   *   './output/dialogue.mp3',
   *   voiceMap
   * );
   * ```
   */
  async generateDialogue(dialogue, outputPath, voiceMap) {
    const fs = await import('fs');
    const allAudio = [];

    // 遍历每轮对话
    for (const line of dialogue) {
      // 获取说话者的声音ID
      const voiceId = voiceMap.speakers[line.speaker]?.voice_id || line.speaker;
      console.log(`[TTS] 生成 ${line.speaker} 的语音...`);

      try {
        // 调用TTS生成语音
        const audio = await this.speak(line.text, {
          voice: voiceId,
          speed: 1.0
        });
        allAudio.push({ speaker: line.speaker, audio });
      } catch (err) {
        console.error(`[TTS] 生成失败: ${err.message}`);

        // 如果失败，使用默认声音重试
        const audio = await this.speak(line.text, {
          voice: voiceMap.default_voice || 'zh_female_mizaitongxue_v2_saturn_bigtts'
        });
        allAudio.push({ speaker: line.speaker, audio });
      }
    }

    return allAudio;
  }
}

/**
 * TTS客户端单例实例
 *
 * @type {TTSClient}
 */
export const ttsClient = new TTSClient();
