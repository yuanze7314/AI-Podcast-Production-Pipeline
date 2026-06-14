from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    title: str
    book_title: str | None = None


class ProjectRead(BaseModel):
    id: str
    title: str
    book_title: str | None
    status: str
    root_path: str
    source_pdf_path: str | None
    created_at: datetime
    updated_at: datetime


class LocalPdfImport(BaseModel):
    pdf_path: str


class ChapterRead(BaseModel):
    id: str
    project_id: str
    chapter_number: int
    title: str
    start_page: int
    end_page: int
    source: str
    confidence: float
    chars_no_whitespace: int
    preview: str
    text_path: str | None


class ChapterTextRead(BaseModel):
    chapter_id: str
    title: str
    text: str
    chars: int
    chars_no_whitespace: int
    text_path: str | None


class ChapterProductionStatusRead(BaseModel):
    chapter_id: str
    stage: str
    has_analysis: bool
    has_plan: bool
    script_blocks: int
    confirmed_blocks: int
    latest_tts_status: str | None
    latest_tts_task_id: str | None
    rounds_finished: int
    rounds_total: int
    latest_tts_output_bytes: int
    latest_tts_created_at: datetime | None
    latest_tts_error_message: str | None


class BatchScriptRequest(BaseModel):
    chapter_ids: list[str] | None = None
    skip_existing: bool = True
    failed_only: bool = False


class BatchScriptChapterResult(BaseModel):
    chapter_id: str
    chapter_number: int
    title: str
    status: str
    script_blocks: int = 0
    error_message: str | None = None


class BatchScriptResult(BaseModel):
    project_id: str
    total: int
    succeeded: int
    skipped: int
    failed: int
    elapsed_seconds: float = 0
    failed_chapter_ids: list[str] = Field(default_factory=list)
    results: list[BatchScriptChapterResult]


class BatchTTSRequest(BaseModel):
    chapter_ids: list[str] | None = None
    skip_existing_success: bool = True
    failed_only: bool = False


class BatchTTSChapterResult(BaseModel):
    chapter_id: str
    chapter_number: int
    title: str
    status: str
    tts_task_id: str | None = None
    rounds_finished: int = 0
    rounds_total: int = 0
    error_message: str | None = None


class BatchTTSResult(BaseModel):
    project_id: str
    total: int
    succeeded: int
    skipped: int
    failed: int
    elapsed_seconds: float = 0
    failed_chapter_ids: list[str] = Field(default_factory=list)
    results: list[BatchTTSChapterResult]


class FullAudioBuildRequest(BaseModel):
    allow_partial: bool = False


class FullAudioTaskRead(BaseModel):
    id: str
    project_id: str
    status: str
    chapters_total: int
    chapters_included: int
    chapters_missing: int
    output_path: str | None
    output_bytes: int
    error_message: str | None
    created_at: datetime


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    start_page: int | None = Field(default=None, ge=1)
    end_page: int | None = Field(default=None, ge=1)


class ChapterCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    start_page: int = Field(ge=1)
    end_page: int = Field(ge=1)
    chapter_number: int | None = Field(default=None, ge=1)


class ParseRunRead(BaseModel):
    id: str
    project_id: str
    provider: str
    source_type: str
    status: str
    pages: int
    extracted_chars: int
    quality_score: float
    report_path: str | None
    error_message: str | None
    created_at: datetime


class AnalysisReportRead(BaseModel):
    id: str
    project_id: str
    chapter_id: str
    provider: str
    status: str
    content_json: dict[str, Any]
    raw_response_path: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class PodcastPlanRead(BaseModel):
    id: str
    project_id: str
    chapter_id: str
    analysis_report_id: str | None
    provider: str
    status: str
    content_json: dict[str, Any]
    raw_response_path: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class ReaderInsightRequest(BaseModel):
    input_text: str = ""


class ReaderInsightRead(BaseModel):
    id: str
    project_id: str
    provider: str
    status: str
    content_json: dict[str, Any]
    input_text_path: str | None
    raw_response_path: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class BookProfileRead(BaseModel):
    id: str
    project_id: str
    reader_insight_id: str | None
    provider: str
    status: str
    content_json: dict[str, Any]
    raw_response_path: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class ScriptBlockRead(BaseModel):
    id: str
    project_id: str
    chapter_id: str
    podcast_plan_id: str | None
    block_index: int
    speaker: str
    speaker_role: str
    text: str
    voice_id: str
    tts_params_json: dict[str, Any]
    estimated_seconds: int
    locked: bool
    status: str
    source_refs_json: list[dict[str, Any]] | None
    created_at: datetime
    updated_at: datetime


class ScriptReviewReportRead(BaseModel):
    id: str
    project_id: str
    chapter_id: str
    provider: str
    status: str
    content_json: dict[str, Any]
    raw_response_path: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class ScriptBlockUpdate(BaseModel):
    text: str | None = None
    speech_rate: int | None = None
    emotion: str | None = None


class ScriptBlockLockUpdate(BaseModel):
    locked: bool


class TTSPayloadPreview(BaseModel):
    project_id: str
    chapter_id: str
    input_id: str
    script_blocks: int
    payload: dict[str, Any]


class TTSTaskRead(BaseModel):
    id: str
    project_id: str
    chapter_id: str
    provider: str
    interface: str
    status: str
    input_id: str
    request_json_path: str | None
    event_log_path: str | None
    output_path: str | None
    rounds_total: int
    rounds_finished: int
    last_finished_round_id: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
