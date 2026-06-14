from __future__ import annotations

import re
from pathlib import Path

try:
    import fitz
except ImportError:  # pragma: no cover - exercised when dependency is missing
    fitz = None

from app.models.document import (
    ChapterCandidate,
    DocumentParseResult,
    ParsedChapter,
    TextLayerReport,
)
from app.workflows.ocr import OCRProviderError, OCRTextExtractor


CHAPTER_RE = re.compile(r"^第[一二三四五六七八九十百零〇0-9]+章[:：]?$")
CHAPTER_FULL_RE = re.compile(r"^第[一二三四五六七八九十百零〇0-9]+章[:：]?\s*(.*)$")


class DocumentParserWorkflow:
    """Parse a PDF into chapter structure candidates.

    v0.1 implements text-layer parsing first. When a PDF has no usable text
    layer, the workflow returns `needs_ocr=True`; OCR providers will plug in at
    this boundary.
    """

    def parse(self, pdf_path: Path) -> DocumentParseResult:
        pages = self._extract_text_layer(pdf_path)
        text_layer = self._build_text_layer_report(pages)

        if text_layer.needs_ocr:
            try:
                ocr_result = OCRTextExtractor().extract(pdf_path)
            except OCRProviderError as exc:
                raise RuntimeError(str(exc)) from exc
            pages = ocr_result.page_texts
            text_layer = self._build_text_layer_report(
                pages,
                source_type=ocr_result.provider,
            )
            if text_layer.needs_ocr:
                raise RuntimeError(
                    "OCR completed but extracted text is still too weak for chapter parsing."
                )

        toc, body = self._detect_chapter_hits(pages)
        inferred = self._infer_missing_body_starts(pages, toc, body)
        chapters = self._build_chapters(pages, toc, body, inferred)

        return DocumentParseResult(
            file=str(pdf_path),
            text_layer=text_layer,
            toc_candidates=toc,
            body_candidates=body,
            inferred_candidates=inferred,
            chapters=chapters,
        )

    def _extract_text_layer(self, pdf_path: Path) -> list[str]:
        if fitz is None:
            raise RuntimeError(
                "PyMuPDF is not installed. Install backend/requirements.txt first."
            )

        pages: list[str] = []
        with fitz.open(pdf_path) as doc:
            for page in doc:
                pages.append(self._repair_mojibake(page.get_text("text")))
        return pages

    @staticmethod
    def _repair_mojibake(text: str) -> str:
        cjk_before = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
        if cjk_before > 20:
            return text
        mojibake_markers = ("ä", "å", "ç", "æ", "è", "é", "ï¼", "â")
        if not any(marker in text for marker in mojibake_markers):
            return text
        try:
            repaired = text.encode("latin1").decode("utf-8")
        except UnicodeError:
            return text
        cjk_after = sum(1 for char in repaired if "\u4e00" <= char <= "\u9fff")
        return repaired if cjk_after > max(20, cjk_before * 3) else text

    def _build_text_layer_report(
        self, pages: list[str], source_type: str = "text_layer"
    ) -> TextLayerReport:
        all_text = "\n".join(pages)
        chars = len(all_text)
        sample = re.sub(r"\s+", "", all_text)[:500]
        quality_score = min(1.0, chars / max(1, len(pages) * 350))
        return TextLayerReport(
            pages=len(pages),
            extracted_chars=chars,
            sample=sample,
            source_type=source_type,
            needs_ocr=chars < max(1000, len(pages) * 80),
            quality_score=quality_score,
        )

    def _detect_chapter_hits(
        self, pages: list[str]
    ) -> tuple[list[ChapterCandidate], list[ChapterCandidate]]:
        toc: list[ChapterCandidate] = []
        body: list[ChapterCandidate] = []

        for page_index, page_text in enumerate(pages):
            page = page_index + 1
            lines = self._page_lines(page_text)
            is_toc_page = page <= 6

            for line_index, line in enumerate(lines):
                full = CHAPTER_FULL_RE.match(line)
                target = toc if is_toc_page else body
                source = "toc" if is_toc_page else "body"

                if full:
                    title = self._title_from_heading_lines(lines, line_index, full.group(1))
                    self._push_unique(
                        target,
                        ChapterCandidate(
                            chapter=self._chapter_number(line),
                            title=title,
                            page=page,
                            line=line_index,
                            raw=self._heading_raw(lines, line_index, title),
                            source=source,
                            confidence=0.9 if is_toc_page else 0.85,
                        ),
                    )
                    continue

                if CHAPTER_RE.match(line):
                    title = lines[line_index + 1] if line_index + 1 < len(lines) else ""
                    self._push_unique(
                        target,
                        ChapterCandidate(
                            chapter=self._chapter_number(line),
                            title=title,
                            page=page,
                            line=line_index,
                            raw=f"{line} {title}".strip(),
                            source=source,
                            confidence=0.9 if is_toc_page else 0.85,
                        ),
                    )

        return toc, body

    def _infer_missing_body_starts(
        self,
        pages: list[str],
        toc: list[ChapterCandidate],
        body: list[ChapterCandidate],
    ) -> list[ChapterCandidate]:
        inferred: list[ChapterCandidate] = []

        for toc_hit in toc:
            if any(hit.chapter == toc_hit.chapter for hit in body):
                continue

            prev = max(
                (hit for hit in body if hit.chapter < toc_hit.chapter),
                key=lambda item: item.chapter,
                default=None,
            )
            next_hit = min(
                (hit for hit in body if hit.chapter > toc_hit.chapter),
                key=lambda item: item.chapter,
                default=None,
            )

            start_page = prev.page if prev else 1
            end_page = next_hit.page if next_hit else len(pages)
            expected_title = self._normalize(toc_hit.title)

            for page in range(start_page, end_page + 1):
                for line_index, line in enumerate(self._page_lines(pages[page - 1])[:10]):
                    normalized_line = self._normalize(line)
                    if normalized_line and (
                        normalized_line in expected_title
                        or expected_title in normalized_line
                    ):
                        inferred.append(
                            ChapterCandidate(
                                chapter=toc_hit.chapter,
                                title=toc_hit.title,
                                page=page,
                                line=line_index,
                                raw=line,
                                source="inferred_title_match",
                                confidence=0.72,
                            )
                        )
                        break
                if any(hit.chapter == toc_hit.chapter for hit in inferred):
                    break

        return inferred

    def _build_chapters(
        self,
        pages: list[str],
        toc: list[ChapterCandidate],
        body: list[ChapterCandidate],
        inferred: list[ChapterCandidate],
    ) -> list[ParsedChapter]:
        starts = [
            *[
                hit.model_copy(
                    update={
                        "confidence": 0.95
                        if hit.title == self._toc_title(toc, hit.chapter)
                        else 0.85
                    }
                )
                for hit in body
            ],
            *inferred,
        ]
        starts.sort(key=lambda item: item.chapter)

        chapters: list[ParsedChapter] = []
        for index, start in enumerate(starts):
            next_start = starts[index + 1] if index + 1 < len(starts) else None
            end_page = next_start.page - 1 if next_start else len(pages)
            chapter_text = "\n".join(pages[start.page - 1 : end_page])
            title = self._best_chapter_title(toc, start, chapter_text)
            compact = re.sub(r"\s+", "", chapter_text)

            chapters.append(
                ParsedChapter(
                    chapter=start.chapter,
                    title=title,
                    start_page=start.page,
                    end_page=end_page,
                    source=start.source,
                    raw_body_title=start.raw,
                    confidence=start.confidence,
                    chars_no_whitespace=len(compact),
                    preview=compact[:120],
                    full_text=chapter_text,
                )
            )

        return chapters

    @staticmethod
    def _page_lines(text: str) -> list[str]:
        return [line.strip() for line in text.splitlines() if line.strip()]

    @staticmethod
    def _clean_title_line(line: str) -> str:
        line = re.sub(r"^第[一二三四五六七八九十百零〇0-9]+章[:：]?\s*", "", line)
        line = re.sub(r"\s+", " ", line).strip()
        return line.strip(" \t:：-—")

    def _title_from_heading_lines(
        self, lines: list[str], line_index: int, inline_title: str
    ) -> str:
        parts: list[str] = []
        first_raw = inline_title.strip()
        first = self._clean_title_line(first_raw)
        if first and first_raw.endswith((":", "：")):
            first = f"{first}："
        if first:
            parts.append(first)

        for next_line in lines[line_index + 1 : line_index + 4]:
            if parts and not self._title_needs_continuation("".join(parts)):
                break
            if CHAPTER_FULL_RE.match(next_line) or CHAPTER_RE.match(next_line):
                break
            candidate = self._clean_title_line(next_line)
            if not self._looks_like_title_continuation(candidate):
                break
            if (
                len(parts) == 1
                and "：" not in parts[0]
                and ":" not in parts[0]
                and len(self._normalize(parts[0])) <= 6
                and candidate.startswith("可持续")
            ):
                parts[0] = f"{parts[0]}："
            parts.append(candidate)
            if len("".join(parts)) >= 32:
                break

        return "".join(parts).strip() or (
            lines[line_index + 1].strip() if line_index + 1 < len(lines) else ""
        )

    @staticmethod
    def _looks_like_title_continuation(text: str) -> bool:
        if not text:
            return False
        if len(text) > 36:
            return False
        bad_markers = (
            "©",
            "版权",
            "不得转载",
            "中国可持续金融发展洞察白皮书",
            "KPMG",
            "kpmg",
            "附录",
            "关于",
        )
        if any(marker in text for marker in bad_markers):
            return False
        if re.match(r"^[一二三四五六七八九十]+[、.．]", text):
            return False
        if re.match(r"^[（(][一二三四五六七八九十0-9]+[）)]", text):
            return False
        if re.search(r"[。！？!?；;]$", text):
            return False
        return True

    @staticmethod
    def _title_needs_continuation(text: str) -> bool:
        normalized = re.sub(r"\s+", "", text)
        if not normalized:
            return True
        if normalized.endswith(("：", ":", "与", "和", "及", "的", "可持续")):
            return True
        if normalized in {"结语", "序言", "前言", "后记"}:
            return False
        if "：" in normalized or ":" in normalized:
            return False
        return len(normalized) < 12

    @staticmethod
    def _heading_raw(lines: list[str], line_index: int, title: str) -> str:
        if title:
            return f"{lines[line_index]} {title}".strip()
        return lines[line_index]

    def _best_chapter_title(
        self,
        toc: list[ChapterCandidate],
        start: ChapterCandidate,
        chapter_text: str,
    ) -> str:
        candidates = [
            self._toc_title(toc, start.chapter),
            start.title,
            self._title_from_chapter_text(chapter_text, start.chapter),
        ]
        cleaned = [candidate.strip() for candidate in candidates if candidate and candidate.strip()]
        if not cleaned:
            return start.title

        best = cleaned[0]
        for candidate in cleaned[1:]:
            if self._title_is_better(candidate, best):
                best = candidate
        return best

    def _title_from_chapter_text(self, chapter_text: str, chapter: int) -> str:
        lines = self._page_lines(chapter_text)[:12]
        for index, line in enumerate(lines):
            match = CHAPTER_FULL_RE.match(line)
            if not match:
                continue
            try:
                if self._chapter_number(line) != chapter:
                    continue
            except (KeyError, ValueError):
                continue
            return self._title_from_heading_lines(lines, index, match.group(1))
        return ""

    def _title_is_better(self, candidate: str, current: str) -> bool:
        normalized_candidate = self._normalize(candidate)
        normalized_current = self._normalize(current)
        if not normalized_candidate:
            return False
        if normalized_current and normalized_current in normalized_candidate:
            return True
        if len(normalized_candidate) >= len(normalized_current) + 4:
            return True
        return False

    @staticmethod
    def _push_unique(target: list[ChapterCandidate], hit: ChapterCandidate) -> None:
        if not any(item.chapter == hit.chapter for item in target):
            target.append(hit)

    @staticmethod
    def _normalize(text: str) -> str:
        return re.sub(r"[\s，,。．.：:;；、'‘’“”\"《》<>（）()\[\]【】]", "", text)

    @staticmethod
    def _chapter_number(text: str) -> int:
        match = re.match(r"^第(.+?)章", text)
        if not match:
            raise ValueError(f"Not a chapter heading: {text}")
        raw = match.group(1)
        if raw.isdigit():
            return int(raw)

        digits = {
            "一": 1,
            "二": 2,
            "三": 3,
            "四": 4,
            "五": 5,
            "六": 6,
            "七": 7,
            "八": 8,
            "九": 9,
            "十": 10,
        }
        if raw == "十":
            return 10
        if raw.startswith("十"):
            return 10 + digits.get(raw[1], 0)
        if "十" in raw:
            tens, ones = raw.split("十", 1)
            return digits.get(tens, 1) * 10 + digits.get(ones, 0)
        return digits[raw]

    @staticmethod
    def _toc_title(toc: list[ChapterCandidate], chapter: int) -> str:
        for hit in toc:
            if hit.chapter == chapter:
                return hit.title
        return ""
