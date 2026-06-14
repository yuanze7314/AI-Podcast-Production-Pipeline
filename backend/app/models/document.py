from pydantic import BaseModel, Field


class ChapterCandidate(BaseModel):
    chapter: int
    title: str
    page: int
    line: int
    raw: str
    source: str
    confidence: float = 0.8


class ParsedChapter(BaseModel):
    chapter: int
    title: str
    start_page: int
    end_page: int
    source: str
    raw_body_title: str
    confidence: float
    chars_no_whitespace: int
    preview: str
    full_text: str


class TextLayerReport(BaseModel):
    pages: int
    extracted_chars: int
    sample: str
    source_type: str = "text_layer"
    needs_ocr: bool = False
    quality_score: float = Field(ge=0, le=1)


class DocumentParseResult(BaseModel):
    file: str
    text_layer: TextLayerReport
    toc_candidates: list[ChapterCandidate]
    body_candidates: list[ChapterCandidate]
    inferred_candidates: list[ChapterCandidate]
    chapters: list[ParsedChapter]
