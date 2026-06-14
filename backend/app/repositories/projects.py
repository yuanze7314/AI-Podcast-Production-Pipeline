from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Chapter, DocumentParseRun, Project, ProjectStatus
from app.models.document import DocumentParseResult
from app.workflows.ocr import OCRProviderError, OCRTextExtractor

try:
    import fitz
except ImportError:  # pragma: no cover - dependency check happens at runtime
    fitz = None


def storage_root() -> Path:
    root = Path(settings.app_storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def project_root(project_id: str) -> Path:
    root = storage_root() / "projects" / project_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def create_project(db: Session, title: str, book_title: str | None = None) -> Project:
    project_id = str(uuid.uuid4())
    root = project_root(project_id)
    project = Project(
        id=project_id,
        title=title,
        book_title=book_title,
        status=ProjectStatus.CREATED,
        root_path=str(root),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_project(db: Session, project_id: str) -> Project | None:
    return db.get(Project, project_id)


def list_projects(db: Session) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.updated_at.desc())))


def import_pdf_from_path(db: Session, project: Project, pdf_path: Path) -> Project:
    root = project_root(project.id)
    source_dir = root / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    target = source_dir / "book.pdf"
    shutil.copyfile(pdf_path, target)
    project.source_pdf_path = str(target)
    project.status = ProjectStatus.PDF_IMPORTED
    db.commit()
    db.refresh(project)
    return project


def save_uploaded_pdf(db: Session, project: Project, filename: str, content: bytes) -> Project:
    root = project_root(project.id)
    source_dir = root / "source"
    source_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename).suffix or ".pdf"
    target = source_dir / f"book{suffix}"
    target.write_bytes(content)
    project.source_pdf_path = str(target)
    project.status = ProjectStatus.PDF_IMPORTED
    db.commit()
    db.refresh(project)
    return project


def save_parse_result(
    db: Session, project: Project, result: DocumentParseResult
) -> DocumentParseRun:
    root = project_root(project.id)
    reports_dir = root / "reports"
    chapters_dir = root / "chapters"
    reports_dir.mkdir(parents=True, exist_ok=True)
    chapters_dir.mkdir(parents=True, exist_ok=True)

    report_path = reports_dir / "document-parse-result.json"
    report_path.write_text(
        json.dumps(result.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    db.execute(delete(Chapter).where(Chapter.project_id == project.id))

    for chapter in result.chapters:
        text_path = chapters_dir / f"chapter-{chapter.chapter:03d}.txt"
        text_path.write_text(chapter.full_text, encoding="utf-8")
        db.add(
            Chapter(
                id=str(uuid.uuid4()),
                project_id=project.id,
                chapter_number=chapter.chapter,
                title=chapter.title,
                start_page=chapter.start_page,
                end_page=chapter.end_page,
                source=chapter.source,
                confidence=chapter.confidence,
                chars_no_whitespace=chapter.chars_no_whitespace,
                preview=chapter.preview,
                text_path=str(text_path),
            )
        )

    provider = (
        "pymupdf_ocr"
        if result.text_layer.source_type == "pymupdf_ocr"
        else "pymupdf_text_layer"
    )
    parse_run = DocumentParseRun(
        id=str(uuid.uuid4()),
        project_id=project.id,
        provider=provider,
        source_type=result.text_layer.source_type,
        status="success",
        pages=result.text_layer.pages,
        extracted_chars=result.text_layer.extracted_chars,
        quality_score=result.text_layer.quality_score,
        report_path=str(report_path),
    )
    db.add(parse_run)
    project.status = ProjectStatus.PARSED
    db.commit()
    db.refresh(parse_run)
    return parse_run


def save_parse_failure(db: Session, project: Project, error_message: str) -> DocumentParseRun:
    parse_run = DocumentParseRun(
        id=str(uuid.uuid4()),
        project_id=project.id,
        provider="pymupdf_text_layer",
        source_type="unknown",
        status="failed",
        error_message=error_message,
    )
    db.add(parse_run)
    project.status = ProjectStatus.PARSE_FAILED
    db.commit()
    db.refresh(parse_run)
    return parse_run


def list_chapters(db: Session, project_id: str) -> list[Chapter]:
    return list(
        db.scalars(
            select(Chapter)
            .where(Chapter.project_id == project_id)
            .order_by(Chapter.chapter_number.asc())
        )
    )


def _chapter_stats(text: str) -> tuple[int, str]:
    compact = "".join(text.split())
    return len(compact), compact[:120]


def _read_chapter_text(chapter: Chapter) -> str:
    if chapter.text_path and Path(chapter.text_path).exists():
        return Path(chapter.text_path).read_text(encoding="utf-8")
    return chapter.preview or ""


def _write_chapter_text(project: Project, chapter_number: int, text: str) -> str:
    chapters_dir = project_root(project.id) / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)
    path = chapters_dir / f"chapter-{chapter_number:03d}-{uuid.uuid4().hex[:8]}.txt"
    path.write_text(text, encoding="utf-8")
    return str(path)


def _extract_page_range_text(project: Project, start_page: int, end_page: int) -> str:
    if not project.source_pdf_path:
        return ""
    pdf_path = Path(project.source_pdf_path)
    if not pdf_path.exists():
        return ""

    page_count = end_page - start_page + 1
    pages: list[str] = []
    if fitz is not None:
        with fitz.open(pdf_path) as doc:
            bounded_start = max(1, start_page)
            bounded_end = min(end_page, len(doc))
            for page_number in range(bounded_start, bounded_end + 1):
                pages.append(doc[page_number - 1].get_text("text"))

    text = "\n".join(pages)
    if len("".join(text.split())) >= page_count * 80:
        return text

    try:
        ocr_pages = OCRTextExtractor().extract(pdf_path).page_texts
    except OCRProviderError:
        return text
    return "\n".join(ocr_pages[start_page - 1 : end_page])


def _reindex_chapters(db: Session, project_id: str) -> None:
    chapters = list_chapters(db, project_id)
    chapters.sort(key=lambda item: (item.chapter_number, item.start_page, item.created_at))
    for index, chapter in enumerate(chapters, start=1):
        chapter.chapter_number = index


def update_chapter(
    db: Session,
    chapter: Chapter,
    *,
    title: str | None = None,
    start_page: int | None = None,
    end_page: int | None = None,
) -> Chapter:
    next_title = title.strip() if title is not None else chapter.title
    next_start_page = start_page if start_page is not None else chapter.start_page
    next_end_page = end_page if end_page is not None else chapter.end_page

    if not next_title:
        raise ValueError("Chapter title cannot be empty")
    if next_start_page > next_end_page:
        raise ValueError("Chapter start_page cannot be greater than end_page")

    chapter.title = next_title
    chapter.start_page = next_start_page
    chapter.end_page = next_end_page
    chapter.source = "human_reviewed"
    chapter.confidence = max(chapter.confidence, 0.98)
    db.commit()
    db.refresh(chapter)
    return chapter


def create_manual_chapter(
    db: Session,
    project: Project,
    *,
    title: str,
    start_page: int,
    end_page: int,
    chapter_number: int | None = None,
) -> Chapter:
    title = title.strip()
    if not title:
        raise ValueError("Chapter title cannot be empty")
    if start_page > end_page:
        raise ValueError("Chapter start_page cannot be greater than end_page")

    chapters = list_chapters(db, project.id)
    target_number = chapter_number or (len(chapters) + 1)
    target_number = min(max(1, target_number), len(chapters) + 1)
    for chapter in chapters:
        if chapter.chapter_number >= target_number:
            chapter.chapter_number += 1

    text = _extract_page_range_text(project, start_page, end_page)
    chars_no_whitespace, preview = _chapter_stats(text)
    chapter = Chapter(
        id=str(uuid.uuid4()),
        project_id=project.id,
        chapter_number=target_number,
        title=title,
        start_page=start_page,
        end_page=end_page,
        source="manual_added",
        confidence=0.98,
        chars_no_whitespace=chars_no_whitespace,
        preview=preview or title,
        text_path=_write_chapter_text(project, target_number, text),
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


def delete_chapter(db: Session, project_id: str, chapter: Chapter) -> list[Chapter]:
    db.delete(chapter)
    db.flush()
    _reindex_chapters(db, project_id)
    db.commit()
    return list_chapters(db, project_id)


def merge_chapter_with_next(
    db: Session, project: Project, chapter: Chapter
) -> Chapter:
    chapters = list_chapters(db, project.id)
    index = next((idx for idx, item in enumerate(chapters) if item.id == chapter.id), None)
    if index is None:
        raise ValueError("Chapter not found")
    if index + 1 >= len(chapters):
        raise ValueError("Cannot merge the last chapter with next")

    next_chapter = chapters[index + 1]
    merged_text = "\n\n".join(
        item for item in [_read_chapter_text(chapter), _read_chapter_text(next_chapter)] if item
    )
    chars_no_whitespace, preview = _chapter_stats(merged_text)

    chapter.title = f"{chapter.title} / {next_chapter.title}"
    chapter.end_page = max(chapter.end_page, next_chapter.end_page)
    chapter.source = "human_merged"
    chapter.confidence = 0.98
    chapter.chars_no_whitespace = chars_no_whitespace
    chapter.preview = preview or chapter.title
    chapter.text_path = _write_chapter_text(project, chapter.chapter_number, merged_text)

    db.delete(next_chapter)
    db.flush()
    _reindex_chapters(db, project.id)
    db.commit()
    db.refresh(chapter)
    return chapter


def latest_parse_run(db: Session, project_id: str) -> DocumentParseRun | None:
    return db.scalars(
        select(DocumentParseRun)
        .where(DocumentParseRun.project_id == project_id)
        .order_by(DocumentParseRun.created_at.desc())
    ).first()
