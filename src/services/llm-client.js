/**
 * ============================================================================
 * LLM瀹㈡埛绔ā鍧?(LLM Client)
 * ============================================================================
 *
 * 鍔熻兘姒傝堪锛?
 * 鏈ā鍧楀皝瑁呬簡涓庡ぇ璇█妯″瀷(LLM)API鐨勪氦浜掗€昏緫銆?
 * 鏀寔澶氱LLM鏈嶅姟鎻愪緵鍟嗭細
 * - OpenAI 鍏煎鍗忚 (OpenAI, Azure, 鏈湴閮ㄧ讲绛?
 * - Google Gemini
 *
 * ============================================================================
 * 鏍稿績鍔熻兘锛?
 * ============================================================================
 *
 * 1. chat() - 鍩虹鑱婂ぉ鎺ュ彛
 *    - 鏀寔鍚屾璋冪敤
 *    - 鍐呯疆閲嶈瘯鏈哄埗
 *    - 鑷姩鍖哄垎鏈嶅姟鍟?
 *
 * 2. chatJSON() - JSON鍝嶅簲鎺ュ彛
 *    - 鑷姩瑙ｆ瀽JSON杈撳嚭
 *    - 鏅鸿兘鎻愬彇JSON鐗囨
 *
 * 3. chatStream() - 娴佸紡鍝嶅簲鎺ュ彛
 *    - 鏀寔token绾у埆鐨勬祦寮忚緭鍑?
 *    - 浠呮敮鎸丱penAI鏍煎紡
 *
 * ============================================================================
 * 閰嶇疆璇存槑锛?
 * ============================================================================
 *
 * 鐜鍙橀噺閰嶇疆锛?
 * - OPENAI_API_KEY: API瀵嗛挜
 * - OPENAI_BASE_URL: API鍩虹URL
 * - OPENAI_MODEL: 妯″瀷鍚嶇О
 *
 * 閰嶇疆浼樺厛绾э細
 * 1. 鏋勯€犲嚱鏁颁紶鍏?
 * 2. 鐜鍙橀噺
 * 3. 榛樿鍊?
 *
 * @module llm-client
 * @author AI Podcast Generator
 * @version 1.0.0
 */

/**
 * LLM瀹㈡埛绔被
 *
 * 鑱岃矗锛?
 * - 绠＄悊LLM API杩炴帴
 * - 鍙戦€佽亰澶╄姹?
 * - 澶勭悊鍝嶅簲鍜岄敊璇?
 *
 * 璁捐鐗圭偣锛?
 * - 鏀寔澶氱LLM鏈嶅姟鍟?
 * - 鍐呯疆鑷姩閲嶈瘯鏈哄埗
 * - 鑷姩妫€娴嬫湇鍔″晢绫诲瀷
 *
 * @class LLMClient
 */
export class LLMClient {
  /**
   * 鍒涘缓LLM瀹㈡埛绔疄渚?
   *
   * @constructor
   * @param {Object} config - 閰嶇疆瀵硅薄
   * @param {string} config.apiKey - API瀵嗛挜
   * @param {string} config.baseUrl - API鍩虹URL
   * @param {string} config.model - 妯″瀷鍚嶇О
   */
  constructor(config = {}) {
    /** @member {string} - API瀵嗛挜锛屼紭鍏堜娇鐢ㄤ紶鍏ュ€硷紝鍏舵鐜鍙橀噺 */
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;

    /** @member {string} - API鍩虹URL锛岄粯璁や负绌猴紙浣跨敤瀹樻柟API锛?*/
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || '';

    /** @member {string} - 妯″瀷鍚嶇О锛岄粯璁や负GPT-4o */
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o';

    /** @member {number} - 鏈€澶ч噸璇曟鏁?*/
    this.maxRetries = 3;

    /** @member {number} - 閲嶈瘯闂撮殧锛堟绉掞級 */
    this.retryDelay = 2000;

    // 妫€娴嬫槸鍚︿负 Gemini API
    // Gemini鐨刄RL鍖呭惈鐗瑰畾鍩熷悕锛屾嵁姝ゅ垽鏂?
    /** @member {boolean} - 鏄惁涓篏oogle Gemini鏈嶅姟 */
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

  // ========================================================================
  // 鍩虹鑱婂ぉ鎺ュ彛
  // ========================================================================

  /**
   * 鍙戦€佽亰澶╂秷鎭苟鑾峰彇鍝嶅簲
   *
   * 杩欐槸鏈€鍩虹鐨勮亰澶╂帴鍙ｏ紝鍖呭惈浠ヤ笅鐗规€э細
   * - 鑷姩妫€娴嬫湇鍔″晢绫诲瀷
   * - 鍐呯疆閲嶈瘯鏈哄埗锛堟渶澶?娆★級
   * - 鑷姩澶勭悊閿欒鍜屽紓甯?
   *
   * 澶勭悊娴佺▼锛?
   * 1. 妫€鏌ユ槸鍚︿负Gemini锛岃皟鐢ㄥ搴旀柟娉?
   * 2. 濡傛灉璋冪敤澶辫触锛岃Е鍙戦噸璇曢€昏緫
   * 3. 姣忔閲嶈瘯鍓嶇瓑寰?绉?
   * 4. 3娆￠兘澶辫触鍒欐姏鍑烘渶缁堥敊璇?
   *
   * @async
   * @param {string} systemPrompt - 绯荤粺鎻愮ず璇?
   * @param {string} userContent - 鐢ㄦ埛杈撳叆鍐呭
   * @param {Object} options - 鍙€夐厤缃?
   * @param {number} options.temperature - 娓╁害鍙傛暟锛?-2锛?
   * @param {boolean} options.json - 鏄惁闇€瑕丣SON杈撳嚭
   * @param {number} options.maxTokens - 鏈€澶oken鏁?
   * @returns {Promise<string>} AI鐢熸垚鐨勬枃鏈搷搴?
   * @throws {Error} 褰撴墍鏈夐噸璇曢兘澶辫触鏃舵姏鍑?
   *
   * @example
   * ```javascript
   * const response = await llm.chat(
   *   '浣犳槸涓€涓湁甯姪鐨勫姪鎵?,
   *   '浠婂ぉ澶╂皵鎬庝箞鏍凤紵',
   *   { temperature: 0.7 }
   * );
   * ```
   */
  async chat(systemPrompt, userContent, options = {}) {
    this.checkAbort();
    // 鐢ㄤ簬瀛樺偍鏈€鍚庝竴娆￠敊璇?
    let lastError;

    // 寰幆閲嶈瘯
    // 浠?寮€濮嬶紝鍒癿axRetries缁撴潫
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.checkAbort();
        // 鏍规嵁鏈嶅姟鍟嗙被鍨嬭皟鐢ㄤ笉鍚屾柟娉?
        if (this.isGemini) {
          return await this.chatGemini(systemPrompt, userContent, options);
        } else {
          return await this.chatOpenAI(systemPrompt, userContent, options);
        }
      } catch (err) {
        if (err.name === 'AbortError' || this.signal?.aborted) throw this.abortError();
        // 鎹曡幏閿欒锛岃褰曞埌lastError
        lastError = err;

        // 杈撳嚭璀﹀憡鏃ュ織
        console.warn(`[LLM] 绗?${attempt}/${this.maxRetries} 娆″け璐? ${err.message}`);

        // 濡傛灉杩樻湁閲嶈瘯鏈轰細锛岀瓑寰呭悗缁х画
        if (attempt < this.maxRetries) {
          console.log(`[LLM] 绛夊緟 ${this.retryDelay / 1000} 绉掑悗閲嶈瘯...`);
          await this.sleep(this.retryDelay);
        }
      }
    }

    // 鎵€鏈夐噸璇曢兘澶辫触锛屾姏鍑烘渶缁堥敊璇?
    throw lastError;
  }

  /**
   * OpenAI鏍煎紡API璋冪敤
   *
   * 浣跨敤OpenAI瀹樻柟鐨凷DK杩涜API璋冪敤銆?
   * 鏀寔浠讳綍鍏煎OpenAI API鏍煎紡鐨勬湇鍔°€?
   *
   * 鍙傛暟璇存槑锛?
   * - temperature: 鎺у埗杈撳嚭闅忔満鎬э紙0=纭畾鎬э紝2=鍒涢€犳€э級
   * - response_format: JSON妯″紡纭繚杈撳嚭JSON
   * - max_tokens: 闄愬埗鏈€澶ц緭鍑簍oken鏁?
   *
   * @async
   * @param {string} systemPrompt - 绯荤粺鎻愮ず璇?
   * @param {string} userContent - 鐢ㄦ埛杈撳叆
   * @param {Object} options - 閰嶇疆閫夐」
   * @returns {Promise<string>} 鏂囨湰鍝嶅簲
   */
  async chatOpenAI(systemPrompt, userContent, options = {}) {
    this.checkAbort();
    // 鍔ㄦ€佸鍏penAI SDK
    // 浣跨敤import()璇硶锛屾敮鎸丒S Module
    const { default: OpenAI } = await import('openai');

    // 鍒涘缓OpenAI瀹㈡埛绔?
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    // 鏋勫缓璇锋眰
    const request = {
      // 浣跨敤閰嶇疆鐨勬ā鍨嬪悕绉?
      model: this.model,

      // 娑堟伅鏁扮粍锛屽寘鍚玸ystem鍜寀ser娑堟伅
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],

      // 娓╁害鍙傛暟锛岄粯璁?.7锛堝钩琛″垱閫犳€у拰纭畾鎬э級
      temperature: options.temperature ?? 0.7,

      // JSON妯″紡锛堝綋options.json涓簍rue鏃跺惎鐢級
      response_format: options.json ? { type: 'json_object' } : undefined,

      // 鏈€澶ц緭鍑簍oken鏁?
      max_tokens: options.maxTokens || 4096
    };

    const response = await client.chat.completions.create(
      request,
      this.signal ? { signal: this.signal } : undefined
    );
    this.checkAbort();

    // 鎻愬彇骞惰繑鍥炵敓鎴愮殑鏂囨湰
    // OpenAI鍝嶅簲鏍煎紡锛歳esponse.choices[0].message.content
    return response.choices[0].message.content;
  }

  /**
   * Gemini鏍煎紡API璋冪敤
   *
   * Google Gemini浣跨敤涓嶅悓鐨凙PI鏍煎紡銆?
   * 杩欓噷鎵嬪姩鏋勫缓璇锋眰骞惰皟鐢≧EST API銆?
   *
   * Gemini API鐗圭偣锛?
   * - URL鏍煎紡锛?models/{model}:generateContent
   * - 璇锋眰浣撴牸寮忥細contents鏁扮粍
   * - 鏀寔responseMimeType鎸囧畾鍝嶅簲鏍煎紡
   *
   * @async
   * @param {string} systemPrompt - 绯荤粺鎻愮ず璇?
   * @param {string} userContent - 鐢ㄦ埛杈撳叆
   * @param {Object} options - 閰嶇疆閫夐」
   * @returns {Promise<string>} 鏂囨湰鍝嶅簲
   */
  async chatGemini(systemPrompt, userContent, options = {}) {
    this.checkAbort();
    // 鏋勫缓API URL
    // 鏍煎紡锛歿baseUrl}/models/{model}:generateContent?key={apiKey}
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    // 鏋勫缓璇锋眰浣?
    const body = {
      contents: [
        {
          parts: [
            // Gemini浣跨敤鐗瑰畾鏍煎紡鎷兼帴system鍜寀ser娑堟伅
            { text: `System: ${systemPrompt}\n\nUser: ${userContent}` }
          ]
        }
      ],

      // 鐢熸垚閰嶇疆
      generationConfig: {
        // 娓╁害鍙傛暟
        temperature: options.temperature ?? 0.7,
        // 鏈€澶ц緭鍑簍oken鏁?
        maxOutputTokens: options.maxTokens || 4096,
        // 鍝嶅簲MIME绫诲瀷锛堢敤浜嶫SON妯″紡锛?
        responseMimeType: options.json ? 'application/json' : undefined
      }
    };

    // 鍙戦€丠TTP POST璇锋眰
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.signal || undefined
    });
    this.checkAbort();

    // 妫€鏌ュ搷搴旂姸鎬?
    if (!response.ok) {
      // 璇诲彇閿欒淇℃伅
      const err = await response.text();
      throw new Error(`Gemini API Error: ${err}`);
    }

    // 瑙ｆ瀽鍝嶅簲JSON
    const data = await response.json();

    // 鎻愬彇鐢熸垚鐨勬枃鏈?
    // Gemini鍝嶅簲鏍煎紡锛歞ata.candidates[0].content.parts[0].text
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return text;
  }

  // ========================================================================
  // JSON鍝嶅簲鎺ュ彛
  // ========================================================================

  /**
   * 鍙戦€佹秷鎭苟鑷姩瑙ｆ瀽JSON
   *
   * 杩欐槸chat()鐨勫寘瑁呮柟娉曪紝涓撻棬鐢ㄤ簬闇€瑕丣SON杈撳嚭鐨勫満鏅€?
   * 鍖呭惈浠ヤ笅鐗规€э細
   * - 鑷姩鍚敤JSON妯″紡
   * - 鑷姩瑙ｆ瀽JSON鍝嶅簲
   * - 鏅鸿兘鎻愬彇JSON鐗囨锛堝鏋淟LM娣诲姞浜唌arkdown鏍煎紡锛?
   *
   * 浣跨敤鍦烘櫙锛?
   * - 闇€瑕佺粨鏋勫寲鏁版嵁鐨凙gent璋冪敤
   * - metadata銆佺珷鑺傛。妗堛€佽剼鏈瓑
   *
   * @async
   * @param {string} systemPrompt - 绯荤粺鎻愮ず璇?
   * @param {string} userContent - 鐢ㄦ埛杈撳叆
   * @param {Object} options - 閰嶇疆閫夐」
   * @returns {Promise<Object>} 瑙ｆ瀽鍚庣殑JSON瀵硅薄
   * @throws {Error} 褰揓SON瑙ｆ瀽澶辫触鏃舵姏鍑?
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
      `请修复下面这段内容为合法 JSON：` + '`n`n' + content,
      {
        temperature: 0,
        json: true,
        maxTokens: options.maxTokens || 8192
      }
    );
  }

  // ========================================================================
  // 娴佸紡鍝嶅簲鎺ュ彛
  // ========================================================================

  /**
   * 娴佸紡鍝嶅簲锛堜粎OpenAI鏀寔锛?
   *
   * 浣跨敤鍦烘櫙锛?
   * - 闇€瑕佸疄鏃舵樉绀虹敓鎴愯繃绋?
   * - 鐢熸垚闀挎枃鏈椂闇€瑕侀€愭杈撳嚭
   *
   * 瀹炵幇璇存槑锛?
   * - 浣跨敤Generator鍑芥暟瀹炵幇yield
   * - Gemini鏆備笉鏀寔绠€鍗曟祦寮忥紝鍥為€€鍒板畬鏁磋緭鍑?
   *
   * @async
   * @generator
   * @param {string} systemPrompt - 绯荤粺鎻愮ず璇?
   * @param {string} userContent - 鐢ㄦ埛杈撳叆
   * @param {Object} options - 閰嶇疆閫夐」
   * @yields {string} 姣忔鐢熸垚鐨勬枃鏈墖娈?
   *
   * @example
   * ```javascript
   * for await (const chunk of llm.chatStream(prompt, input)) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  async *chatStream(systemPrompt, userContent, options = {}) {
    // Gemini鏆備笉鏀寔娴佸紡锛屽洖閫€鍒板畬鏁磋緭鍑?
    if (this.isGemini) {
      const content = await this.chat(systemPrompt, userContent, options);
      yield content;
      return;
    }

    // 鍔ㄦ€佸鍏penAI SDK
    const { default: OpenAI } = await import('openai');

    // 鍒涘缓OpenAI瀹㈡埛绔?
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });

    // 鍒涘缓娴佸紡璇锋眰
    const stream = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      stream: true,  // 鍚敤娴佸紡妯″紡
      temperature: options.temperature ?? 0.7
    });

    // 閬嶅巻娴佸紡鍝嶅簲
    for await (const chunk of stream) {
      // 鎻愬彇delta鍐呭
      const content = chunk.choices[0]?.delta?.content;
      // 濡傛灉鏈夊唴瀹癸紝yield鍑哄幓
      if (content) yield content;
    }
  }
}

/**
 * LLM瀹㈡埛绔崟渚嬪疄渚?
 *
 * 棰勫垱寤洪粯璁ら厤缃殑瀹㈡埛绔疄渚嬶紝
 * 鏂逛究澶栭儴妯″潡鐩存帴瀵煎叆浣跨敤銆?
 *
 * @type {LLMClient}
 */
export const llmClient = new LLMClient();
