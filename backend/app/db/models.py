from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime
from sqlalchemy import Enum as SqlEnum
from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ProjectStatus(str, Enum):
    CREATED = "created"
    PDF_IMPORTED = "pdf_imported"
    PARSED = "parsed"
    PARSE_FAILED = "parse_failed"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    book_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        SqlEnum(ProjectStatus), default=ProjectStatus.CREATED
    )
    root_path: Mapped[str] = mapped_column(Text)
    source_pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    parse_runs: Mapped[list["DocumentParseRun"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    analysis_reports: Mapped[list["AnalysisReport"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    podcast_plans: Mapped[list["PodcastPlan"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    script_blocks: Mapped[list["ScriptBlock"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    script_review_reports: Mapped[list["ScriptReviewReport"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    tts_tasks: Mapped[list["TTSTask"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    reader_insights: Mapped[list["ReaderInsight"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    book_profiles: Mapped[list["BookProfile"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class DocumentParseRun(Base):
    __tablename__ = "document_parse_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    provider: Mapped[str] = mapped_column(String(80), default="pymupdf_text_layer")
    source_type: Mapped[str] = mapped_column(String(80), default="text_layer")
    status: Mapped[str] = mapped_column(String(40))
    pages: Mapped[int] = mapped_column(Integer, default=0)
    extracted_chars: Mapped[int] = mapped_column(Integer, default=0)
    quality_score: Mapped[float] = mapped_column(Float, default=0)
    report_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped[Project] = relationship(back_populates="parse_runs")


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    chapter_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300))
    start_page: Mapped[int] = mapped_column(Integer)
    end_page: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(80))
    confidence: Mapped[float] = mapped_column(Float)
    chars_no_whitespace: Mapped[int] = mapped_column(Integer)
    preview: Mapped[str] = mapped_column(Text)
    text_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="chapters")
    analysis_reports: Mapped[list["AnalysisReport"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )
    podcast_plans: Mapped[list["PodcastPlan"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )
    script_blocks: Mapped[list["ScriptBlock"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )
    script_review_reports: Mapped[list["ScriptReviewReport"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )
    tts_tasks: Mapped[list["TTSTask"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )


class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), index=True)
    provider: Mapped[str] = mapped_column(String(80), default="deepseek")
    status: Mapped[str] = mapped_column(String(40), default="success")
    content_json: Mapped[str] = mapped_column(Text)
    raw_response_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="analysis_reports")
    chapter: Mapped[Chapter] = relationship(back_populates="analysis_reports")


class PodcastPlan(Base):
    __tablename__ = "podcast_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), index=True)
    analysis_report_id: Mapped[str | None] = mapped_column(
        ForeignKey("analysis_reports.id"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(80), default="deepseek")
    status: Mapped[str] = mapped_column(String(40), default="success")
    content_json: Mapped[str] = mapped_column(Text)
    raw_response_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="podcast_plans")
    chapter: Mapped[Chapter] = relationship(back_populates="podcast_plans")


class ReaderInsight(Base):
    __tablename__ = "reader_insights"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    provider: Mapped[str] = mapped_column(String(80), default="deepseek")
    status: Mapped[str] = mapped_column(String(40), default="success")
    input_text_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_json: Mapped[str] = mapped_column(Text)
    raw_response_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="reader_insights")


class BookProfile(Base):
    __tablename__ = "book_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    reader_insight_id: Mapped[str | None] = mapped_column(
        ForeignKey("reader_insights.id"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(80), default="deepseek")
    status: Mapped[str] = mapped_column(String(40), default="success")
    content_json: Mapped[str] = mapped_column(Text)
    raw_response_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="book_profiles")


class ScriptBlock(Base):
    __tablename__ = "script_blocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), index=True)
    podcast_plan_id: Mapped[str | None] = mapped_column(
        ForeignKey("podcast_plans.id"), nullable=True
    )
    block_index: Mapped[int] = mapped_column(Integer)
    speaker: Mapped[str] = mapped_column(String(40))
    speaker_role: Mapped[str] = mapped_column(String(80))
    text: Mapped[str] = mapped_column(Text)
    voice_id: Mapped[str] = mapped_column(String(160))
    tts_params_json: Mapped[str] = mapped_column(Text)
    estimated_seconds: Mapped[int] = mapped_column(Integer, default=0)
    locked: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    source_refs_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="script_blocks")
    chapter: Mapped[Chapter] = relationship(back_populates="script_blocks")


class ScriptReviewReport(Base):
    __tablename__ = "script_review_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), index=True)
    provider: Mapped[str] = mapped_column(String(80), default="deepseek")
    status: Mapped[str] = mapped_column(String(40), default="success")
    content_json: Mapped[str] = mapped_column(Text)
    raw_response_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="script_review_reports")
    chapter: Mapped[Chapter] = relationship(back_populates="script_review_reports")


class TTSTask(Base):
    __tablename__ = "tts_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id"), index=True)
    provider: Mapped[str] = mapped_column(String(80), default="volcengine_doubao")
    interface: Mapped[str] = mapped_column(String(80), default="podcast_tts_websocket")
    status: Mapped[str] = mapped_column(String(40), default="pending")
    input_id: Mapped[str] = mapped_column(String(160))
    request_json_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_log_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    rounds_total: Mapped[int] = mapped_column(Integer, default=0)
    rounds_finished: Mapped[int] = mapped_column(Integer, default=0)
    last_finished_round_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    project: Mapped[Project] = relationship(back_populates="tts_tasks")
    chapter: Mapped[Chapter] = relationship(back_populates="tts_tasks")
