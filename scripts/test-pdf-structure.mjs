import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdf = require("E:/codex/AI-Podcast-Production-Pipeline/node_modules/pdf-parse");

const pdfPath =
  "E:/codex/AI-Podcast-Production-Pipeline/测试书籍/蛤蟆先生去看心理医生 (（英）罗伯特•戴博德) (z-library.sk, 1lib.sk, z-lib.sk).pdf";

const pages = [];

const chapterRe = /^第[一二三四五六七八九十百零〇0-9]+章[:：]?$/;
const chapterFullRe = /^第[一二三四五六七八九十百零〇0-9]+章[:：]\s*(.+)$/;

function normalize(text) {
  return text.replace(/[\s，,。．.：:;；、'‘’“”"《》<>（）()[\]【】]/g, "");
}

function chapterNumber(text) {
  const match = text.match(/^第(.+?)章/);
  if (!match) return null;
  const raw = match[1];
  const map = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === "十") return 10;
  if (raw.startsWith("十")) return 10 + (map[raw[1]] || 0);
  if (raw.includes("十")) {
    const [tens, ones] = raw.split("十");
    return (map[tens] || 1) * 10 + (map[ones] || 0);
  }
  return map[raw] || null;
}

function pageLines(pageText) {
  return pageText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function pushUniqueByChapter(list, hit) {
  if (!hit.chapter) return;
  if (!list.find((item) => item.chapter === hit.chapter)) {
    list.push(hit);
  }
}

function detectChapterHits() {
  const toc = [];
  const body = [];

  pages.forEach((pageText, pageIndex) => {
    const lines = pageLines(pageText);
    const page = pageIndex + 1;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const full = line.match(chapterFullRe);
      const isTocPage = page <= 6;

      if (full) {
        const hit = {
          chapter: chapterNumber(line),
          title: full[1].trim(),
          page,
          line: lineIndex,
          raw: line,
          source: isTocPage ? "toc" : "body",
        };
        pushUniqueByChapter(isTocPage ? toc : body, hit);
        continue;
      }

      if (chapterRe.test(line)) {
        const title = lines[lineIndex + 1] || "";
        const hit = {
          chapter: chapterNumber(line),
          title,
          page,
          line: lineIndex,
          raw: `${line} ${title}`.trim(),
          source: isTocPage ? "toc" : "body",
        };
        pushUniqueByChapter(isTocPage ? toc : body, hit);
      }
    }
  });

  return { toc, body };
}

function inferMissingBodyStarts(toc, body) {
  const inferred = [];

  for (const tocHit of toc) {
    if (body.find((hit) => hit.chapter === tocHit.chapter)) continue;

    const prev = body
      .filter((hit) => hit.chapter < tocHit.chapter)
      .sort((a, b) => b.chapter - a.chapter)[0];
    const next = body
      .filter((hit) => hit.chapter > tocHit.chapter)
      .sort((a, b) => a.chapter - b.chapter)[0];

    const startPage = prev?.page || 1;
    const endPage = next?.page || pages.length;
    const expectedTitle = normalize(tocHit.title);

    let best = null;
    for (let page = startPage; page <= endPage; page += 1) {
      const lines = pageLines(pages[page - 1]);
      const earlyLines = lines.slice(0, 10);
      for (let lineIndex = 0; lineIndex < earlyLines.length; lineIndex += 1) {
        const normalizedLine = normalize(earlyLines[lineIndex]);
        if (
          normalizedLine &&
          (normalizedLine.includes(expectedTitle) ||
            expectedTitle.includes(normalizedLine))
        ) {
          best = {
            chapter: tocHit.chapter,
            title: tocHit.title,
            page,
            line: lineIndex,
            raw: earlyLines[lineIndex],
            source: "inferred_title_match",
            confidence: 0.72,
          };
          break;
        }
      }
      if (best) break;
    }

    if (best) inferred.push(best);
  }

  return inferred;
}

function buildChapters(toc, body, inferred) {
  const starts = [
    ...body.map((hit) => {
      const tocHit = toc.find((item) => item.chapter === hit.chapter);
      return {
        ...hit,
        confidence: hit.title === tocHit?.title ? 0.95 : 0.85,
      };
    }),
    ...inferred,
  ].sort((a, b) => a.chapter - b.chapter);

  return starts.map((start, index) => {
    const next = starts[index + 1];
    const tocHit = toc.find((item) => item.chapter === start.chapter);
    const title = tocHit?.title || start.title;
    const endPage = next ? next.page - 1 : pages.length;
    const text = pages.slice(start.page - 1, endPage).join("\n");

    return {
      chapter: start.chapter,
      title,
      startPage: start.page,
      endPage,
      source: start.source,
      rawBodyTitle: start.raw,
      confidence: start.confidence || 0.8,
      charsNoWhitespace: text.replace(/\s/g, "").length,
      preview: text.replace(/\s+/g, "").slice(0, 120),
    };
  });
}

const pagerender = async (pageData) => {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: false,
    disableCombineTextItems: false,
  });
  const text = textContent.items.map((item) => item.str).join("\n");
  pages.push(text);
  return `${text}\n`;
};

const data = await pdf(fs.readFileSync(pdfPath), { pagerender });
const { toc, body } = detectChapterHits();
const inferred = inferMissingBodyStarts(toc, body);
const chapters = buildChapters(toc, body, inferred);

const result = {
  file: pdfPath,
  pages: data.numpages,
  totalChars: data.text.length,
  toc,
  body,
  inferred,
  chapters,
};

const outputDir = path.resolve("test-output");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "pdf-structure-test.json"),
  JSON.stringify(result, null, 2),
  "utf8",
);

const markdown = [
  "# PDF Structure Test",
  "",
  `- File: ${pdfPath}`,
  `- Pages: ${data.numpages}`,
  `- Extracted chars: ${data.text.length}`,
  `- TOC chapter candidates: ${toc.length}`,
  `- Body chapter candidates: ${body.length}`,
  `- Inferred body starts: ${inferred.length}`,
  "",
  "## Chapters",
  "",
  "| Chapter | Title | Pages | Source | Confidence | Chars |",
  "|---:|---|---:|---|---:|---:|",
  ...chapters.map(
    (chapter) =>
      `| ${chapter.chapter} | ${chapter.title} | ${chapter.startPage}-${chapter.endPage} | ${chapter.source} | ${chapter.confidence} | ${chapter.charsNoWhitespace} |`,
  ),
  "",
  "## Inferred Starts",
  "",
  ...inferred.map(
    (hit) =>
      `- Chapter ${hit.chapter}: page ${hit.page}, line ${hit.line}, raw: ${hit.raw}`,
  ),
  "",
].join("\n");

fs.writeFileSync(path.join(outputDir, "pdf-structure-test.md"), markdown, "utf8");

console.log(markdown);
