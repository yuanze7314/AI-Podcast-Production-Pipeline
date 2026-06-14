/**
 * ============================================================================
 * PDF解析器模块 (PDF Parser Module)
 * ============================================================================
 *
 * 功能概述：
 * 本模块负责将PDF格式的书籍转换为可处理的文本数据。
 * 主要包括三个核心功能：
 * 1. PDF文本提取 - 从PDF文件中读取原始文本内容
 * 2. 文本清洗 - 去除页眉、页脚、乱码等噪声数据
 * 3. 章节切分 - 根据目录结构将文本按章节划分
 *
 * 依赖说明：
 * - pdf-parse: 用于解析PDF文件，提取文本内容
 * - fs/promises: 文件系统操作，用于读写文件
 * - path: 路径处理工具
 *
 * @module pdf-parser
 * @author AI Podcast Generator
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

/**
 * PDF解析器类
 *
 * 核心职责：
 * - 加载并解析PDF文件
 * - 清洗提取的原始文本
 * - 支持按目录结构切分章节
 *
 * 使用示例：
 * ```javascript
 * const parser = new PDFParser('./book.pdf');
 * await parser.load();
 * parser.clean();
 * const chapters = parser.splitByTOC(toc);
 * ```
 */
export class PDFParser {
  /**
   * 创建PDF解析器实例
   *
   * @param {string} bookPath - PDF文件的路径
   * @throws {Error} 当文件路径无效时抛出错误
   */
  constructor(bookPath) {
    /** @member {string} - PDF文件的完整路径 */
    this.bookPath = bookPath;

    /** @member {string} - 从PDF提取的原始文本内容（未清洗） */
    this.rawText = '';

    /** @member {string} - 清洗后的文本内容（去除噪声） */
    this.cleanedText = '';
  }

  /**
   * 加载并解析PDF文件
   *
   * 此方法执行以下操作：
   * 1. 同步读取PDF文件的二进制数据
   * 2. 使用pdf-parse库解析PDF内容
   * 3. 提取文本并存储到rawText属性
   * 4. 输出日志显示提取的页数信息
   *
   * @returns {Promise<PDFParser>} 返回当前实例，支持链式调用
   * @async
   *
   * @example
   * ```javascript
   * const parser = new PDFParser('./book.pdf');
   * await parser.load();
   * console.log(parser.rawText.length); // 文本总字符数
   * ```
   */
  async load() {
    // 读取PDF文件的二进制数据
    // fs.readFileSync 是同步操作，会阻塞直到文件读取完成
    const dataBuffer = fs.readFileSync(this.bookPath);

    // 使用pdf-parse解析PDF数据
    // pdf-parse内部使用PDF.js库，能够提取PDF中的文本内容
    // 返回的data对象包含：text(文本内容)、numpages(页数)、numrender(渲染页数)等属性
    const data = await pdf(dataBuffer);

    // 将提取的文本存储到实例属性
    this.rawText = data.text;

    // 输出日志：记录成功加载的页数
    // 使用方括号标记这是PDF模块的日志输出
    console.log(`[PDF] 成功读取PDF，共 ${data.numpages} 页`);

    // 返回this支持链式调用，如：await parser.load().clean()
    return this;
  }

  /**
   * 清洗文本：去除页眉、页脚、乱码等噪声数据
   *
   * 清洗规则：
   * 1. 连续3个及以上换行符替换为2个换行符（去除多余空行）
   * 2. 去除ASCII控制字符（0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F）
   *    这些字符包括：退格符、换页符、垂直制表符等不可见字符
   *
   * 注意：此方法是一个简单的清洗实现
   * 实际项目中可能需要更复杂的清洗逻辑，如：
   * - 去除页眉页脚（通过匹配固定模式的文本）
   * - 去除页码数字
   * - 修复因PDF解析导致的乱码
   *
   * @returns {PDFParser} 返回当前实例，支持链式调用
   * @example
   * ```javascript
   * parser.load().clean();
   * // parser.cleanedText 现在包含清洗后的文本
   * ```
   */
  clean() {
    let cleaned = this.rawText;

    // 去除多余空行的处理逻辑
    // 正表达式 \n{3,} 匹配连续3个及以上的换行符
    // 将其替换为 \n\n，即两个换行符
    // 这样可以消除因PDF排版产生的大块空白区域
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 去除特殊控制字符
    // 正表达式 [\x00-\x08\x0B\x0C\x0E-\x1F\x7F] 匹配以下字符：
    // - \x00-\x08: 0-8的ASCII控制字符（NUL至退格）
    // - \x0B: 垂直制表符（VT）
    // - \x0C: 换页符（FF）
    // - \x0E-\x1F: 14-31的ASCII控制字符
    // - \x7F: 删除符（DEL）
    // 这些字符通常不会出现在正常文本中，但可能因PDF编码问题而产生
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // 将清洗后的文本存储到实例属性
    this.cleanedText = cleaned;

    // 输出日志：标记清洗操作完成
    console.log(`[PDF] 文本清洗完成`);

    return this;
  }

  /**
   * 根据目录切分章节
   *
   * 此方法是一个简化实现，目前只是创建章节元数据框架
   * 实际的文本内容提取需要在更精确的字符位置映射
   *
   * 注意：这是一个简化版本，实际使用中需要：
   * 1. 建立PDF页码到文本字符位置的精确映射
   * 2. 或者使用更智能的文本分割算法（如基于章节标题匹配）
   *
   * @param {Array} toc - 目录数组，每项包含 {title, page}
   * @param {string} toc[].title - 章节标题
   * @param {number} toc[].page - 章节起始页码（可选）
   * @returns {Array} 章节数组，每项包含章节ID、标题、页码和文本
   *
   * @example
   * ```javascript
   * const toc = [
   *   { title: '第一章：开篇', page: 1 },
   *   { title: '第二章：发展', page: 10 }
   * ];
   * const chapters = parser.splitByTOC(toc);
   * // 返回: [{id: '01', title: '第一章：开篇', page: 1, text: '...'}, ...]
   * ```
   */
  splitByTOC(toc) {
    // 初始化空数组，用于存储切分后的章节数据
    const chapters = [];

    // 获取清洗后的完整文本
    const text = this.cleanedText;

    // ================================================================
    // 注意：此实现是一个简化版本
    // 实际项目中，PDF页码与字符位置之间没有直接的对应关系
    // 需要更复杂的算法来实现精确分割
    // ========================================

    // 遍历目录数组，为每个章节创建元数据
    for (let i = 0; i < toc.length; i++) {
      // 当前章节的目录信息
      const current = toc[i];

      // 下一章节的目录信息（用于计算当前章节的结束位置）
      // 注意：最后一章时 next 为 undefined
      const next = toc[i + 1];

      // 创建章节数据对象
      const chapterData = {
        /** @property {string} id - 章节ID，使用两位数字，如 '01', '02' */
        id: String(i + 1).padStart(2, '0'),

        /** @property {string} title - 章节标题 */
        title: current.title,

        /** @property {number} page - 章节起始页码 */
        page: current.page,

        /** @property {string} text - 章节文本内容（当前实现为空） */
        // 注意：由于PDF解析限制，无法直接获取精确的页码对应文本
        // 实际使用时需要更复杂的字符位置映射算法
        text: '' // 实际内容需要更精确提取
      };

      // 将章节数据添加到结果数组
      chapters.push(chapterData);
    }

    // 输出日志：显示初步切分的章节数量
    console.log(`[PDF] 初步切分为 ${chapters.length} 个章节`);

    // 返回章节数组
    return chapters;
  }

  /**
   * 导出清洗后的完整文本到文件
   *
   * 此方法将清洗后的完整文本保存到指定路径
   * 通常用于调试或生成中间结果文件
   *
   * @param {string} outputPath - 输出文件的完整路径
   * @returns {void}
   *
   * @example
   * ```javascript
   * parser.load().clean();
   * parser.exportCleanedText('./output/cleaned_book.txt');
   * // 清洗后的文本已保存到 ./output/cleaned_book.txt
   * ```
   */
  exportCleanedText(outputPath) {
    // 使用同步写入方式将清洗后的文本保存到文件
    // 'utf8' 参数指定字符编码为UTF-8
    fs.writeFileSync(outputPath, this.cleanedText, 'utf8');

    // 输出日志：显示导出文件的路径
    console.log(`[PDF] 已导出清洗文本至: ${outputPath}`);
  }
}

/**
 * 目录解析器
 *
 * 功能：从纯文本格式的目录文件中解析出章节信息
 *
 * 支持的目录格式：
 * - "第一章：xxx"
 * - "第二章：xxx"
 * - "第十章：xxx"（支持中文数字）
 *
 * 使用的数字转换映射：
 * 一二三四五六七八九十百千零 -> 1-10, 100, 1000, 0
 *
 * @param {string} txtPath - 目录文本文件的路径
 * @returns {Array} 解析后的目录数组
 * @throws {Error} 当文件读取失败时抛出错误
 *
 * @example
 * ```javascript
 * const toc = parseTOC('./toc.txt');
 * // 返回: [{number: 1, title: '第一章：开篇', line: '第一章：开篇'}, ...]
 * ```
 */
export function parseTOC(txtPath) {
  // 同步读取目录文件内容，使用UTF-8编码
  const content = fs.readFileSync(txtPath, 'utf8');

  // 按换行符分割成行数组，并过滤掉空行
  // split('\n') 将文本按换行符拆分为数组
  // filter(l => l.trim()) 移除空白行（trim()去除首尾空白后为空则过滤）
  const lines = content.split('\n').filter(l => l.trim());

  // 初始化空数组，存储解析后的目录数据
  const toc = [];

  // 章节计数器
  let chapterNum = 0;

  // 遍历每一行，匹配章节标题模式
  for (const line of lines) {
    // 正表达式匹配章节标题格式
    // ^第([一二三四五六七八九十百千零]+)章[：:]\s*(.+)
    //
    // 匹配规则说明：
    // - ^ : 行首开始匹配
    // - 第 : 匹配中文"第"字
    // - ([一二三四五六七八九十百千零]+) : 捕获组1，匹配中文数字（一、二、三...）
    // - 章 : 匹配"章"字
    // - [：:] : 匹配中文冒号或英文冒号
    // - \s* : 匹配零个或多个空白字符
    // - (.+) : 捕获组2，匹配章节标题（剩余所有内容）
    const match = line.match(/^第([一二三四五六七八九十百千零]+)章[：:]\s*(.+)/);

    // 如果匹配成功
    if (match) {
      // 章节序号递增
      chapterNum++;

      // 将解析结果添加到目录数组
      toc.push({
        /** @property {number} number - 章节序号（阿拉伯数字） */
        number: chapterNum,

        /** @property {string} title - 章节标题（不含"第X章："前缀） */
        title: match[2].trim(),

        /** @property {string} line - 原始行内容（完整匹配） */
        line: line.trim()
      });
    }
  }

  // 返回解析后的目录数组
  return toc;
}

/**
 * 主入口函数：解析PDF书籍和目录
 *
 * 这是一个便捷的封装函数，依次执行：
 * 1. 加载PDF
 * 2. 清洗文本
 * 3. 解析目录
 *
 * @param {string} bookPath - PDF书籍文件的路径
 * @param {string} tocPath - 目录文本文件的路径
 * @returns {Promise<Object>} 返回包含解析器和目录的对象
 * @returns {PDFParser} returns.parser - PDFParser实例
 * @returns {Array} returns.toc - 解析后的目录数组
 * @async
 *
 * @example
 * ```javascript
 * const { parser, toc } = await parseBook(
 *   './book.pdf',
 *   './toc.txt'
 * );
 * console.log(`共 ${toc.length} 章`);
 * ```
 */
export async function parseBook(bookPath, tocPath) {
  // 创建PDFParser实例
  const parser = new PDFParser(bookPath);

  // 加载并清洗PDF文本
  await parser.load();
  parser.clean();

  // 解析目录文件
  const toc = parseTOC(tocPath);

  // 输出日志：显示解析到的章节数量
  console.log(`[TOC] 解析目录共 ${toc.length} 章`);

  // 返回解析器和目录，供后续处理使用
  return {
    parser,  // PDFParser实例，可访问rawText、cleanedText等
    toc      // 目录数组
  };
}
