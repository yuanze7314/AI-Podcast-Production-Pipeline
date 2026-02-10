/**
 * ============================================================================
 * LLM客户端模块 (LLM Client)
 * ============================================================================
 *
 * 功能概述：
 * 本模块封装了与大语言模型(LLM)API的交互逻辑。
 * 支持多种LLM服务提供商：
 * - OpenAI 兼容协议 (OpenAI, Azure, 本地部署等)
 * - Google Gemini
 *
 * ============================================================================
 * 核心功能：
 * ============================================================================
 *
 * 1. chat() - 基础聊天接口
 *    - 支持同步调用
 *    - 内置重试机制
 *    - 自动区分服务商
 *
 * 2. chatJSON() - JSON响应接口
 *    - 自动解析JSON输出
 *    - 智能提取JSON片段
 *
 * 3. chatStream() - 流式响应接口
 *    - 支持token级别的流式输出
 *    - 仅支持OpenAI格式
 *
 * ============================================================================
 * 配置说明：
 * ============================================================================
 *
 * 环境变量配置：
 * - OPENAI_API_KEY: API密钥
 * - OPENAI_BASE_URL: API基础URL
 * - OPENAI_MODEL: 模型名称
 *
 * 配置优先级：
 * 1. 构造函数传入
 * 2. 环境变量
 * 3. 默认值
 *
 * @module llm-client
 * @author AI Podcast Generator
 * @version 1.0.0
 */

/**
 * LLM客户端类
 *
 * 职责：
 * - 管理LLM API连接
 * - 发送聊天请求
 * - 处理响应和错误
 *
 * 设计特点：
 * - 支持多种LLM服务商
 * - 内置自动重试机制
 * - 自动检测服务商类型
 *
 * @class LLMClient
 */
export class LLMClient {
  /**
   * 创建LLM客户端实例
   *
   * @constructor
   * @param {Object} config - 配置对象
   * @param {string} config.apiKey - API密钥
   * @param {string} config.baseUrl - API基础URL
   * @param {string} config.model - 模型名称
   */
  constructor(config = {}) {
    /** @member {string} - API密钥，优先使用传入值，其次环境变量 */
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    /** @member {string} - API基础URL，默认为空（使用官方API） */
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || '';

    /** @member {string} - 模型名称，默认为GPT-4o */
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o';

    /** @member {number} - 最大重试次数 */
    this.maxRetries = 3;

    /** @member {number} - 重试间隔（毫秒） */
    this.retryDelay = 2000;

    // 检测是否为 Gemini API
    // Gemini的URL包含特定域名，据此判断
    /** @member {boolean} - 是否为Google Gemini服务 */
    this.isGemini = this.baseUrl.includes('generativelanguage.googleapis.com');
  }

  // ========================================================================
  // 基础聊天接口
  // ========================================================================

  /**
   * 发送聊天消息并获取响应
   *
   * 这是最基础的聊天接口，包含以下特性：
   * - 自动检测服务商类型
   * - 内置重试机制（最多3次）
   * - 自动处理错误和异常
   *
   * 处理流程：
   * 1. 检查是否为Gemini，调用对应方法
   * 2. 如果调用失败，触发重试逻辑
   * 3. 每次重试前等待2秒
   * 4. 3次都失败则抛出最终错误
   *
   * @async
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userContent - 用户输入内容
   * @param {Object} options - 可选配置
   * @param {number} options.temperature - 温度参数（0-2）
   * @param {boolean} options.json - 是否需要JSON输出
   * @param {number} options.maxTokens - 最大token数
   * @returns {Promise<string>} AI生成的文本响应
   * @throws {Error} 当所有重试都失败时抛出
   *
   * @example
   * ```javascript
   * const response = await llm.chat(
   *   '你是一个有帮助的助手',
   *   '今天天气怎么样？',
   *   { temperature: 0.7 }
   * );
   * ```
   */
  async chat(systemPrompt, userContent, options = {}) {
    // 用于存储最后一次错误
    let lastError;

    // 循环重试
    // 从1开始，到maxRetries结束
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // 根据服务商类型调用不同方法
        if (this.isGemini) {
          return await this.chatGemini(systemPrompt, userContent, options);
        } else {
          return await this.chatOpenAI(systemPrompt, userContent, options);
        }
      } catch (err) {
        // 捕获错误，记录到lastError
        lastError = err;

        // 输出警告日志
        console.warn(`[LLM] 第 ${attempt}/${this.maxRetries} 次失败: ${err.message}`);

        // 如果还有重试机会，等待后继续
        if (attempt < this.maxRetries) {
          console.log(`[LLM] 等待 ${this.retryDelay / 1000} 秒后重试...`);
          await new Promise(r => setTimeout(r, this.retryDelay));
        }
      }
    }

    // 所有重试都失败，抛出最终错误
    throw lastError;
  }

  /**
   * OpenAI格式API调用
   *
   * 使用OpenAI官方的SDK进行API调用。
   * 支持任何兼容OpenAI API格式的服务。
   *
   * 参数说明：
   * - temperature: 控制输出随机性（0=确定性，2=创造性）
   * - response_format: JSON模式确保输出JSON
   * - max_tokens: 限制最大输出token数
   *
   * @async
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userContent - 用户输入
   * @param {Object} options - 配置选项
   * @returns {Promise<string>} 文本响应
   */
  async chatOpenAI(systemPrompt, userContent, options = {}) {
    // 动态导入OpenAI SDK
    // 使用import()语法，支持ES Module
    const { default: OpenAI } = await import('openai');

    // 创建OpenAI客户端
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    // 构建请求
    const response = await client.chat.completions.create({
      // 使用配置的模型名称
      model: this.model,

      // 消息数组，包含system和user消息
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],

      // 温度参数，默认0.7（平衡创造性和确定性）
      temperature: options.temperature ?? 0.7,

      // JSON模式（当options.json为true时启用）
      response_format: options.json ? { type: 'json_object' } : undefined,

      // 最大输出token数
      max_tokens: options.maxTokens || 4096
    });

    // 提取并返回生成的文本
    // OpenAI响应格式：response.choices[0].message.content
    return response.choices[0].message.content;
  }

  /**
   * Gemini格式API调用
   *
   * Google Gemini使用不同的API格式。
   * 这里手动构建请求并调用REST API。
   *
   * Gemini API特点：
   * - URL格式：/models/{model}:generateContent
   * - 请求体格式：contents数组
   * - 支持responseMimeType指定响应格式
   *
   * @async
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userContent - 用户输入
   * @param {Object} options - 配置选项
   * @returns {Promise<string>} 文本响应
   */
  async chatGemini(systemPrompt, userContent, options = {}) {
    // 构建API URL
    // 格式：{baseUrl}/models/{model}:generateContent?key={apiKey}
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    // 构建请求体
    const body = {
      contents: [
        {
          parts: [
            // Gemini使用特定格式拼接system和user消息
            { text: `System: ${systemPrompt}\n\nUser: ${userContent}` }
          ]
        }
      ],

      // 生成配置
      generationConfig: {
        // 温度参数
        temperature: options.temperature ?? 0.7,
        // 最大输出token数
        maxOutputTokens: options.maxTokens || 4096,
        // 响应MIME类型（用于JSON模式）
        responseMimeType: options.json ? 'application/json' : undefined
      }
    };

    // 发送HTTP POST请求
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // 检查响应状态
    if (!response.ok) {
      // 读取错误信息
      const err = await response.text();
      throw new Error(`Gemini API Error: ${err}`);
    }

    // 解析响应JSON
    const data = await response.json();

    // 提取生成的文本
    // Gemini响应格式：data.candidates[0].content.parts[0].text
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return text;
  }

  // ========================================================================
  // JSON响应接口
  // ========================================================================

  /**
   * 发送消息并自动解析JSON
   *
   * 这是chat()的包装方法，专门用于需要JSON输出的场景。
   * 包含以下特性：
   * - 自动启用JSON模式
   * - 自动解析JSON响应
   * - 智能提取JSON片段（如果LLM添加了markdown格式）
   *
   * 使用场景：
   * - 需要结构化数据的Agent调用
   * - metadata、章节档案、脚本等
   *
   * @async
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userContent - 用户输入
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 解析后的JSON对象
   * @throws {Error} 当JSON解析失败时抛出
   *
   * @example
   * ```javascript
   * const data = await llm.chatJSON(
   *   prompts.chapterMinerPrompt,
   *   chapterText
   * );
   * console.log(data.logic_atoms);
   * ```
   */
  async chatJSON(systemPrompt, userContent, options = {}) {
    // 先调用chat方法，设置json: true
    let content = await this.chat(systemPrompt, userContent, {
      ...options,
      json: true  // 启用JSON模式
    });

    // 尝试解析JSON
    try {
      // 直接解析（如果响应是纯JSON）
      return JSON.parse(content);
    } catch (e) {
      // 如果直接解析失败，尝试从markdown代码块中提取JSON
      // 很多LLM会这样输出：```json\n{...}\n```
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }

      // 如果还是失败，抛出错误
      // 显示错误信息和内容片段（截取前100字符）
      throw new Error(`无法解析JSON响应: ${content.slice(0, 100)}...`);
    }
  }

  // ========================================================================
  // 流式响应接口
  // ========================================================================

  /**
   * 流式响应（仅OpenAI支持）
   *
   * 使用场景：
   * - 需要实时显示生成过程
   * - 生成长文本时需要逐步输出
   *
   * 实现说明：
   * - 使用Generator函数实现yield
   * - Gemini暂不支持简单流式，回退到完整输出
   *
   * @async
   * @generator
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userContent - 用户输入
   * @param {Object} options - 配置选项
   * @yields {string} 每次生成的文本片段
   *
   * @example
   * ```javascript
   * for await (const chunk of llm.chatStream(prompt, input)) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  async *chatStream(systemPrompt, userContent, options = {}) {
    // Gemini暂不支持流式，回退到完整输出
    if (this.isGemini) {
      const content = await this.chat(systemPrompt, userContent, options);
      yield content;
      return;
    }

    // 动态导入OpenAI SDK
    const { default: OpenAI } = await import('openai');

    // 创建OpenAI客户端
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    // 创建流式请求
    const stream = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      stream: true,  // 启用流式模式
      temperature: options.temperature ?? 0.7
    });

    // 遍历流式响应
    for await (const chunk of stream) {
      // 提取delta内容
      const content = chunk.choices[0]?.delta?.content;
      // 如果有内容，yield出去
      if (content) yield content;
    }
  }
}

/**
 * LLM客户端单例实例
 *
 * 预创建默认配置的客户端实例，
 * 方便外部模块直接导入使用。
 *
 * @type {LLMClient}
 */
export const llmClient = new LLMClient();
