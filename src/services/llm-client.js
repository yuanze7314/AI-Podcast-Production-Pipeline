/**
 * LLM client wrapper for OpenAI-compatible APIs and Google Gemini.
 *
 * The client exposes plain text chat, JSON chat, and streaming chat helpers.
 * It also centralizes retry handling, cancellation, and provider-specific
 * request formatting.
 */
export class LLMClient {
  /**
   * @param {Object} config
   * @param {string} config.apiKey
   * @param {string} config.baseUrl
   * @param {string} config.model
   * @param {AbortSignal} config.signal
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || '';
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o';
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.isGemini = this.baseUrl.includes('generativelanguage.googleapis.com');
    this.signal = config.signal || null;
  }

  abortError() {
    const error = new Error('任务已取消');
    error.name = 'AbortError';
    return error;
  }

  checkAbort() {
    if (this.signal?.aborted) throw this.abortError();
  }

  sleep(ms) {
    this.checkAbort();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(this.abortError());
      };

      this.signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Send a chat request and return a text response.
   *
   * @param {string} systemPrompt
   * @param {string} userContent
   * @param {Object} options
   * @param {number} options.temperature
   * @param {boolean} options.json
   * @param {number} options.maxTokens
   * @returns {Promise<string>}
   */
  async chat(systemPrompt, userContent, options = {}) {
    this.checkAbort();
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.checkAbort();
        if (this.isGemini) {
          return await this.chatGemini(systemPrompt, userContent, options);
        }
        return await this.chatOpenAI(systemPrompt, userContent, options);
      } catch (err) {
        if (err.name === 'AbortError' || this.signal?.aborted) throw this.abortError();
        lastError = err;

        console.warn(`[LLM] Attempt ${attempt}/${this.maxRetries} failed: ${err.message}`);

        if (attempt < this.maxRetries) {
          console.log(`[LLM] Retrying in ${this.retryDelay / 1000}s...`);
          await this.sleep(this.retryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Call an OpenAI-compatible chat completions API.
   *
   * @param {string} systemPrompt
   * @param {string} userContent
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async chatOpenAI(systemPrompt, userContent, options = {}) {
    this.checkAbort();
    const { default: OpenAI } = await import('openai');

    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    const request = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: options.temperature ?? 0.7,
      response_format: options.json ? { type: 'json_object' } : undefined,
      max_tokens: options.maxTokens || 4096
    };

    const response = await client.chat.completions.create(
      request,
      this.signal ? { signal: this.signal } : undefined
    );
    this.checkAbort();

    return response.choices[0].message.content;
  }

  /**
   * Call the Gemini REST API.
   *
   * @param {string} systemPrompt
   * @param {string} userContent
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async chatGemini(systemPrompt, userContent, options = {}) {
    this.checkAbort();
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [
        {
          parts: [
            { text: `System: ${systemPrompt}\n\nUser: ${userContent}` }
          ]
        }
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens || 4096,
        responseMimeType: options.json ? 'application/json' : undefined
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.signal || undefined
    });
    this.checkAbort();

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API Error: ${err}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Send a chat request and parse a JSON response.
   *
   * @param {string} systemPrompt
   * @param {string} userContent
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async chatJSON(systemPrompt, userContent, options = {}) {
    const content = await this.chat(systemPrompt, userContent, {
      ...options,
      maxTokens: options.maxTokens || 8192,
      json: true
    });

    const parsed = this.tryParseJSON(content);
    if (parsed.ok) return parsed.value;

    const repaired = await this.repairJSON(content, options);
    const repairedParsed = this.tryParseJSON(repaired);
    if (repairedParsed.ok) return repairedParsed.value;

    throw new Error(`无法解析JSON响应: ${content.slice(0, 160)}...`);
  }

  tryParseJSON(content) {
    try {
      return { ok: true, value: JSON.parse(content) };
    } catch {}

    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return { ok: true, value: JSON.parse(fenced[1]) };
      } catch {}
    }

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return { ok: true, value: JSON.parse(content.slice(start, end + 1)) };
      } catch {}
    }

    return { ok: false };
  }

  async repairJSON(content, options = {}) {
    return this.chat(
      '你是一个严格的 JSON 修复器。只返回合法 JSON，不要解释，不要使用 Markdown。保留原始字段含义；如果原内容被截断，尽量用空数组、空字符串或 false 补齐缺失字段。',
      `请修复下面这段内容为合法 JSON：\n\n${content}`,
      {
        temperature: 0,
        json: true,
        maxTokens: options.maxTokens || 8192
      }
    );
  }

  /**
   * Stream text chunks from an OpenAI-compatible API.
   *
   * Gemini does not use the OpenAI streaming format here, so Gemini requests
   * fall back to a complete response.
   *
   * @param {string} systemPrompt
   * @param {string} userContent
   * @param {Object} options
   * @yields {string}
   */
  async *chatStream(systemPrompt, userContent, options = {}) {
    if (this.isGemini) {
      const content = await this.chat(systemPrompt, userContent, options);
      yield content;
      return;
    }

    const { default: OpenAI } = await import('openai');

    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    const stream = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      stream: true,
      temperature: options.temperature ?? 0.7
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}

export const llmClient = new LLMClient();
