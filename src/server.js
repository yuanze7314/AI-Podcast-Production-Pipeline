import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { PodcastPipeline } from './pipeline.js';
import { createPipelineConfig } from './config/pipeline-config.js';
import { ensureDir, readJson, writeJson, listFiles } from './utils/fs-utils.js';
import { parseTOC } from './utils/pdf-parser.js';
import { parseDialogueMarkdown } from './utils/script-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'web');
const projectsDir = path.join(rootDir, 'projects');
const jobs = new Map();
const jobControllers = new Map();

ensureDir(projectsDir);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendText(res, 404, 'Not found');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function isPathInside(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function forbidden(message = 'Forbidden') {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function slugify(input) {
  const value = String(input || '').trim().toLowerCase();
  const slug = value
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `project-${Date.now()}`;
}

function projectPath(projectId) {
  const dir = path.resolve(projectsDir, projectId);
  if (!isPathInside(projectsDir, dir)) throw forbidden('Invalid project id.');
  return path.join(dir, 'project.json');
}

function requireProject(projectId) {
  const filePath = projectPath(projectId);
  if (!fs.existsSync(filePath)) {
    const error = new Error(`Project not found: ${projectId}`);
    error.statusCode = 404;
    throw error;
  }
  return readJson(filePath);
}

function deleteProject(projectId) {
  const dir = path.resolve(projectsDir, projectId);
  if (!isPathInside(projectsDir, dir) || !fs.existsSync(projectPath(projectId))) {
    const error = new Error(`Project not found: ${projectId}`);
    error.statusCode = 404;
    throw error;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  jobs.delete(projectId);
  jobControllers.delete(projectId);
}

function projectConfig(project) {
  const projectRoot = path.join(projectsDir, project.id);
  return createPipelineConfig({
    ...process.env,
    BOOK_PATH: project.bookPath,
    REVIEWS_PATH: project.reviewsPath,
    TOC_PATH: project.tocPath,
    OPENAI_API_KEY: project.openaiApiKey || process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: project.openaiBaseUrl || process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: project.openaiModel || process.env.OPENAI_MODEL,
    VOICE_MAP_PATH: project.voiceMapPath || process.env.VOICE_MAP_PATH || './src/config/voice_map.json',
    VOLCENGINE_APP_ID: project.volcengineAppId || process.env.VOLCENGINE_APP_ID,
    VOLCENGINE_ACCESS_TOKEN: project.volcengineAccessToken || process.env.VOLCENGINE_ACCESS_TOKEN,
    VOLCENGINE_TTS_ENDPOINT: project.volcengineTtsEndpoint || process.env.VOLCENGINE_TTS_ENDPOINT,
    VOLCENGINE_RESOURCE_ID: project.volcengineResourceId || process.env.VOLCENGINE_RESOURCE_ID,
    VOLCENGINE_APP_KEY: project.volcengineAppKey || process.env.VOLCENGINE_APP_KEY,
    OUTPUT_DIR: path.join(projectRoot, 'output'),
    TEMP_DIR: path.join(projectRoot, 'temp'),
    SKIP_EXISTING_AUDIO: String(project.skipExistingAudio ?? true),
    AUDIO_RETRY_DELAY_MS: String(project.audioRetryDelayMs ?? 3000)
  });
}

function pipelineFor(project) {
  return new PodcastPipeline(projectConfig(project));
}

function reviewFileName(chapterId) {
  return `dialogue_${String(chapterId).padStart(2, '0')}.md`;
}

function chapterAudioFileName(chapterId) {
  return `podcast_ch${String(chapterId).padStart(2, '0')}.mp3`;
}

function outputAssetUrl(project, config, filePath) {
  if (!fs.existsSync(filePath)) return null;
  const relativePath = path.relative(config.output.root, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return `/api/projects/${encodeURIComponent(project.id)}/assets/${relativePath}?mtime=${Math.round(fs.statSync(filePath).mtimeMs)}`;
}

function isOutputFresh(inputPath, outputPath) {
  if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) return false;
  return fs.statSync(outputPath).mtimeMs >= fs.statSync(inputPath).mtimeMs;
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.message === '任务已取消';
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function listProjects() {
  return listFiles(projectsDir, name => fs.existsSync(path.join(projectsDir, name, 'project.json')))
    .map(projectId => {
      const project = readJson(projectPath(projectId));
      return {
        ...publicProject(project),
        status: pipelineFor(project).status(),
        job: jobs.get(project.id) || null
      };
    });
}

function publicProject(project) {
  return {
    ...project,
    openaiApiKey: project.openaiApiKey ? '********' : '',
    volcengineAccessToken: project.volcengineAccessToken ? '********' : '',
    volcengineAppKey: project.volcengineAppKey ? '********' : ''
  };
}

function saveProject(input, existingId = null) {
  const id = existingId || slugify(input.name);
  const now = new Date().toISOString();
  const current = existingId && fs.existsSync(projectPath(existingId)) ? readJson(projectPath(existingId)) : {};
  const project = {
    id,
    name: input.name || current.name || id,
    bookPath: input.bookPath || current.bookPath || '',
    reviewsPath: input.reviewsPath || current.reviewsPath || '',
    tocPath: input.tocPath || current.tocPath || '',
    voiceMapPath: input.voiceMapPath || current.voiceMapPath || './src/config/voice_map.json',
    openaiApiKey: input.openaiApiKey && input.openaiApiKey !== '********'
      ? input.openaiApiKey
      : current.openaiApiKey ?? '',
    openaiBaseUrl: input.openaiBaseUrl ?? current.openaiBaseUrl ?? '',
    openaiModel: input.openaiModel ?? current.openaiModel ?? '',
    volcengineAppId: input.volcengineAppId ?? current.volcengineAppId ?? '',
    volcengineAccessToken: input.volcengineAccessToken && input.volcengineAccessToken !== '********'
      ? input.volcengineAccessToken
      : current.volcengineAccessToken ?? '',
    volcengineTtsEndpoint: input.volcengineTtsEndpoint ?? current.volcengineTtsEndpoint ?? '',
    volcengineResourceId: input.volcengineResourceId ?? current.volcengineResourceId ?? '',
    volcengineAppKey: input.volcengineAppKey && input.volcengineAppKey !== '********'
      ? input.volcengineAppKey
      : current.volcengineAppKey ?? '',
    skipExistingAudio: input.skipExistingAudio ?? current.skipExistingAudio ?? true,
    audioRetryDelayMs: Number(input.audioRetryDelayMs ?? current.audioRetryDelayMs ?? 3000),
    createdAt: current.createdAt || now,
    updatedAt: now
  };

  writeJson(projectPath(id), project);
  return project;
}

function startJob(project, stage, chapter = null) {
  const current = jobs.get(project.id);
  if (current?.status === 'running' || current?.status === 'canceling') {
    const error = new Error('A job is already running for this project.');
    error.statusCode = 409;
    throw error;
  }

  const controller = new AbortController();
  const job = {
    id: `${project.id}-${Date.now()}`,
    projectId: project.id,
    stage,
    chapter,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    cancelRequestedAt: null
  };
  jobs.set(project.id, job);
  jobControllers.set(project.id, controller);

  const updateProgress = progress => {
    const latest = jobs.get(project.id) || job;
    if (latest.status === 'canceling') {
      jobs.set(project.id, {
        ...latest,
        progress: {
          ...progress,
          message: '正在终止任务...',
          updatedAt: new Date().toISOString()
        }
      });
      return;
    }
    jobs.set(project.id, { ...latest, progress });
  };
  const pipeline = new PodcastPipeline(projectConfig(project), {
    onProgress: updateProgress,
    signal: controller.signal
  });
  Promise.resolve()
    .then(async () => {
      if (stage === 'phase1') return pipeline.runPhase1();
      if (stage === 'phase2') return pipeline.runPhase2();
      if (stage === 'review') return pipeline.prepareReviewArtifacts();
      if (stage === 'audio') return chapter ? pipeline.generateChapterAudio(chapter) : pipeline.generateAllAudio();
      if (stage === 'chapter') return pipeline.runSingleChapter(chapter || 1);
      if (stage === 'remix') {
        if (chapter) await pipeline.generateChapterAudio(chapter);
        return pipeline.mergeAudio();
      }
      if (stage === 'merge') return pipeline.mergeAudio();
      if (stage === 'all') {
        await pipeline.runPhase1();
        await pipeline.runPhase2();
        await pipeline.generateAllAudio();
        return pipeline.mergeAudio();
      }
      throw new Error(`Unknown stage: ${stage}`);
    })
    .then(result => {
      const latest = jobs.get(project.id) || job;
      if (controller.signal.aborted || latest.status === 'canceling') {
        jobs.set(project.id, {
          ...latest,
          status: 'canceled',
          finishedAt: new Date().toISOString(),
          error: null,
          result: null,
          progress: {
            percent: latest.progress?.percent || 0,
            message: '任务已取消',
            updatedAt: new Date().toISOString()
          }
        });
        return;
      }
      jobs.set(project.id, {
        ...latest,
        status: 'completed',
        finishedAt: new Date().toISOString(),
        result
      });
    })
    .catch(error => {
      const latest = jobs.get(project.id) || job;
      const aborted = controller.signal.aborted || isAbortError(error);
      jobs.set(project.id, {
        ...latest,
        status: aborted ? 'canceled' : 'failed',
        finishedAt: new Date().toISOString(),
        error: aborted ? null : error.message,
        progress: aborted
          ? {
              percent: latest.progress?.percent || 0,
              message: '任务已取消',
              updatedAt: new Date().toISOString()
            }
          : latest.progress
      });
    })
    .finally(() => {
      jobControllers.delete(project.id);
    });

  return job;
}

function cancelJob(projectId) {
  const current = jobs.get(projectId);
  if (!current || (current.status !== 'running' && current.status !== 'canceling')) {
    const error = new Error('No running job to cancel.');
    error.statusCode = 409;
    throw error;
  }

  const updated = {
    ...current,
    status: 'canceling',
    cancelRequestedAt: current.cancelRequestedAt || new Date().toISOString(),
    progress: {
      percent: current.progress?.percent || 0,
      message: '正在终止任务...',
      updatedAt: new Date().toISOString()
    }
  };
  jobs.set(projectId, updated);
  jobControllers.get(projectId)?.abort();
  return updated;
}

function reviewFiles(project) {
  const config = projectConfig(project);
  return listFiles(config.output.review, file => /^dialogue_\d+\.md$/.test(file))
    .map(file => {
      const filePath = path.join(config.output.review, file);
      return {
        name: file,
        path: filePath,
        content: fs.readFileSync(filePath, 'utf8')
      };
    });
}

function chapterList(project) {
  const config = projectConfig(project);
  const toc = fs.existsSync(config.input.tocPath) ? parseTOC(config.input.tocPath) : [];
  return toc.map((chapter, index) => {
    const id = String(index + 1).padStart(2, '0');
    const reviewPath = path.join(config.output.review, reviewFileName(id));
    const reviewJsonPath = path.join(config.output.review, `dialogue_${id}.json`);
    const audioPath = path.join(config.output.audio, chapterAudioFileName(id));
    return {
      id,
      title: chapter.title,
      line: chapter.line,
      mined: fs.existsSync(path.join(config.temp.processed, `chapter_${id}.json`)),
      review: fs.existsSync(reviewPath),
      audio: fs.existsSync(audioPath),
      audioStale: fs.existsSync(reviewJsonPath) && fs.existsSync(audioPath) && !isOutputFresh(reviewJsonPath, audioPath),
      reviewFile: reviewFileName(id),
      reviewPath,
      audioPath,
      audioUrl: outputAssetUrl(project, config, audioPath),
      audioMtime: fs.existsSync(audioPath) ? fs.statSync(audioPath).mtimeMs : null
    };
  });
}

function chapterDetail(project, chapterId) {
  const id = String(chapterId).padStart(2, '0');
  const chapter = chapterList(project).find(item => item.id === id);
  if (!chapter) {
    const error = new Error(`Chapter ${id} not found in TOC.`);
    error.statusCode = 404;
    throw error;
  }

  const config = projectConfig(project);
  const reviewPath = path.join(config.output.review, reviewFileName(id));
  const content = fs.existsSync(reviewPath)
    ? fs.readFileSync(reviewPath, 'utf8')
    : `# Chapter ${id}${chapter.title ? ` - ${chapter.title}` : ''}\n\n`;

  return {
    ...chapter,
    content
  };
}

function saveReviewFile(project, fileName, content) {
  if (!/^dialogue_\d+\.md$/.test(fileName)) {
    const error = new Error('Only dialogue_XX.md review files can be saved.');
    error.statusCode = 400;
    throw error;
  }

  const config = projectConfig(project);
  const mdPath = path.join(config.output.review, fileName);
  const chapterId = fileName.match(/dialogue_(\d+)\.md/)[1];
  const dialogue = parseDialogueMarkdown(content);

  fs.writeFileSync(mdPath, content, 'utf8');
  writeJson(path.join(config.output.review, `dialogue_${chapterId}.json`), {
    chapter: chapterId,
    dialogue
  });

  return { name: fileName, path: mdPath, turns: dialogue.length };
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));

  if (req.method === 'GET' && url.pathname === '/api/projects') {
    return sendJson(res, 200, { projects: listProjects() });
  }

  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const input = await readRequestJson(req);
    const project = saveProject(input);
    return sendJson(res, 201, { project: publicProject(project), status: pipelineFor(project).status() });
  }

  if (parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
    const projectId = parts[2];
    const project = requireProject(projectId);

    if (req.method === 'GET' && parts.length === 3) {
      return sendJson(res, 200, { project: publicProject(project), status: pipelineFor(project).status(), job: jobs.get(project.id) || null });
    }

    if (req.method === 'PUT' && parts.length === 3) {
      const input = await readRequestJson(req);
      const updated = saveProject(input, projectId);
      return sendJson(res, 200, { project: publicProject(updated), status: pipelineFor(updated).status() });
    }

    if (req.method === 'DELETE' && parts.length === 3) {
      deleteProject(projectId);
      return sendJson(res, 200, { deleted: true });
    }

    if (req.method === 'POST' && parts[3] === 'run') {
      const input = await readRequestJson(req);
      const job = startJob(project, input.stage, input.chapter);
      return sendJson(res, 202, { job });
    }

    if (req.method === 'POST' && parts[3] === 'cancel') {
      return sendJson(res, 202, { job: cancelJob(project.id) });
    }

    if (req.method === 'GET' && parts[3] === 'assets') {
      const config = projectConfig(project);
      const assetPath = path.resolve(config.output.root, ...parts.slice(4));
      const outputRoot = path.resolve(config.output.root);
      if (!isPathInside(outputRoot, assetPath)) {
        return sendText(res, 403, 'Forbidden');
      }
      return sendFile(res, assetPath);
    }

    if (req.method === 'GET' && parts[3] === 'review') {
      return sendJson(res, 200, { files: reviewFiles(project) });
    }

    if (req.method === 'PUT' && parts[3] === 'review' && parts[4]) {
      const input = await readRequestJson(req);
      return sendJson(res, 200, { file: saveReviewFile(project, parts[4], input.content || '') });
    }

    if (req.method === 'GET' && parts[3] === 'chapters' && parts.length === 4) {
      return sendJson(res, 200, { chapters: chapterList(project) });
    }

    if (req.method === 'GET' && parts[3] === 'chapters' && parts[4] && parts.length === 5) {
      return sendJson(res, 200, { chapter: chapterDetail(project, parts[4]) });
    }

    if (req.method === 'PUT' && parts[3] === 'chapters' && parts[4] && parts[5] === 'review') {
      const input = await readRequestJson(req);
      return sendJson(res, 200, { file: saveReviewFile(project, reviewFileName(parts[4]), input.content || '') });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(publicDir, `.${pathname}`);

  if (!isPathInside(publicDir, filePath)) {
    return sendText(res, 403, 'Forbidden');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendText(res, 404, 'Not found');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message });
  }
});

const port = Number(process.env.UI_PORT || 4317);
server.listen(port, () => {
  console.log(`AI Podcast Studio is running at http://localhost:${port}`);
});
