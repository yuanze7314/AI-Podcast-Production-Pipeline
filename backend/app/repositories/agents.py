from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    AnalysisReport,
    BookProfile,
    Chapter,
    PodcastPlan,
    Project,
    ReaderInsight,
    ScriptBlock,
    ScriptReviewReport,
    TTSTask,
)
from app.repositories.projects import project_root


def get_chapter(db: Session, project_id: str, chapter_id: str) -> Chapter | None:
    return db.scalars(
        select(Chapter).where(Chapter.project_id == project_id, Chapter.id == chapter_id)
    ).first()


def get_chapter_by_number(
    db: Session, project_id: str, chapter_number: int
) -> Chapter | None:
    return db.scalars(
        select(Chapter).where(
            Chapter.project_id == project_id,
            Chapter.chapter_number == chapter_number,
        )
    ).first()


def read_chapter_text(chapter: Chapter) -> str:
    if not chapter.text_path:
        raise RuntimeError("Chapter has no text_path")
    path = Path(chapter.text_path)
    if not path.exists():
        raise RuntimeError(f"Chapter text file not found: {path}")
    return path.read_text(encoding="utf-8")


def _write_agent_artifact(
    project: Project,
    folder: str,
    filename: str,
    content: str,
) -> str:
    root = project_root(project.id) / folder
    root.mkdir(parents=True, exist_ok=True)
    path = root / filename
    path.write_text(content, encoding="utf-8")
    return str(path)


def save_analysis_report(
    db: Session,
    project: Project,
    chapter: Chapter,
    content: dict[str, Any],
    raw_response: str,
) -> AnalysisReport:
    report_id = str(uuid.uuid4())
    raw_path = _write_agent_artifact(
        project,
        "agent-raw",
        f"analysis-{chapter.chapter_number:03d}-{report_id}.json",
        raw_response,
    )
    report = AnalysisReport(
        id=report_id,
        project_id=project.id,
        chapter_id=chapter.id,
        provider="deepseek",
        status="success",
        content_json=json.dumps(content, ensure_ascii=False),
        raw_response_path=raw_path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def latest_analysis_report(
    db: Session, project_id: str, chapter_id: str
) -> AnalysisReport | None:
    return db.scalars(
        select(AnalysisReport)
        .where(
            AnalysisReport.project_id == project_id,
            AnalysisReport.chapter_id == chapter_id,
            AnalysisReport.status == "success",
        )
        .order_by(AnalysisReport.created_at.desc())
    ).first()


def save_podcast_plan(
    db: Session,
    project: Project,
    chapter: Chapter,
    analysis_report: AnalysisReport | None,
    content: dict[str, Any],
    raw_response: str,
) -> PodcastPlan:
    plan_id = str(uuid.uuid4())
    raw_path = _write_agent_artifact(
        project,
        "agent-raw",
        f"plan-{chapter.chapter_number:03d}-{plan_id}.json",
        raw_response,
    )
    plan = PodcastPlan(
        id=plan_id,
        project_id=project.id,
        chapter_id=chapter.id,
        analysis_report_id=analysis_report.id if analysis_report else None,
        provider="deepseek",
        status="success",
        content_json=json.dumps(content, ensure_ascii=False),
        raw_response_path=raw_path,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def latest_podcast_plan(
    db: Session, project_id: str, chapter_id: str
) -> PodcastPlan | None:
    return db.scalars(
        select(PodcastPlan)
        .where(
            PodcastPlan.project_id == project_id,
            PodcastPlan.chapter_id == chapter_id,
            PodcastPlan.status == "success",
        )
        .order_by(PodcastPlan.created_at.desc())
    ).first()


def save_reader_insight(
    db: Session,
    project: Project,
    input_text: str,
    content: dict[str, Any],
    raw_response: str,
) -> ReaderInsight:
    insight_id = str(uuid.uuid4())
    input_path = _write_agent_artifact(
        project,
        "agent-input",
        f"reader-insight-input-{insight_id}.txt",
        input_text,
    )
    raw_path = _write_agent_artifact(
        project,
        "agent-raw",
        f"reader-insight-{insight_id}.json",
        raw_response,
    )
    insight = ReaderInsight(
        id=insight_id,
        project_id=project.id,
        provider="deepseek",
        status="success",
        input_text_path=input_path,
        content_json=json.dumps(content, ensure_ascii=False),
        raw_response_path=raw_path,
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight


def latest_reader_insight(db: Session, project_id: str) -> ReaderInsight | None:
    return db.scalars(
        select(ReaderInsight)
        .where(ReaderInsight.project_id == project_id, ReaderInsight.status == "success")
        .order_by(ReaderInsight.created_at.desc())
    ).first()


def save_book_profile(
    db: Session,
    project: Project,
    reader_insight: ReaderInsight | None,
    content: dict[str, Any],
    raw_response: str,
) -> BookProfile:
    profile_id = str(uuid.uuid4())
    raw_path = _write_agent_artifact(
        project,
        "agent-raw",
        f"book-profile-{profile_id}.json",
        raw_response,
    )
    profile = BookProfile(
        id=profile_id,
        project_id=project.id,
        reader_insight_id=reader_insight.id if reader_insight else None,
        provider="deepseek",
        status="success",
        content_json=json.dumps(content, ensure_ascii=False),
        raw_response_path=raw_path,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def latest_book_profile(db: Session, project_id: str) -> BookProfile | None:
    return db.scalars(
        select(BookProfile)
        .where(BookProfile.project_id == project_id, BookProfile.status == "success")
        .order_by(BookProfile.created_at.desc())
    ).first()


def save_script_review_report(
    db: Session,
    project: Project,
    chapter: Chapter,
    content: dict[str, Any],
    raw_response: str,
) -> ScriptReviewReport:
    report_id = str(uuid.uuid4())
    raw_path = _write_agent_artifact(
        project,
        "agent-raw",
        f"script-review-{chapter.chapter_number:03d}-{report_id}.json",
        raw_response,
    )
    report = ScriptReviewReport(
        id=report_id,
        project_id=project.id,
        chapter_id=chapter.id,
        provider="deepseek",
        status="success",
        content_json=json.dumps(content, ensure_ascii=False),
        raw_response_path=raw_path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def latest_script_review_report(
    db: Session, project_id: str, chapter_id: str
) -> ScriptReviewReport | None:
    return db.scalars(
        select(ScriptReviewReport)
        .where(
            ScriptReviewReport.project_id == project_id,
            ScriptReviewReport.chapter_id == chapter_id,
            ScriptReviewReport.status == "success",
        )
        .order_by(ScriptReviewReport.created_at.desc())
    ).first()


def _normalize_source_refs(value):
    if not value:
        return []
    if isinstance(value, list):
        return [
            item if isinstance(item, dict) else {"note": str(item)}
            for item in value
        ]
    if isinstance(value, str):
        return [{"note": value}]
    return [{"note": str(value)}]


def save_script_blocks(
    db: Session,
    project: Project,
    chapter: Chapter,
    podcast_plan: PodcastPlan | None,
    blocks: list[dict[str, Any]],
) -> list[ScriptBlock]:
    db.execute(
        delete(ScriptBlock).where(
            ScriptBlock.project_id == project.id,
            ScriptBlock.chapter_id == chapter.id,
        )
    )
    saved: list[ScriptBlock] = []
    for index, block in enumerate(blocks, start=1):
        script_block = ScriptBlock(
            id=str(uuid.uuid4()),
            project_id=project.id,
            chapter_id=chapter.id,
            podcast_plan_id=podcast_plan.id if podcast_plan else None,
            block_index=int(block.get("block_index") or index),
            speaker=block["speaker"],
            speaker_role=block.get("speaker_role", "host"),
            text=block["text"],
            voice_id=block["voice_id"],
            tts_params_json=json.dumps(block["tts_params"], ensure_ascii=False),
            estimated_seconds=int(block.get("estimated_seconds") or 0),
            locked=bool(block.get("locked", False)),
            status=block.get("status", "draft"),
            source_refs_json=json.dumps(_normalize_source_refs(block.get("source_refs")), ensure_ascii=False),
        )
        db.add(script_block)
        saved.append(script_block)
    db.commit()
    for item in saved:
        db.refresh(item)
    return saved


def list_script_blocks(db: Session, project_id: str, chapter_id: str) -> list[ScriptBlock]:
    return list(
        db.scalars(
            select(ScriptBlock)
            .where(ScriptBlock.project_id == project_id, ScriptBlock.chapter_id == chapter_id)
            .order_by(ScriptBlock.block_index.asc())
        )
    )


def get_script_block(
    db: Session, project_id: str, chapter_id: str, block_id: str
) -> ScriptBlock | None:
    return db.scalars(
        select(ScriptBlock).where(
            ScriptBlock.project_id == project_id,
            ScriptBlock.chapter_id == chapter_id,
            ScriptBlock.id == block_id,
        )
    ).first()


def update_script_block(
    db: Session,
    block: ScriptBlock,
    text: str | None = None,
    speech_rate: int | None = None,
    emotion: str | None = None,
) -> ScriptBlock:
    if block.locked:
        raise ValueError("Locked script block cannot be edited")

    if text is not None:
        cleaned_text = text.strip()
        if not cleaned_text:
            raise ValueError("Script block text cannot be empty")
        block.text = cleaned_text

    if speech_rate is not None or emotion is not None:
        tts_params = json.loads(block.tts_params_json or "{}")
        if speech_rate is not None:
            tts_params["speech_rate"] = speech_rate
        if emotion is not None:
            tts_params["emotion"] = emotion
        block.tts_params_json = json.dumps(tts_params, ensure_ascii=False)

    block.status = "draft"
    block.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(block)
    return block


def set_script_block_locked(
    db: Session, block: ScriptBlock, locked: bool
) -> ScriptBlock:
    block.locked = locked
    block.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(block)
    return block


def confirm_chapter_script(
    db: Session, project_id: str, chapter_id: str
) -> list[ScriptBlock]:
    blocks = list_script_blocks(db, project_id, chapter_id)
    if not blocks:
        raise ValueError("No script blocks to confirm")
    for block in blocks:
        if not block.text.strip():
            raise ValueError("Cannot confirm script with empty block text")
        block.status = "confirmed"
        block.updated_at = datetime.utcnow()
    db.commit()
    for block in blocks:
        db.refresh(block)
    return blocks


def chapter_script_is_confirmed(
    db: Session, project_id: str, chapter_id: str
) -> bool:
    blocks = list_script_blocks(db, project_id, chapter_id)
    return bool(blocks) and all(block.status == "confirmed" for block in blocks)


def create_tts_task(
    db: Session,
    project: Project,
    chapter: Chapter,
    input_id: str,
    request_payload: dict[str, Any],
) -> TTSTask:
    task_id = str(uuid.uuid4())
    root = project_root(project.id) / "tts" / f"chapter-{chapter.chapter_number:03d}" / task_id
    root.mkdir(parents=True, exist_ok=True)
    request_path = root / "request.json"
    event_log_path = root / "events.jsonl"
    output_path = root / "chapter.mp3"
    request_path.write_text(
        json.dumps(request_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    event_log_path.write_text("", encoding="utf-8")

    task = TTSTask(
        id=task_id,
        project_id=project.id,
        chapter_id=chapter.id,
        provider=settings.volcengine_tts_provider,
        interface=settings.volcengine_tts_interface,
        status="running",
        input_id=input_id,
        request_json_path=str(request_path),
        event_log_path=str(event_log_path),
        output_path=str(output_path),
        rounds_total=len(request_payload.get("nlp_texts", [])),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def append_tts_event(task: TTSTask, event: dict[str, Any]) -> None:
    if not task.event_log_path:
        return
    path = Path(task.event_log_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False) + "\n")


def mark_tts_task_success(
    db: Session,
    task: TTSTask,
    rounds_finished: int,
    last_finished_round_id: str | None,
) -> TTSTask:
    task.status = "success"
    task.rounds_finished = rounds_finished
    task.last_finished_round_id = last_finished_round_id
    task.error_message = None
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


def mark_tts_task_failed(
    db: Session,
    task: TTSTask,
    error_message: str,
    rounds_finished: int = 0,
    last_finished_round_id: str | None = None,
) -> TTSTask:
    task.status = "failed"
    task.error_message = error_message
    task.rounds_finished = rounds_finished
    task.last_finished_round_id = last_finished_round_id
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


def list_tts_tasks(db: Session, project_id: str, chapter_id: str) -> list[TTSTask]:
    return list(
        db.scalars(
            select(TTSTask)
            .where(TTSTask.project_id == project_id, TTSTask.chapter_id == chapter_id)
            .order_by(TTSTask.created_at.desc())
        )
    )


def latest_tts_task(db: Session, project_id: str, chapter_id: str) -> TTSTask | None:
    return db.scalars(
        select(TTSTask)
        .where(TTSTask.project_id == project_id, TTSTask.chapter_id == chapter_id)
        .order_by(TTSTask.created_at.desc())
    ).first()


def chapter_production_status(db: Session, project_id: str, chapter: Chapter) -> dict[str, Any]:
    analysis = latest_analysis_report(db, project_id, chapter.id)
    plan = latest_podcast_plan(db, project_id, chapter.id)
    blocks = list_script_blocks(db, project_id, chapter.id)
    confirmed_blocks = sum(1 for block in blocks if block.status == "confirmed")
    tts_task = latest_tts_task(db, project_id, chapter.id)
    output_bytes = 0
    if tts_task and tts_task.output_path:
        output_path = Path(tts_task.output_path)
        if output_path.exists():
            output_bytes = output_path.stat().st_size

    if tts_task and tts_task.status == "success":
        stage = "audio_success"
    elif tts_task and tts_task.status == "running":
        stage = "audio_running"
    elif tts_task and tts_task.status == "failed":
        stage = "audio_failed"
    elif blocks and confirmed_blocks == len(blocks):
        stage = "script_confirmed"
    elif blocks:
        stage = "script_draft"
    elif plan:
        stage = "planned"
    elif analysis:
        stage = "analyzed"
    else:
        stage = "not_started"

    return {
        "chapter_id": chapter.id,
        "stage": stage,
        "has_analysis": analysis is not None,
        "has_plan": plan is not None,
        "script_blocks": len(blocks),
        "confirmed_blocks": confirmed_blocks,
        "latest_tts_status": tts_task.status if tts_task else None,
        "latest_tts_task_id": tts_task.id if tts_task else None,
        "rounds_finished": tts_task.rounds_finished if tts_task else 0,
        "rounds_total": tts_task.rounds_total if tts_task else 0,
        "latest_tts_output_bytes": output_bytes,
        "latest_tts_created_at": tts_task.created_at if tts_task else None,
        "latest_tts_error_message": tts_task.error_message if tts_task else None,
    }


def list_chapter_production_statuses(
    db: Session, project_id: str, chapters: list[Chapter]
) -> list[dict[str, Any]]:
    return [chapter_production_status(db, project_id, chapter) for chapter in chapters]


def get_tts_task(
    db: Session, project_id: str, chapter_id: str, task_id: str
) -> TTSTask | None:
    return db.scalars(
        select(TTSTask).where(
            TTSTask.project_id == project_id,
            TTSTask.chapter_id == chapter_id,
            TTSTask.id == task_id,
        )
    ).first()

