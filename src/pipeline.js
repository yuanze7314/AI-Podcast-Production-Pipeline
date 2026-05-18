import fs from 'fs';
import path from 'path';
import 'dotenv/config';

import { AgentRunner } from './agents/index.js';
import { createPipelineConfig } from './config/pipeline-config.js';
import { LLMClient } from './services/llm-client.js';
import { PodcastTTSClient } from './services/podcast-tts.js';
import { parseBook } from './utils/pdf-parser.js';
import { concatAudioFiles } from './utils/audio.js';
import { ensureDir, listFiles, readJson, writeJson } from './utils/fs-utils.js';
import { exportDialogueArtifacts } from './utils/script-parser.js';

function chapterIdFromFile(fileName, prefix) {
  const match = fileName.match(new RegExp(`^${prefix}_(\\d+)\\.json$`));
  return match?.[1];
}

function normalizeTitle(title) {
  return String(title || '').replace(/\s+/g, '').trim();
}

function isOutputFresh(inputPath, outputPath) {
  if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) return false;
  const inputMtime = fs.statSync(inputPath).mtimeMs;
  const outputMtime = fs.statSync(outputPath).mtimeMs;
  return outputMtime >= inputMtime;
}

function createAbortError() {
  const error = new Error('任务已取消');
  error.name = 'AbortError';
  return error;
}

function splitBookByTOC(text, toc) {
  if (!toc.length) {
    return [{ id: '01', title: 'Full Book', page: 1, text }];
  }

  const normalizedText = text.replace(/\s+/g, '');
  const markers = [];

  for (let i = 0; i < toc.length; i++) {
    const title = normalizeTitle(toc[i].title || toc[i].line);
    if (!title) continue;

    const normalizedIndex = normalizedText.indexOf(title);
    if (normalizedIndex >= 0) {
      const ratio = normalizedIndex / normalizedText.length;
      markers.push({
        index: Math.floor(ratio * text.length),
        tocIndex: i
      });
    }
  }

  if (markers.length < Math.max(2, Math.floor(toc.length / 2))) {
    const avg = Math.floor(text.length / toc.length);
    return toc.map((chapter, index) => ({
      id: String(index + 1).padStart(2, '0'),
      title: chapter.title,
      page: chapter.page || index + 1,
      text: text.slice(index * avg, index === toc.length - 1 ? text.length : (index + 1) * avg).trim()
    }));
  }

  markers.sort((a, b) => a.index - b.index);
  const chapters = [];

  for (let i = 0; i < toc.length; i++) {
    const currentMarker = markers.find(marker => marker.tocIndex === i);
    const nextMarker = markers.find(marker => marker.tocIndex > i);
    const start = currentMarker?.index ?? (i === 0 ? 0 : chapters.at(-1)?.end ?? 0);
    const end = nextMarker?.index ?? text.length;

    chapters.push({
      id: String(i + 1).padStart(2, '0'),
      title: toc[i].title,
      page: toc[i].page || i + 1,
      text: text.slice(start, end).trim(),
      end
    });
  }

  return chapters.map(({ end, ...chapter }) => chapter);
}

export class PodcastPipeline {
  constructor(config = createPipelineConfig(), options = {}) {
    this.config = config;
    this.abortSignal = options.signal || null;
    this.onProgress = options.onProgress || (() => {});
    this.agentRunner = new AgentRunner({
      llm: new LLMClient({
        ...(this.config.services?.llm || {}),
        signal: this.abortSignal
      })
    });
  }

  checkAbort() {
    if (this.abortSignal?.aborted) throw createAbortError();
  }

  sleep(ms) {
    if (!ms) return Promise.resolve();
    this.checkAbort();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(createAbortError());
      };

      this.abortSignal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  progress(percent, message, detail = {}) {
    this.checkAbort();
    this.onProgress({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      message,
      detail,
      updatedAt: new Date().toISOString()
    });
  }

  ensureWorkspace() {
    this.checkAbort();
    [
      this.config.temp.root,
      this.config.temp.rawChapters,
      this.config.temp.processed,
      this.config.output.config,
      this.config.output.scripts,
      this.config.output.review,
      this.config.output.audio,
      this.config.output.final
    ].forEach(ensureDir);
  }

  writeReport(update) {
    const current = fs.existsSync(this.config.output.runReport)
      ? readJson(this.config.output.runReport)
      : {};

    writeJson(this.config.output.runReport, {
      ...current,
      ...update,
      updatedAt: new Date().toISOString()
    });
  }

  async runPhase1() {
    this.checkAbort();
    this.ensureWorkspace();
    const startedAt = Date.now();

    console.log('\n========== Phase 1: extract and mine chapters ==========\n');
    this.progress(5, '分析读者评论并生成播客元数据');
    const metadata = await this.agentRunner.runToneAnalyst(
      this.config.input.reviewsPath,
      this.config.output.metadata
    );
    this.checkAbort();

    this.progress(15, '解析 PDF 和目录');
    const { parser, toc } = await parseBook(this.config.input.bookPath, this.config.input.tocPath);
    this.checkAbort();
    parser.exportCleanedText(this.config.temp.cleanedBook);

    const chapters = splitBookByTOC(parser.cleanedText, toc);
    const chapterResults = [];
    const total = chapters.length || 1;

    for (const chapter of chapters) {
      this.checkAbort();
      const chapterIndex = Number(chapter.id) || 1;
      this.progress(15 + ((chapterIndex - 1) / total) * 80, `提炼第 ${chapter.id} 章：${chapter.title || ''}`, {
        chapter: chapter.id,
        total
      });
      const rawPath = path.join(this.config.temp.rawChapters, `raw_ch${chapter.id}.txt`);
      fs.writeFileSync(rawPath, chapter.text, 'utf8');
      console.log(`[Phase1] Chapter ${chapter.id}: ${chapter.title} (${chapter.text.length} chars)`);

      const outputPath = path.join(this.config.temp.processed, `chapter_${chapter.id}.json`);
      const result = await this.agentRunner.runChapterMiner(
        this.config.output.metadata,
        chapter.text,
        chapter.id,
        outputPath
      );
      this.checkAbort();
      writeJson(outputPath, {
        chapter_id: chapter.id,
        title: chapter.title,
        text_length: chapter.text.length,
        ...result
      });

      chapterResults.push({ chapterId: chapter.id, title: chapter.title, outputPath, result });
    }

    this.writeReport({
      phase1: {
        metadata,
        chapterCount: chapters.length,
        durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1))
      }
    });

    this.progress(100, 'Phase 1 完成');
    return { metadataPath: this.config.output.metadata, chapterResults };
  }

  async runPhase2() {
    this.checkAbort();
    this.ensureWorkspace();
    const startedAt = Date.now();

    if (!fs.existsSync(this.config.output.metadata)) {
      throw new Error('metadata.json not found. Run phase1 first.');
    }

    console.log('\n========== Phase 2: write, polish, and review scripts ==========\n');
    const chapterFiles = listFiles(
      this.config.temp.processed,
      file => file.startsWith('chapter_') && file.endsWith('.json')
    );

    const chapters = [];
    const total = chapterFiles.length || 1;

    for (let index = 0; index < chapterFiles.length; index++) {
      this.checkAbort();
      const file = chapterFiles[index];
      const chapterId = chapterIdFromFile(file, 'chapter');
      const chapterPath = path.join(this.config.temp.processed, file);
      const chapterData = readJson(chapterPath);
      const scriptPath = path.join(this.config.output.scripts, `script_${chapterId}.json`);
      const polishedPath = path.join(this.config.output.scripts, `polished_${chapterId}.txt`);
      const finalPath = path.join(this.config.output.scripts, `final_${chapterId}.json`);

      console.log(`[Phase2] Chapter ${chapterId}`);
      let checkResult;
      if (fs.existsSync(finalPath)) {
        this.progress((index / total) * 100, `跳过第 ${chapterId} 章，已存在审核结果`, { chapter: chapterId, total });
        checkResult = readJson(finalPath);
      } else {
        if (!fs.existsSync(scriptPath)) {
          this.progress((index / total) * 100, `生成第 ${chapterId} 章初稿`, { chapter: chapterId, total });
          await this.agentRunner.runScreenwriter(this.config.output.metadata, chapterPath, scriptPath);
          this.checkAbort();
        }
        if (!fs.existsSync(polishedPath)) {
          this.progress(((index + 0.35) / total) * 100, `润色第 ${chapterId} 章`, { chapter: chapterId, total });
          await this.agentRunner.runDirector(scriptPath, polishedPath);
          this.checkAbort();
        }
        this.progress(((index + 0.7) / total) * 100, `审核第 ${chapterId} 章`, { chapter: chapterId, total });
        checkResult = await this.agentRunner.runCensor(polishedPath, finalPath);
        this.checkAbort();
      }

      chapters.push({
        chapter: chapterId,
        title: chapterData.title || '',
        passed: Boolean(checkResult.passed),
        script: checkResult.cleaned_script || fs.readFileSync(polishedPath, 'utf8'),
        safety_issues: checkResult.safety_issues || [],
        quality_issues: checkResult.quality_issues || []
      });
    }

    const finalScript = {
      title: 'AI Podcast',
      generatedAt: new Date().toISOString(),
      chapters
    };

    writeJson(this.config.output.finalScript, finalScript);
    writeJson(path.join(this.config.output.final, 'final_script.json'), finalScript);

    const review = this.prepareReviewArtifacts(finalScript);

    this.writeReport({
      phase2: {
        chapterCount: chapters.length,
        reviewIndex: review.reviewIndexPath,
        durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1))
      }
    });

    this.progress(100, 'Phase 2 完成');
    return { finalScriptPath: this.config.output.finalScript, review };
  }

  prepareReviewArtifacts(script = readJson(this.config.output.finalScript)) {
    this.checkAbort();
    this.ensureWorkspace();
    this.progress(10, '导出审阅文本');
    const artifacts = script.chapters.map(chapter => exportDialogueArtifacts(chapter, this.config.output.review));
    const reviewIndexPath = path.join(this.config.output.review, 'dialogue_review.md');
    const content = [
      `# ${script.title || 'AI Podcast'} Dialogue Review`,
      '',
      `Generated at: ${script.generatedAt || new Date().toISOString()}`,
      ''
    ];

    for (const artifact of artifacts) {
      content.push(`- Chapter ${artifact.chapterId}: ${path.basename(artifact.mdPath)} (${artifact.dialogue.length} turns)`);
    }

    fs.writeFileSync(reviewIndexPath, `${content.join('\n')}\n`, 'utf8');
    console.log(`[Review] Dialogue files written to ${this.config.output.review}`);

    this.progress(100, '审阅文本已导出');
    return { reviewIndexPath, artifacts };
  }

  async runSingleChapter(chapterNumber, options = {}) {
    this.checkAbort();
    this.ensureWorkspace();
    const id = String(chapterNumber).padStart(2, '0');
    const index = Number(chapterNumber) - 1;

    this.progress(5, `准备第 ${id} 章`);
    if (!fs.existsSync(this.config.output.metadata)) {
      this.progress(10, '分析读者评论并生成播客元数据');
      await this.agentRunner.runToneAnalyst(this.config.input.reviewsPath, this.config.output.metadata);
      this.checkAbort();
    }

    this.progress(20, '解析 PDF 和目录');
    const { parser, toc } = await parseBook(this.config.input.bookPath, this.config.input.tocPath);
    this.checkAbort();
    parser.exportCleanedText(this.config.temp.cleanedBook);
    const chapters = splitBookByTOC(parser.cleanedText, toc);
    const chapter = chapters[index];
    if (!chapter) {
      throw new Error(`Chapter ${chapterNumber} not found. TOC has ${chapters.length} chapters.`);
    }

    const rawPath = path.join(this.config.temp.rawChapters, `raw_ch${id}.txt`);
    fs.writeFileSync(rawPath, chapter.text, 'utf8');

    this.progress(35, `提炼第 ${id} 章：${chapter.title || ''}`, { chapter: id });
    const processedPath = path.join(this.config.temp.processed, `chapter_${id}.json`);
    const mined = await this.agentRunner.runChapterMiner(this.config.output.metadata, chapter.text, id, processedPath);
    this.checkAbort();
    writeJson(processedPath, {
      chapter_id: id,
      title: chapter.title,
      text_length: chapter.text.length,
      ...mined
    });

    const scriptPath = path.join(this.config.output.scripts, `script_${id}.json`);
    const polishedPath = path.join(this.config.output.scripts, `polished_${id}.txt`);
    const finalPath = path.join(this.config.output.scripts, `final_${id}.json`);

    this.progress(55, `生成第 ${id} 章初稿`, { chapter: id });
    await this.agentRunner.runScreenwriter(this.config.output.metadata, processedPath, scriptPath);
    this.checkAbort();
    this.progress(68, `润色第 ${id} 章`, { chapter: id });
    await this.agentRunner.runDirector(scriptPath, polishedPath);
    this.checkAbort();
    this.progress(78, `审核第 ${id} 章`, { chapter: id });
    const checkResult = await this.agentRunner.runCensor(polishedPath, finalPath);
    this.checkAbort();

    const chapterScript = {
      chapter: id,
      title: chapter.title || '',
      passed: Boolean(checkResult.passed),
      script: checkResult.cleaned_script || fs.readFileSync(polishedPath, 'utf8'),
      safety_issues: checkResult.safety_issues || [],
      quality_issues: checkResult.quality_issues || []
    };

    const finalScript = fs.existsSync(this.config.output.finalScript)
      ? readJson(this.config.output.finalScript)
      : { title: 'AI Podcast', generatedAt: new Date().toISOString(), chapters: [] };
    finalScript.chapters = [
      ...finalScript.chapters.filter(item => String(item.chapter).padStart(2, '0') !== id),
      chapterScript
    ].sort((a, b) => Number(a.chapter) - Number(b.chapter));
    finalScript.generatedAt = new Date().toISOString();
    writeJson(this.config.output.finalScript, finalScript);
    writeJson(path.join(this.config.output.final, 'final_script.json'), finalScript);

    this.progress(88, `导出第 ${id} 章审阅稿`, { chapter: id });
    const review = exportDialogueArtifacts(chapterScript, this.config.output.review);

    let audio = null;
    if (options.audio !== false) {
      this.progress(92, `生成第 ${id} 章音频`, { chapter: id });
      audio = await this.generateChapterAudio(id);
    }

    this.writeReport({
      singleChapter: {
        chapter: id,
        title: chapter.title || '',
        review: review.mdPath,
        audio: audio?.outputPath || null,
        updatedAt: new Date().toISOString()
      }
    });
    this.progress(100, `第 ${id} 章完成`, { chapter: id });
    return { chapter: id, review, audio };
  }

  async generateChapterAudio(chapterId) {
    this.checkAbort();
    this.ensureWorkspace();
    const id = String(chapterId).padStart(2, '0');
    const dialoguePath = path.join(this.config.output.review, `dialogue_${id}.json`);
    const outputPath = path.join(this.config.output.audio, `podcast_ch${id}.mp3`);

    if (!fs.existsSync(dialoguePath)) {
      this.prepareReviewArtifacts();
    }

    if (this.config.behavior.skipExistingAudio && isOutputFresh(dialoguePath, outputPath)) {
      console.log(`[Audio] Chapter ${id} already exists and is up to date, skipped.`);
      return { chapterId: id, skipped: true, outputPath };
    }

    console.log(`[Audio] Generating chapter ${id}`);
    this.progress(20, `生成第 ${id} 章音频`, { chapter: id });
    const ttsClient = new PodcastTTSClient(this.config.services?.tts || {});
    const result = await ttsClient.generatePodcast(
      dialoguePath,
      this.config.voiceMapPath,
      outputPath,
      { signal: this.abortSignal }
    );
    this.checkAbort();

    this.progress(100, `第 ${id} 章音频完成`, { chapter: id });
    return { chapterId: id, ...result };
  }

  async generateAllAudio() {
    this.checkAbort();
    this.ensureWorkspace();

    if (!fs.existsSync(this.config.output.finalScript)) {
      throw new Error('final_script.json not found. Run phase2 first.');
    }

    const hasDialogueJson = listFiles(this.config.output.review, file => /^dialogue_\d+\.json$/.test(file)).length > 0;
    if (!hasDialogueJson) {
      this.prepareReviewArtifacts();
    }
    const script = readJson(this.config.output.finalScript);
    const results = [];
    const total = script.chapters.length || 1;

    for (let index = 0; index < script.chapters.length; index++) {
      this.checkAbort();
      const chapter = script.chapters[index];
      this.progress((index / total) * 100, `生成第 ${chapter.chapter} 章音频`, {
        chapter: chapter.chapter,
        total
      });
      const result = await this.generateChapterAudio(chapter.chapter);
      results.push(result);

      if (!result.skipped && this.config.behavior.audioRetryDelayMs > 0) {
        await this.sleep(this.config.behavior.audioRetryDelayMs);
      }
    }

    this.writeReport({ audio: { results } });
    this.progress(100, '全部分章音频完成');
    return results;
  }

  mergeAudio() {
    this.checkAbort();
    this.ensureWorkspace();
    const files = listFiles(this.config.output.audio, file => /^podcast_ch\d+\.mp3$/.test(file))
      .map(file => path.join(this.config.output.audio, file));
    this.progress(30, '合成完整音频');
    const result = concatAudioFiles(files, this.config.output.finalAudio);

    this.writeReport({ finalAudio: result });
    console.log(`[Merge] Final audio written to ${result.outputPath}`);
    this.progress(100, '完整音频合成完成');
    return result;
  }

  status() {
    const chapterFiles = listFiles(this.config.temp.processed, file => file.startsWith('chapter_'));
    const reviewFiles = listFiles(this.config.output.review, file => file.startsWith('dialogue_') && file.endsWith('.md'));
    const audioFiles = listFiles(this.config.output.audio, file => file.endsWith('.mp3'));

    return {
      metadata: fs.existsSync(this.config.output.metadata),
      finalScript: fs.existsSync(this.config.output.finalScript),
      reviewIndex: fs.existsSync(path.join(this.config.output.review, 'dialogue_review.md')),
      finalAudio: fs.existsSync(this.config.output.finalAudio),
      counts: {
        minedChapters: chapterFiles.length,
        reviewDialogues: reviewFiles.length,
        chapterAudio: audioFiles.length
      },
      paths: {
        review: this.config.output.review,
        chapterAudio: this.config.output.audio,
        finalAudio: this.config.output.finalAudio
      }
    };
  }
}

export const podcastPipeline = new PodcastPipeline();
