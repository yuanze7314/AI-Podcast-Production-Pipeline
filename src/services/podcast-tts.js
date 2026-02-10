/**
 * ============================================================================
 * 播客 TTS 客户端模块 (Podcast TTS Client)
 * ============================================================================
 *
 * 功能概述：
 * 本模块封装了豆包火山引擎的播客语音合成WebSocket协议。
 * 与标准TTS不同，播客TTS支持：
 * - 双人对话模式
 * - 自然对话节奏
 * - WebSocket长连接流式传输
 *
 * ============================================================================
 * WebSocket 二进制协议说明：
 * ============================================================================
 *
 * 消息帧格式（16字节固定头部）：
 * +--------+--------+--------+--------+
 * | Byte 0 | Byte 1 | Byte 2 | Byte 3 |
 * +--------+--------+--------+--------+
 * | Version(4) | HdrSize(4) |          <- 字节0
 * | MsgType(4) | Flags(4)    |          <- 字节1
 * | Serial(4) | Compression(4) |       <- 字节2
 * | Reserved  | Extensions          |  <- 字节3
 * +--------+--------+--------+--------+
 * |     Event Type (4 bytes, 可选)     |  <- 可选扩展
 * +-----------------------------------+
 * | Session ID Length (4 bytes, 可选)  |  <- 可选扩展
 * +-----------------------------------+
 * |      Session ID (变长)             |  <- 可选扩展
 * +--------+--------+--------+--------+
 * |   Payload Length (4 bytes)        |
 * +--------+--------+--------+--------+
 * |          Payload Data (变长)        |
 * +-----------------------------------+
 *
 * 关键常量：
 * - Version: 1 (4 bits, 值固定为1)
 * - HeaderSize: 4 (4 bits, 表示16字节)
 * - Serialization: JSON (1) 或 Raw (0)
 * - Compression: 无压缩 (0) 或 gzip (1)
 *
 * ============================================================================
 * 事件流程：
 * ============================================================================
 *
 * 1. 建立连接流程：
 *    Client -> StartConnection (Event 1)
 *    Server -> ConnectionStarted (Event 50)
 *
 * 2. 会话流程：
 *    Client -> StartSession (Event 100)
 *    Server -> SessionStarted (Event 150)
 *
 * 3. 数据传输流程：
 *    Server -> PodcastRoundStart (Event 360) - 新轮次开始
 *    Server -> PodcastRoundResponse (Event 361) - 音频数据
 *    Server -> PodcastRoundEnd (Event 362) - 轮次结束
 *    Server -> PodcastEnd (Event 363) - 全部完成
 *
 * 4. 结束流程：
 *    Client -> FinishSession (Event 102)
 *    Server -> SessionFinished (Event 152)
 *    Client -> FinishConnection (Event 2)
 *    Server -> ConnectionFinished (Event 52)
 *
 * @module podcast-tts
 * @author AI Podcast Generator
 * @version 1.0.0
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * 消息类型常量
 *
 * 定义了WebSocket协议中的消息类型。
 * - INVALID: 无效类型
 * - FULL_CLIENT_REQUEST: 完整客户端请求
 * - AUDIO_ONLY_CLIENT: 仅音频客户端请求
 * - FULL_SERVER_RESPONSE: 完整服务器响应
 * - AUDIO_ONLY_SERVER: 仅音频服务器响应
 *
 * @constant {Object} MSG_TYPE
 */
const MSG_TYPE = {
  INVALID: 0,
  FULL_CLIENT_REQUEST: 1,
  AUDIO_ONLY_CLIENT: 2,
  FULL_SERVER_RESPONSE: 9,
  AUDIO_ONLY_SERVER: 11
};

/**
 * 消息标志常量
 *
 * 定义了消息的控制标志。
 * - NO_SEQ: 无序号
 * - POSITIVE_SEQ: 正向序号
 * - LAST_NO_SEQ: 最后无序号
 * - NEGATIVE_SEQ: 负向序号
 * - WITH_EVENT: 携带事件
 *
 * @constant {Object} MSG_FLAG
 */
const MSG_FLAG = {
  NO_SEQ: 0,
  POSITIVE_SEQ: 1,
  LAST_NO_SEQ: 2,
  NEGATIVE_SEQ: 3,
  WITH_EVENT: 4
};

/**
 * 事件类型常量
 *
 * 定义了WebSocket通信中的所有事件类型。
 *
 * 连接事件：
 * - START_CONNECTION: 开始连接
 * - FINISH_CONNECTION: 结束连接
 * - CONNECTION_STARTED: 连接已建立
 * - CONNECTION_FAILED: 连接失败
 * - CONNECTION_FINISHED: 连接已结束
 *
 * 会话事件：
 * - START_SESSION: 开始会话
 * - FINISH_SESSION: 结束会话
 * - SESSION_STARTED: 会话已建立
 * - SESSION_FAILED: 会话失败
 * - SESSION_CANCELED: 会话已取消
 * - SESSION_FINISHED: 会话已结束
 *
 * 播客数据事件：
 * - PODCAST_ROUND_START: 新轮次开始
 * - PODCAST_ROUND_RESPONSE: 音频数据响应
 * - PODCAST_ROUND_END: 轮次结束
 * - PODCAST_END: 播客生成完成
 *
 * @constant {Object} EVENT
 */
const EVENT = {
  NONE: 0,
  START_CONNECTION: 1,
  FINISH_CONNECTION: 2,
  CONNECTION_STARTED: 50,
  CONNECTION_FAILED: 51,
  CONNECTION_FINISHED: 52,
  START_SESSION: 100,
  CANCEL_SESSION: 101,
  FINISH_SESSION: 102,
  SESSION_STARTED: 150,
  SESSION_CANCELED: 151,
  SESSION_FINISHED: 152,
  PODCAST_ROUND_START: 360,
  PODCAST_ROUND_RESPONSE: 361,
  PODCAST_ROUND_END: 362,
  PODCAST_END: 363
};

/**
 * 播客TTS客户端类
 *
 * 职责：
 * - 实现WebSocket二进制协议
 * - 构建和解析消息帧
 * - 管理连接生命周期
 * - 处理音频数据流
 *
 * @class PodcastTTSClient
 */
export class PodcastTTSClient {
  /**
   * 创建播客TTS客户端实例
   *
   * @constructor
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    /** @member {string} - WebSocket端点URL */
    this.endpoint = config.endpoint || 'wss://openspeech.bytedance.com/api/v3/sami/podcasttts';

    /** @member {string} - 应用ID，从环境变量读取 */
    this.appId = config.appId || process.env.VOLCENGINE_APP_ID;

    /** @member {string} - 访问令牌，从环境变量读取 */
    this.accessToken = config.accessToken || process.env.VOLCENGINE_ACCESS_TOKEN;

    /** @member {string} - 资源ID，播客服务的资源标识 */
    this.resourceId = config.resourceId || 'volc.service_type.10050';

    /** @member {string} - 应用密钥 */
    this.appKey = config.appKey || 'aGjiRDfUWi';
  }

  /**
   * 生成WebSocket请求头
   *
   * @returns {Object} 请求头对象
   */
  getHeaders() {
    return {
      'X-Api-App-Id': this.appId,
      'X-Api-Access-Key': this.accessToken,
      'X-Api-Resource-Id': this.resourceId,
      'X-Api-App-Key': this.appKey,
      'X-Api-Connect-Id': uuidv4()  // 连接ID，用于请求追踪
    };
  }

  // ============================================================================
  // 消息构建方法
  // ============================================================================

  /**
   * 构建WebSocket消息帧
   *
   * 这是协议的核心方法，将高层参数编码为二进制消息格式。
   *
   * 消息格式详解：
   * +--------+--------+--------+--------+
   * | Byte 0 | Byte 1 | Byte 2 | Byte 3 |
   * +--------+--------+--------+--------+
   * | Ver(4) | HdrSz(4)| MT(4) | Flags(4)|
   * +--------+--------+--------+--------+
   * | Serial(4)|Comp(4)| Reserved | Ext   |
   * +--------+--------+--------+--------+
   * |         Event Type (4 bytes)       |
   * +--------+--------+--------+--------+
   * |      Session ID Length (4 bytes)    |
   * +--------+--------+--------+--------+
   * |         Session ID (变长)           |
   * +--------+--------+--------+--------+
   * |       Payload Length (4 bytes)      |
   * +--------+--------+--------+--------+
   * |         Payload Data (变长)         |
   * +-----------------------------------+
   *
   * @param {number} msgType - 消息类型 (MSG_TYPE.*)
   * @param {number} flags - 消息标志 (MSG_FLAG.*)
   * @param {number} event - 事件类型 (EVENT.*)
   * @param {string|null} sessionId - 会话ID
   * @param {Buffer|null} payload - 负载数据
   * @returns {Buffer} 编码后的二进制消息
   */
  buildMessage(msgType, flags, event, sessionId, payload) {
    // 头部大小单位数为4（4 * 4 = 16字节）
    const headerSizeUnits = 4;

    // ================================================================
    // 构建第0字节：版本(4位) | 头部大小(4位)
    // ================================================================
    // version = 1, header_size = 4
    // 0001 (version) << 4 | 0100 (header_size) = 00010100 = 20
    const byte0 = (1 << 4) | headerSizeUnits;

    // ================================================================
    // 构建第1字节：消息类型(4位) | 标志(4位)
    // ================================================================
    const byte1 = (msgType << 4) | flags;

    // ================================================================
    // 构建第2字节：序列化方式(4位) | 压缩方式(4位)
    // ================================================================
    // serialization = JSON (1), compression = 无压缩 (0)
    const byte2 = (1 << 4) | 0;

    // ================================================================
    // 构建固定头部（16字节）
    // ================================================================
    const header = Buffer.alloc(16);
    header[0] = byte0;    // 版本和头部大小
    header[1] = byte1;    // 消息类型和标志
    header[2] = byte2;    // 序列化和压缩
    header[3] = 0;        // 保留字段
    // 字节4-15是填充（已初始化为0）

    // ================================================================
    // 构建消息体（可选）
    // ================================================================
    let body = Buffer.alloc(0);

    // 如果是携带事件的消息，需要添加事件类型
    if (flags === MSG_FLAG.WITH_EVENT) {
      // 事件类型（4字节，大端序）
      const eventBuf = Buffer.alloc(4);
      eventBuf.writeInt32BE(event, 0);
      body = Buffer.concat([body, eventBuf]);

      // 如果需要会话ID且不是连接相关事件
      if (sessionId && event !== EVENT.START_CONNECTION && event !== EVENT.FINISH_CONNECTION) {
        // 会话ID长度（4字节，大端序）
        const sidBuf = Buffer.from(sessionId, 'utf8');
        const sidLenBuf = Buffer.alloc(4);
        sidLenBuf.writeUInt32BE(sidBuf.length, 0);

        // 拼接长度和ID
        body = Buffer.concat([body, sidLenBuf, sidBuf]);
      }
    }

    // ================================================================
    // 添加负载数据（如果有）
    // ================================================================
    if (payload && payload.length > 0) {
      // 负载长度（4字节，大端序）
      const payloadLenBuf = Buffer.alloc(4);
      payloadLenBuf.writeUInt32BE(payload.length, 0);

      // 拼接长度和负载
      body = Buffer.concat([body, payloadLenBuf, payload]);
    }

    // 返回完整的消息帧（头部 + 消息体）
    return Buffer.concat([header, body]);
  }

  /**
   * 构建开始连接消息
   *
   * 会话建立的第一步，用于初始化WebSocket连接。
   *
   * @returns {Buffer} 编码后的消息帧
   */
  buildStartConnection() {
    return this.buildMessage(
      MSG_TYPE.FULL_CLIENT_REQUEST,
      MSG_FLAG.WITH_EVENT,
      EVENT.START_CONNECTION,
      null,
      Buffer.from('{}')  // 空负载
    );
  }

  /**
   * 构建开始会话消息
   *
   * 连接建立后，发送此消息开始一个播客生成任务。
   * 负载中包含播客配置和对话文本。
   *
   * @param {string} sessionId - 会话ID
   * @param {Object} payload - 播客生成配置
   * @returns {Buffer} 编码后的消息帧
   */
  buildStartSession(sessionId, payload) {
    // 将JSON对象编码为UTF-8 Buffer
    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');

    return this.buildMessage(
      MSG_TYPE.FULL_CLIENT_REQUEST,
      MSG_FLAG.WITH_EVENT,
      EVENT.START_SESSION,
      sessionId,
      payloadBytes
    );
  }

  /**
   * 构建结束会话消息
   *
   * 音频数据接收完成后，发送此消息结束当前会话。
   *
   * @param {string} sessionId - 会话ID
   * @returns {Buffer} 编码后的消息帧
   */
  buildFinishSession(sessionId) {
    return this.buildMessage(
      MSG_TYPE.FULL_CLIENT_REQUEST,
      MSG_FLAG.WITH_EVENT,
      EVENT.FINISH_SESSION,
      sessionId,
      Buffer.from('{}')
    );
  }

  /**
   * 构建结束连接消息
   *
   * 会话结束后，发送此消息关闭WebSocket连接。
   *
   * @returns {Buffer} 编码后的消息帧
   */
  buildFinishConnection() {
    return this.buildMessage(
      MSG_TYPE.FULL_CLIENT_REQUEST,
      MSG_FLAG.WITH_EVENT,
      EVENT.FINISH_CONNECTION,
      null,
      Buffer.from('{}')
    );
  }

  // ============================================================================
  // 消息解析方法
  // ============================================================================

  /**
   * 解析服务器响应消息
   *
   * 将二进制WebSocket消息解码为可读的对象格式。
   *
   * 解析流程：
   * 1. 解析固定头部（版本、消息类型、标志）
   * 2. 根据标志解析可选字段（事件类型、会话ID）
   * 3. 解析负载数据（JSON或二进制音频）
   *
   * @param {Buffer} buffer - 原始二进制消息
   * @returns {Object|null} 解析后的消息对象，解析失败返回null
   *
   * @example
   * ```javascript
   * const response = client.parseResponse(buffer);
   * console.log(response.event, response.payload);
   * ```
   */
  parseResponse(buffer) {
    // 检查缓冲区有效性
    if (!buffer || buffer.length < 4) return null;

    // ================================================================
    // 解析固定头部
    // ================================================================

    // Byte 0: version(4 bits) | header_size(4 bits)
    const version = buffer[0] >> 4;
    const headerSize = buffer[0] & 0x0F;

    // Byte 1: msg_type(4 bits) | flags(4 bits)
    const msgType = buffer[1] >> 4;
    const flags = buffer[1] & 0x0F;

    // 计算可选字段的起始偏移位置
    // headerSize是以4字节为单位，所以要乘以4
    let offset = 4 * headerSize;

    // ================================================================
    // 解析错误消息
    // ================================================================
    if (msgType === 15) { // ERROR类型
      // 错误码（4字节，大端序）
      if (buffer.length >= offset + 4) {
        errorCode = buffer.readInt32BE(offset);
        offset += 4;
      }

      // 错误负载
      let payload = null;
      if (buffer.length >= offset + 4) {
        const payloadLen = buffer.readUInt32BE(offset);
        offset += 4;
        if (payloadLen > 0 && buffer.length >= offset + payloadLen) {
          try {
            // 尝试解析JSON
            payload = JSON.parse(buffer.slice(offset, offset + payloadLen).toString('utf8'));
          } catch (e) {
            // 解析失败，返回原始字符串
            payload = buffer.slice(offset, offset + payloadLen).toString('utf8');
          }
        }
      }
      return { version, msgType, flags, event, errorCode, payload };
    }

    // ================================================================
    // 解析事件消息
    // ================================================================
    if (flags === MSG_FLAG.WITH_EVENT) {
      // 事件类型（4字节，大端序）
      if (buffer.length >= offset + 4) {
        event = buffer.readInt32BE(offset);
        offset += 4;
      }

      // 会话ID（如果是需要会话ID的事件）
      if (buffer.length >= offset + 4 && event !== EVENT.START_CONNECTION && event !== EVENT.FINISH_CONNECTION) {
        const sidLen = buffer.readUInt32BE(offset);
        offset += 4;
        if (sidLen > 0 && buffer.length >= offset + sidLen) {
          sessionId = buffer.slice(offset, offset + sidLen).toString('utf8');
          offset += sidLen;
        }
      }
    }

    // ================================================================
    // 解析负载数据
    // ================================================================
    let payload = null;
    if (buffer.length >= offset + 4) {
      const payloadLen = buffer.readUInt32BE(offset);
      offset += 4;
      if (payloadLen > 0 && buffer.length >= offset + payloadLen) {
        const payloadData = buffer.slice(offset, offset + payloadLen);

        // 尝试解析为JSON（用于元数据）
        try {
          payload = JSON.parse(payloadData.toString('utf8'));
        } catch (e) {
          // 如果解析失败，可能是二进制音频数据，直接返回Buffer
          payload = payloadData;
        }
      }
    }

    return { version, msgType, flags, event, sessionId, payload };
  }

  // ============================================================================
  // 主业务方法
  // ============================================================================

  /**
   * 生成播客音频
   *
   * 这是核心方法，执行完整的播客生成流程：
   * 1. 读取对话脚本和声音配置
   * 2. 建立WebSocket连接
   * 3. 发送播客生成请求
   * 4. 接收并拼接音频数据
   * 5. 保存最终音频文件
   *
   * @async
   * @param {string} scriptPath - 对话脚本JSON文件路径
   * @param {string} voiceMapPath - 声音映射配置JSON文件路径
   * @param {string} outputPath - 输出音频文件路径
   * @returns {Promise<Object>} 生成结果对象
   * @throws {Error} 当生成失败时抛出
   *
   * @example
   * ```javascript
   * const result = await podcastTTSClient.generatePodcast(
   *   './scripts/final_script.json',
   *   './config/voice_map.json',
   *   './output/podcast.mp3'
   * );
   * console.log(`音频已保存: ${result.outputPath}`);
   * ```
   */
  async generatePodcast(scriptPath, voiceMapPath, outputPath) {
    // 读取对话脚本
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));

    // 读取声音映射配置
    const voiceMap = JSON.parse(fs.readFileSync(voiceMapPath, 'utf8'));

    // 生成唯一标识符
    const requestId = uuidv4();
    const sessionId = uuidv4();

    // ================================================================
    // 构建播客生成请求负载
    // ================================================================
    const payload = {
      // 输入标识符
      input_id: `podcast_${Date.now()}`,

      // 操作类型：3 = 根据对话文本生成
      action: 3,

      // 音乐配置
      use_head_music: voiceMap.settings?.use_head_music ?? false,
      use_tail_music: voiceMap.settings?.use_tail_music ?? false,

      // 音频配置
      audio_config: voiceMap.audio_config || {
        format: 'mp3',
        sample_rate: 24000,
        speech_rate: 0
      },

      // 对话文本列表
      // 将角色名映射到声音ID
      nlp_texts: script.dialogue.map(d => ({
        speaker: voiceMap.speakers[d.speaker]?.voice_id || d.speaker,
        text: d.text
      }))
    };

    // 日志：显示请求信息
    console.log(`[TTS] 发起请求: ${script.dialogue.length} 轮对话`);

    // ================================================================
    // WebSocket通信流程
    // ================================================================
    return new Promise((resolve, reject) => {
      // 超时定时器
      let timeoutId = null;

      // 创建WebSocket连接
      const ws = new WebSocket(this.endpoint, { headers: this.getHeaders() });

      // 收集音频数据块
      const audioChunks = [];

      // 日志：显示连接状态
      console.log('[TTS] WebSocket 连接中...');

      // ============================================================
      // WebSocket事件处理
      // ============================================================

      /**
       * 连接打开事件
       * - 发送 StartConnection 消息
       */
      ws.on('open', () => {
        console.log('[TTS] 连接成功，发送 StartConnection...');
        ws.send(this.buildStartConnection());
      });

      /**
       * 消息接收事件
       * - 解析消息
       * - 根据事件类型处理
       */
      ws.on('message', (data) => {
        // 解析二进制消息
        const response = this.parseResponse(data);
        if (!response) {
          console.log('[TTS] 无法解析响应');
          return;
        }

        // 调试日志
        console.log(`[TTS] 收到: msgType=${response.msgType}, event=${response.event}, flags=${response.flags}`);

        // 处理错误响应
        if (response.msgType === 15) {
          console.error(`[TTS] 服务器错误: ${JSON.stringify(response.payload)}`);
          ws.close();
          reject(new Error(`服务器错误: ${JSON.stringify(response.payload)}`));
          return;
        }

        // 根据事件类型分发处理
        switch (response.event) {
          // ----------------------------------------
          // 连接相关事件
          // ----------------------------------------
          case EVENT.CONNECTION_STARTED:
            console.log('[TTS] 连接已建立，发送 StartSession...');
            ws.send(this.buildStartSession(sessionId, payload));
            break;

          case EVENT.CONNECTION_FAILED:
            console.error(`[TTS] 连接失败: ${JSON.stringify(response.payload)}`);
            ws.close();
            reject(new Error('连接失败'));
            break;

          // ----------------------------------------
          // 会话相关事件
          // ----------------------------------------
          case EVENT.SESSION_STARTED:
            console.log('[TTS] 会话已建立，发送 FinishSession...');
            ws.send(this.buildFinishSession(sessionId));
            break;

          case EVENT.SESSION_FAILED:
            console.error(`[TTS] 会话失败: ${JSON.stringify(response.payload)}`);
            ws.close();
            reject(new Error('会话失败'));
            break;

          // ----------------------------------------
          // 播客数据事件
          // ----------------------------------------
          case EVENT.PODCAST_ROUND_RESPONSE:
            // 音频数据（二进制）
            if (Buffer.isBuffer(response.payload)) {
              audioChunks.push(response.payload);
              console.log(`[TTS] 收到音频数据: ${response.payload.length} bytes`);
            }
            break;

          case EVENT.PODCAST_ROUND_END:
            console.log(`[TTS] 轮次结束: ${JSON.stringify(response.payload)}`);
            break;

          case EVENT.PODCAST_END:
            console.log(`[TTS] 播客生成完成: ${JSON.stringify(response.payload)}`);

            // 音频数据收集完成，保存文件
            if (audioChunks.length > 0) {
              // 拼接所有音频块
              const fullAudio = Buffer.concat(audioChunks);

              // 确保输出目录存在
              const dir = path.dirname(outputPath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }

              // 保存音频文件
              fs.writeFileSync(outputPath, fullAudio);

              // 计算文件大小（MB）
              const sizeMB = (fullAudio.length / 1024 / 1024).toFixed(2);
              console.log(`[TTS] 音频已保存: ${outputPath} (${sizeMB} MB)`);

              // 发送结束连接消息
              ws.send(this.buildFinishConnection());

              // 返回成功结果
              resolve({ success: true, outputPath, size: fullAudio.length });
            } else {
              // 没有收到音频数据
              ws.send(this.buildFinishConnection());
              reject(new Error('没有收到音频数据'));
            }
            break;

          // ----------------------------------------
          // 连接结束事件
          // ----------------------------------------
          case EVENT.SESSION_FINISHED:
            console.log('[TTS] 会话已结束');
            break;

          case EVENT.CONNECTION_FINISHED:
            console.log('[TTS] 连接已结束');
            ws.close();
            break;

          // ----------------------------------------
          // 默认处理
          // ----------------------------------------
          default:
            if (response.payload && response.payload.error) {
              console.error(`[TTS] 错误: ${JSON.stringify(response.payload)}`);
            }
        }
      });

      /**
       * 连接关闭事件
       * - 处理意外断开的情况
       */
      ws.on('close', (code, reason) => {
        console.log(`[TTS] 连接关闭: code=${code}`);
        if (timeoutId) clearTimeout(timeoutId);

        // 如果已经收集到音频数据，保存文件
        if (audioChunks.length > 0) {
          const fullAudio = Buffer.concat(audioChunks);
          const dir = path.dirname(outputPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(outputPath, fullAudio);
          const sizeMB = (fullAudio.length / 1024 / 1024).toFixed(2);
          console.log(`[TTS] 音频已保存: ${outputPath} (${sizeMB} MB)`);
          resolve({ success: true, outputPath, size: fullAudio.length });
        } else {
          reject(new Error(`连接关闭: ${reason?.toString() || code}`));
        }
      });

      /**
       * WebSocket错误事件
       */
      ws.on('error', (err) => {
        console.error(`[TTS] 错误: ${err.message}`);
        if (timeoutId) clearTimeout(timeoutId);
        reject(err);
      });

      // 设置超时保护（2分钟）
      timeoutId = setTimeout(() => {
        console.log('[TTS] 超时');
        ws.close();
      }, 120000);
    });
  }
}

/**
 * 播客TTS客户端单例实例
 *
 * @type {PodcastTTSClient}
 */
export const podcastTTSClient = new PodcastTTSClient();
