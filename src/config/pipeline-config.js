import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(configDir, '../..');

export function resolveFromRoot(inputPath) {
  if (!inputPath) return inputPath;
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(rootDir, inputPath);
}

export function createPipelineConfig(env = process.env) {
  const outputDir = env.OUTPUT_DIR || './output';
  const tempDir = env.TEMP_DIR || './temp';

  return {
    rootDir,
    input: {
      bookPath: resolveFromRoot(env.BOOK_PATH || './测试书籍/蛤蟆先生去看心理医生 (（英）罗伯特•戴博德) (z-library.sk, 1lib.sk, z-lib.sk).pdf'),
      reviewsPath: resolveFromRoot(env.REVIEWS_PATH || './测试书籍/相关评论三条.txt'),
      tocPath: resolveFromRoot(env.TOC_PATH || './测试书籍/蛤蟆先生去看心理医生目录.txt')
    },
    voiceMapPath: resolveFromRoot(env.VOICE_MAP_PATH || './src/config/voice_map.json'),
    services: {
      llm: {
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL
      },
      tts: {
        appId: env.VOLCENGINE_APP_ID,
        accessToken: env.VOLCENGINE_ACCESS_TOKEN,
        endpoint: env.VOLCENGINE_TTS_ENDPOINT,
        resourceId: env.VOLCENGINE_RESOURCE_ID,
        appKey: env.VOLCENGINE_APP_KEY
      }
    },
    temp: {
      root: resolveFromRoot(tempDir),
      rawChapters: resolveFromRoot(path.join(tempDir, 'raw_chapters')),
      processed: resolveFromRoot(path.join(tempDir, 'processed')),
      cleanedBook: resolveFromRoot(path.join(tempDir, 'cleaned_book.txt'))
    },
    output: {
      root: resolveFromRoot(outputDir),
      config: resolveFromRoot(path.join(outputDir, 'config')),
      scripts: resolveFromRoot(path.join(outputDir, 'scripts')),
      review: resolveFromRoot(path.join(outputDir, 'review')),
      audio: resolveFromRoot(path.join(outputDir, 'audio')),
      final: resolveFromRoot(path.join(outputDir, 'final')),
      metadata: resolveFromRoot(path.join(outputDir, 'config', 'metadata.json')),
      finalScript: resolveFromRoot(path.join(outputDir, 'scripts', 'final_script.json')),
      finalAudio: resolveFromRoot(path.join(outputDir, 'final', 'podcast_full.mp3')),
      runReport: resolveFromRoot(path.join(outputDir, 'run_report.json'))
    },
    behavior: {
      skipExistingAudio: env.SKIP_EXISTING_AUDIO !== 'false',
      audioRetryDelayMs: Number(env.AUDIO_RETRY_DELAY_MS || 3000)
    }
  };
}

export const pipelineConfig = createPipelineConfig();
