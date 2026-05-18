import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { ensureParentDir } from './fs-utils.js';

function quoteConcatPath(filePath) {
  return `file '${filePath.replace(/'/g, "'\\''")}'`;
}

export function concatAudioFiles(inputPaths, outputPath) {
  if (inputPaths.length === 0) {
    throw new Error('No chapter audio files found to merge.');
  }

  ensureParentDir(outputPath);

  const listPath = path.join(os.tmpdir(), `podcast_concat_${Date.now()}.txt`);
  fs.writeFileSync(listPath, inputPaths.map(quoteConcatPath).join('\n'), 'utf8');

  const ffmpeg = spawnSync('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    outputPath
  ], { encoding: 'utf8' });

  fs.rmSync(listPath, { force: true });

  if (ffmpeg.status === 0) {
    return {
      outputPath,
      method: 'ffmpeg',
      size: fs.statSync(outputPath).size
    };
  }

  const merged = Buffer.concat(inputPaths.map(filePath => fs.readFileSync(filePath)));
  fs.writeFileSync(outputPath, merged);

  return {
    outputPath,
    method: 'binary-concat-fallback',
    warning: 'ffmpeg was not available or failed; MP3 files were concatenated as raw bytes.',
    ffmpegError: ffmpeg.stderr,
    size: merged.length
  };
}
