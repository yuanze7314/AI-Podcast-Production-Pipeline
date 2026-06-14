import fs from 'fs';
import path from 'path';
import { ensureParentDir, writeJson } from './fs-utils.js';

const SPEAKER_ALIASES = new Map([
  ['alice', 'Alice'],
  ['\u54aa\u4ed4\u540c\u5b66', 'Alice'],
  ['dr.ye', 'Dr_Ye'],
  ['dr. ye', 'Dr_Ye'],
  ['dr ye', 'Dr_Ye'],
  ['dr_ye', 'Dr_Ye'],
  ['\u53f6\u535a\u58eb', 'Dr_Ye'],
  ['\u5927\u8863\u5148\u751f', 'Dr_Ye']
]);

function speakerPattern() {
  return '(Alice|\\u54aa\\u4ed4\\u540c\\u5b66|Dr\\.?\\s*Ye|Dr_Ye|\\u53f6\\u535a\\u58eb|\\u5927\\u8863\\u5148\\u751f)';
}

export function normalizeSpeaker(speaker) {
  const key = String(speaker || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return SPEAKER_ALIASES.get(key) || String(speaker || '').trim();
}

export function extractCleanScript(scriptContent) {
  if (typeof scriptContent !== 'string') return '';
  const trimmed = scriptContent.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.cleaned_script || parsed.script || parsed.content || trimmed;
    } catch {
      return scriptContent;
    }
  }

  return scriptContent;
}

export function parseScriptToDialogue(scriptContent) {
  const scriptText = extractCleanScript(scriptContent);
  const regex = new RegExp(`^\\s*${speakerPattern()}\\s*[:\\uFF1A]\\s*(.+)$`, 'i');
  const dialogue = [];

  for (const line of scriptText.split(/\r?\n/).filter(item => item.trim())) {
    const match = line.match(regex);
    if (!match) continue;

    dialogue.push({
      speaker: normalizeSpeaker(match[1]),
      text: match[2].trim()
    });
  }

  return dialogue;
}

export function renderDialogueMarkdown(chapter, dialogue) {
  const title = chapter.title ? ` - ${chapter.title}` : '';
  const lines = [`# Chapter ${chapter.chapter}${title}`, ''];

  for (const item of dialogue) {
    lines.push(`**${item.speaker}:** ${item.text}`, '');
  }

  return lines.join('\n');
}

export function parseDialogueMarkdown(content) {
  const regex = new RegExp(`^\\s*\\*\\*${speakerPattern()}\\s*[:\\uFF1A]\\*\\*\\s*(.+)$`, 'i');
  const dialogue = [];

  for (const line of String(content || '').split(/\r?\n/)) {
    const match = line.match(regex);
    if (!match) continue;

    dialogue.push({
      speaker: normalizeSpeaker(match[1]),
      text: match[2].trim()
    });
  }

  return dialogue;
}

export function exportDialogueArtifacts(chapter, outputDir) {
  const dialogue = parseScriptToDialogue(chapter.script);
  const chapterId = String(chapter.chapter).padStart(2, '0');
  const jsonPath = path.join(outputDir, `dialogue_${chapterId}.json`);
  const mdPath = path.join(outputDir, `dialogue_${chapterId}.md`);

  writeJson(jsonPath, {
    chapter: chapter.chapter,
    title: chapter.title || '',
    passed: chapter.passed,
    dialogue
  });

  ensureParentDir(mdPath);
  fs.writeFileSync(mdPath, renderDialogueMarkdown(chapter, dialogue), 'utf8');

  return { chapterId, jsonPath, mdPath, dialogue };
}
