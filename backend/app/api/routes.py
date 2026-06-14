import json
from pathlib import Path
import time
import uuid
from datetime import datetime
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.graphs.chapter_content_graph import run_chapter_content_graph
from app.models.project import (
    AnalysisReportRead,
    BatchScriptRequest,
    BatchScriptResult,
    BatchTTSRequest,
    BatchTTSResult,
    ChapterCreate,
    ChapterProductionStatusRead,
    ChapterRead,
    ChapterTextRead,
    ChapterUpdate,
    FullAudioBuildRequest,
    FullAudioTaskRead,
    LocalPdfImport,
    ParseRunRead,
    PodcastPlanRead,
    ProjectCreate,
    ProjectRead,
    BookProfileRead,
    ReaderInsightRead,
    ReaderInsightRequest,
    ScriptBlockRead,
    ScriptBlockLockUpdate,
    ScriptBlockUpdate,
    ScriptReviewReportRead,
    TTSPayloadPreview,
    TTSTaskRead,
)
from app.repositories import agents, projects
from app.services.chapter_agents import AgentJsonError, ChapterAgents
from app.services.podcast_tts_client import (
    PodcastTTSClient,
    PodcastTTSPackager,
    ScriptBlock as TTSScriptBlock,
)
from app.workflows.document_parser import DocumentParserWorkflow
from app.workflows.ocr import diagnose_ocr_environment

router = APIRouter()


class ParsePdfRequest(BaseModel):
    pdf_path: str = Field(..., description="Absolute path to the local PDF file.")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ocr/diagnostics")
def ocr_diagnostics() -> dict:
    return diagnose_ocr_environment()


def _project_or_404(db: Session, project_id: str):
    project = projects.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _chapter_or_404(db: Session, project_id: str, chapter_id: str):
    chapter = agents.get_chapter(db, project_id, chapter_id)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


def _script_block_or_404(
    db: Session, project_id: str, chapter_id: str, block_id: str
):
    block = agents.get_script_block(db, project_id, chapter_id, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Script block not found")
    return block


def _analysis_response(report):
    return {
        "id": report.id,
        "project_id": report.project_id,
        "chapter_id": report.chapter_id,
        "provider": report.provider,
        "status": report.status,
        "content_json": json.loads(report.content_json),
        "raw_response_path": report.raw_response_path,
        "error_message": report.error_message,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
    }


def _plan_response(plan):
    return {
        "id": plan.id,
        "project_id": plan.project_id,
        "chapter_id": plan.chapter_id,
        "analysis_report_id": plan.analysis_report_id,
        "provider": plan.provider,
        "status": plan.status,
        "content_json": json.loads(plan.content_json),
        "raw_response_path": plan.raw_response_path,
        "error_message": plan.error_message,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


def _reader_insight_response(insight):
    return {
        "id": insight.id,
        "project_id": insight.project_id,
        "provider": insight.provider,
        "status": insight.status,
        "content_json": json.loads(insight.content_json),
        "input_text_path": insight.input_text_path,
        "raw_response_path": insight.raw_response_path,
        "error_message": insight.error_message,
        "created_at": insight.created_at,
        "updated_at": insight.updated_at,
    }


def _book_profile_response(profile):
    return {
        "id": profile.id,
        "project_id": profile.project_id,
        "reader_insight_id": profile.reader_insight_id,
        "provider": profile.provider,
        "status": profile.status,
        "content_json": json.loads(profile.content_json),
        "raw_response_path": profile.raw_response_path,
        "error_message": profile.error_message,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


def _script_review_response(report):
    return {
        "id": report.id,
        "project_id": report.project_id,
        "chapter_id": report.chapter_id,
        "provider": report.provider,
        "status": report.status,
        "content_json": json.loads(report.content_json),
        "raw_response_path": report.raw_response_path,
        "error_message": report.error_message,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
    }


def _project_chapter_overview(db: Session, project_id: str) -> list[dict]:
    return [
        {
            "chapter_number": chapter.chapter_number,
            "title": chapter.title,
            "start_page": chapter.start_page,
            "end_page": chapter.end_page,
            "chars_no_whitespace": chapter.chars_no_whitespace,
            "preview": chapter.preview[:500],
        }
        for chapter in projects.list_chapters(db, project_id)
    ]


def _quality_context(db: Session, project_id: str) -> dict:
    reader_insight = agents.latest_reader_insight(db, project_id)
    book_profile = agents.latest_book_profile(db, project_id)
    return {
        "reader_insight": json.loads(reader_insight.content_json) if reader_insight else None,
        "book_profile": json.loads(book_profile.content_json) if book_profile else None,
    }


def _coerce_source_refs(value):
    if isinstance(value, list):
        return [
            item if isinstance(item, dict) else {"note": str(item)}
            for item in value
        ]
    if isinstance(value, str):
        return [{"note": value}]
    if value is None:
        return []
    return [{"note": str(value)}]


def _script_block_response(block):
    return {
        "id": block.id,
        "project_id": block.project_id,
        "chapter_id": block.chapter_id,
        "podcast_plan_id": block.podcast_plan_id,
        "block_index": block.block_index,
        "speaker": block.speaker,
        "speaker_role": block.speaker_role,
        "text": block.text,
        "voice_id": block.voice_id,
        "tts_params_json": json.loads(block.tts_params_json),
        "estimated_seconds": block.estimated_seconds,
        "locked": block.locked,
        "status": block.status,
        "source_refs_json": _coerce_source_refs(json.loads(block.source_refs_json or "[]")),
        "created_at": block.created_at,
        "updated_at": block.updated_at,
    }


def _tts_task_response(task):
    return {
        "id": task.id,
        "project_id": task.project_id,
        "chapter_id": task.chapter_id,
        "provider": task.provider,
        "interface": task.interface,
        "status": task.status,
        "input_id": task.input_id,
        "request_json_path": task.request_json_path,
        "event_log_path": task.event_log_path,
        "output_path": task.output_path,
        "rounds_total": task.rounds_total,
        "rounds_finished": task.rounds_finished,
        "last_finished_round_id": task.last_finished_round_id,
        "error_message": task.error_message,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


async def _run_tts_generation(db: Session, project, chapter):
    blocks = agents.list_script_blocks(db, project.id, chapter.id)
    if not blocks:
        raise HTTPException(status_code=422, detail="Generate script blocks first")
    if not agents.chapter_script_is_confirmed(db, project.id, chapter.id):
        raise HTTPException(status_code=422, detail="Confirm script before TTS")

    input_id = f"{project.id}_chapter_{chapter.chapter_number:03d}"
    try:
        payload = PodcastTTSPackager().build_payload(
            input_id,
            [
                TTSScriptBlock(speaker=block.speaker, text=block.text)
                for block in blocks
            ],
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    task = agents.create_tts_task(db, project, chapter, input_id, payload)
    rounds_finished = 0
    last_finished_round_id = None

    def on_event(event: dict) -> None:
        nonlocal rounds_finished, last_finished_round_id
        agents.append_tts_event(task, event)
        if event.get("event_name") == "PodcastRoundEnd":
            rounds_finished += 1
            payload_data = event.get("payload") or {}
            last_finished_round_id = str(
                payload_data.get("round_id")
                or payload_data.get("id")
                or rounds_finished
            )

    try:
        result = await PodcastTTSClient().synthesize(
            payload,
            Path(task.output_path),
            on_event=on_event,
        )
    except Exception as exc:
        return agents.mark_tts_task_failed(
            db,
            task,
            str(exc),
            rounds_finished=rounds_finished,
            last_finished_round_id=last_finished_round_id,
        )

    return agents.mark_tts_task_success(
        db,
        task,
        rounds_finished=result.rounds_finished or rounds_finished,
        last_finished_round_id=result.last_finished_round_id or last_finished_round_id,
    )


async def _ensure_script_pipeline(db: Session, project, chapter):
    chapter_text = agents.read_chapter_text(chapter)
    chapter_agents = ChapterAgents()
    quality_context = _quality_context(db, project.id)

    analysis = agents.latest_analysis_report(db, project.id, chapter.id)
    if analysis is None:
        analysis_output = await chapter_agents.analyze_chapter(
            chapter.title, chapter_text, quality_context
        )
        analysis = agents.save_analysis_report(
            db, project, chapter, analysis_output.content, analysis_output.raw
        )
        analysis_content = analysis_output.content
    else:
        analysis_content = json.loads(analysis.content_json)

    plan = agents.latest_podcast_plan(db, project.id, chapter.id)
    if plan is None:
        plan_output = await chapter_agents.create_podcast_plan(
            chapter.title, analysis_content, quality_context
        )
        plan = agents.save_podcast_plan(
            db, project, chapter, analysis, plan_output.content, plan_output.raw
        )
        plan_content = plan_output.content
    else:
        plan_content = json.loads(plan.content_json)

    saved = agents.list_script_blocks(db, project.id, chapter.id)
    if not saved:
        script_output = await chapter_agents.write_script_blocks(
            chapter.title,
            analysis_content,
            plan_content,
            quality_context,
        )
        saved = agents.save_script_blocks(
            db, project, chapter, plan, script_output.content["blocks"]
        )

    return analysis, plan, saved


def _tts_task_or_404(
    db: Session, project_id: str, chapter_id: str, task_id: str
):
    task = agents.get_tts_task(db, project_id, chapter_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="TTS task not found")
    return task


def _full_audio_root(project_id: str) -> Path:
    return projects.project_root(project_id) / "full-audio"


def _read_full_audio_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _full_audio_response(manifest: dict) -> dict:
    return {
        "id": manifest["id"],
        "project_id": manifest["project_id"],
        "status": manifest["status"],
        "chapters_total": manifest["chapters_total"],
        "chapters_included": manifest["chapters_included"],
        "chapters_missing": manifest["chapters_missing"],
        "output_path": manifest.get("output_path"),
        "output_bytes": manifest.get("output_bytes", 0),
        "error_message": manifest.get("error_message"),
        "created_at": manifest["created_at"],
    }


def _latest_full_audio_manifest(project_id: str) -> dict | None:
    root = _full_audio_root(project_id)
    if not root.exists():
        return None
    manifests = sorted(
        root.glob("*/manifest.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    return _read_full_audio_manifest(manifests[0]) if manifests else None


@router.post("/projects", response_model=ProjectRead)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    return projects.create_project(db, payload.title, payload.book_title)


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)):
    return projects.list_projects(db)


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, db: Session = Depends(get_db)):
    return _project_or_404(db, project_id)


@router.post("/projects/{project_id}/pdf/local", response_model=ProjectRead)
def import_local_pdf(
    project_id: str, payload: LocalPdfImport, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    pdf_path = Path(payload.pdf_path)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    if pdf_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=422, detail="File must be a PDF")
    return projects.import_pdf_from_path(db, project, pdf_path)


@router.post("/projects/{project_id}/pdf/upload", response_model=ProjectRead)
async def upload_pdf(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = _project_or_404(db, project_id)
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="File must be a PDF")
    content = await file.read()
    return projects.save_uploaded_pdf(db, project, file.filename, content)


@router.post("/projects/{project_id}/parse", response_model=ParseRunRead)
def parse_project(project_id: str, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    if not project.source_pdf_path:
        raise HTTPException(status_code=422, detail="Project has no source PDF")

    try:
        result = DocumentParserWorkflow().parse(Path(project.source_pdf_path))
        return projects.save_parse_result(db, project, result)
    except RuntimeError as exc:
        run = projects.save_parse_failure(db, project, str(exc))
        raise HTTPException(status_code=422, detail=run.error_message) from exc


@router.get("/projects/{project_id}/chapters", response_model=list[ChapterRead])
def list_project_chapters(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    return projects.list_chapters(db, project_id)


@router.get(
    "/projects/{project_id}/chapters/production-status",
    response_model=list[ChapterProductionStatusRead],
)
def list_chapter_production_statuses(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    chapters = projects.list_chapters(db, project_id)
    return agents.list_chapter_production_statuses(db, project_id, chapters)


@router.post(
    "/projects/{project_id}/reader-insight",
    response_model=ReaderInsightRead,
)
async def generate_project_reader_insight(
    project_id: str,
    payload: ReaderInsightRequest,
    db: Session = Depends(get_db),
):
    project = _project_or_404(db, project_id)
    try:
        output = await ChapterAgents().analyze_reader_insight(payload.input_text)
    except (RuntimeError, AgentJsonError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _reader_insight_response(
        agents.save_reader_insight(
            db,
            project,
            payload.input_text,
            output.content,
            output.raw,
        )
    )


@router.get(
    "/projects/{project_id}/reader-insight/latest",
    response_model=ReaderInsightRead,
)
def get_latest_project_reader_insight(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    insight = agents.latest_reader_insight(db, project_id)
    if insight is None:
        raise HTTPException(status_code=404, detail="Reader insight not found")
    return _reader_insight_response(insight)


@router.post(
    "/projects/{project_id}/book-profile",
    response_model=BookProfileRead,
)
async def generate_project_book_profile(project_id: str, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    reader_insight = agents.latest_reader_insight(db, project_id)
    reader_content = json.loads(reader_insight.content_json) if reader_insight else None
    try:
        output = await ChapterAgents().profile_book(
            project.book_title or project.title,
            _project_chapter_overview(db, project_id),
            reader_content,
        )
    except (RuntimeError, AgentJsonError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _book_profile_response(
        agents.save_book_profile(db, project, reader_insight, output.content, output.raw)
    )


@router.get(
    "/projects/{project_id}/book-profile/latest",
    response_model=BookProfileRead,
)
def get_latest_project_book_profile(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    profile = agents.latest_book_profile(db, project_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Book profile not found")
    return _book_profile_response(profile)


@router.post(
    "/projects/{project_id}/audio/full",
    response_model=FullAudioTaskRead,
)
def build_project_full_audio(
    project_id: str,
    payload: FullAudioBuildRequest | None = None,
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    payload = payload or FullAudioBuildRequest()
    chapters = projects.list_chapters(db, project_id)
    if not chapters:
        raise HTTPException(status_code=422, detail="No chapters to merge")

    included = []
    missing = []
    for chapter in chapters:
        task = agents.latest_tts_task(db, project_id, chapter.id)
        if task and task.status == "success" and task.output_path and Path(task.output_path).exists():
            included.append((chapter, task))
        else:
            missing.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                }
            )

    if missing and not payload.allow_partial:
        raise HTTPException(
            status_code=422,
            detail=f"{len(missing)} chapters have no successful audio",
        )
    if not included:
        raise HTTPException(status_code=422, detail="No successful chapter audio to merge")

    task_id = str(uuid.uuid4())
    root = _full_audio_root(project_id) / task_id
    root.mkdir(parents=True, exist_ok=True)
    output_path = root / "full-podcast.mp3"
    manifest_path = root / "manifest.json"

    with output_path.open("wb") as output_file:
        for _chapter, task in included:
            output_file.write(Path(task.output_path).read_bytes())

    manifest = {
        "id": task_id,
        "project_id": project_id,
        "status": "success",
        "chapters_total": len(chapters),
        "chapters_included": len(included),
        "chapters_missing": len(missing),
        "chapters": [
            {
                "chapter_id": chapter.id,
                "chapter_number": chapter.chapter_number,
                "title": chapter.title,
                "tts_task_id": task.id,
                "source_path": task.output_path,
                "rounds_finished": task.rounds_finished,
                "rounds_total": task.rounds_total,
            }
            for chapter, task in included
        ],
        "missing_chapters": missing,
        "output_path": str(output_path),
        "output_bytes": output_path.stat().st_size,
        "error_message": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return _full_audio_response(manifest)


@router.get(
    "/projects/{project_id}/audio/full/latest",
    response_model=FullAudioTaskRead,
)
def get_latest_project_full_audio(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    manifest = _latest_full_audio_manifest(project_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Full audio not found")
    return _full_audio_response(manifest)


@router.get("/projects/{project_id}/audio/full/{task_id}/file")
def get_project_full_audio_file(project_id: str, task_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    manifest_path = _full_audio_root(project_id) / task_id / "manifest.json"
    if not manifest_path.exists():
        raise HTTPException(status_code=404, detail="Full audio not found")
    manifest = _read_full_audio_manifest(manifest_path)
    output_path = Path(manifest.get("output_path") or "")
    if manifest.get("status") != "success" or not output_path.exists():
        raise HTTPException(status_code=422, detail="Full audio file is not ready")
    return FileResponse(output_path, media_type="audio/mpeg", filename="full-podcast.mp3")


@router.get("/projects/{project_id}/audio/chapters/export")
def export_project_chapter_audio(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    chapters = projects.list_chapters(db, project_id)
    if not chapters:
        raise HTTPException(status_code=422, detail="No chapters to export")

    included = []
    for chapter in chapters:
        task = agents.latest_tts_task(db, project_id, chapter.id)
        if task and task.status == "success" and task.output_path and Path(task.output_path).exists():
            included.append((chapter, task))
    if not included:
        raise HTTPException(status_code=422, detail="No successful chapter audio to export")

    export_id = str(uuid.uuid4())
    root = projects.project_root(project_id) / "exports"
    root.mkdir(parents=True, exist_ok=True)
    zip_path = root / f"chapter-mp3-{export_id}.zip"

    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as archive:
        manifest = {
            "id": export_id,
            "project_id": project_id,
            "created_at": datetime.utcnow().isoformat(),
            "chapters_total": len(chapters),
            "chapters_included": len(included),
            "files": [],
        }
        for chapter, task in included:
            safe_title = "".join(
                char if char.isalnum() or char in (" ", "-", "_") else "_"
                for char in chapter.title
            ).strip()[:60]
            filename = f"chapter-{chapter.chapter_number:03d}-{safe_title or chapter.id}.mp3"
            archive.write(Path(task.output_path), arcname=filename)
            manifest["files"].append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "filename": filename,
                    "tts_task_id": task.id,
                }
            )
        archive.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2),
        )

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="chapter-mp3.zip",
    )


@router.post(
    "/projects/{project_id}/chapters/script-batch",
    response_model=BatchScriptResult,
)
async def generate_project_script_batch(
    project_id: str,
    payload: BatchScriptRequest | None = None,
    db: Session = Depends(get_db),
):
    started_at = time.perf_counter()
    project = _project_or_404(db, project_id)
    payload = payload or BatchScriptRequest()
    chapters = projects.list_chapters(db, project_id)
    if payload.chapter_ids:
        selected = set(payload.chapter_ids)
        chapters = [chapter for chapter in chapters if chapter.id in selected]
    elif payload.failed_only:
        chapters = [
            chapter
            for chapter in chapters
            if not agents.list_script_blocks(db, project_id, chapter.id)
        ]
    if not chapters:
        raise HTTPException(status_code=422, detail="No chapters to generate")

    results = []
    for chapter in chapters:
        existing_blocks = agents.list_script_blocks(db, project_id, chapter.id)
        if payload.skip_existing and existing_blocks:
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "skipped",
                    "script_blocks": len(existing_blocks),
                    "error_message": None,
                }
            )
            continue

        try:
            _analysis, _plan, saved = await _ensure_script_pipeline(db, project, chapter)
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "success",
                    "script_blocks": len(saved),
                    "error_message": None,
                }
            )
        except (RuntimeError, AgentJsonError, KeyError, ValueError) as exc:
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "failed",
                    "script_blocks": 0,
                    "error_message": str(exc),
                }
            )

    return {
        "project_id": project_id,
        "total": len(results),
        "succeeded": sum(1 for item in results if item["status"] == "success"),
        "skipped": sum(1 for item in results if item["status"] == "skipped"),
        "failed": sum(1 for item in results if item["status"] == "failed"),
        "elapsed_seconds": round(time.perf_counter() - started_at, 2),
        "failed_chapter_ids": [
            item["chapter_id"] for item in results if item["status"] == "failed"
        ],
        "results": results,
    }


@router.post(
    "/projects/{project_id}/chapters/tts-batch",
    response_model=BatchTTSResult,
)
async def generate_project_tts_batch(
    project_id: str,
    payload: BatchTTSRequest | None = None,
    db: Session = Depends(get_db),
):
    started_at = time.perf_counter()
    project = _project_or_404(db, project_id)
    payload = payload or BatchTTSRequest()
    chapters = projects.list_chapters(db, project_id)
    if payload.chapter_ids:
        selected = set(payload.chapter_ids)
        chapters = [chapter for chapter in chapters if chapter.id in selected]
    elif payload.failed_only:
        chapters = [
            chapter
            for chapter in chapters
            if (
                (latest_task := agents.latest_tts_task(db, project_id, chapter.id))
                and latest_task.status == "failed"
            )
        ]
    if not chapters:
        raise HTTPException(status_code=422, detail="No chapters to generate")

    results = []
    for chapter in chapters:
        blocks = agents.list_script_blocks(db, project_id, chapter.id)
        latest_task = agents.latest_tts_task(db, project_id, chapter.id)

        if payload.skip_existing_success and latest_task and latest_task.status == "success":
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "skipped",
                    "tts_task_id": latest_task.id,
                    "rounds_finished": latest_task.rounds_finished,
                    "rounds_total": latest_task.rounds_total,
                    "error_message": None,
                }
            )
            continue

        if not blocks:
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "skipped",
                    "tts_task_id": None,
                    "rounds_finished": 0,
                    "rounds_total": 0,
                    "error_message": "No script blocks",
                }
            )
            continue

        if not agents.chapter_script_is_confirmed(db, project_id, chapter.id):
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "skipped",
                    "tts_task_id": None,
                    "rounds_finished": 0,
                    "rounds_total": len(blocks),
                    "error_message": "Script not confirmed",
                }
            )
            continue

        try:
            task = await _run_tts_generation(db, project, chapter)
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "success" if task.status == "success" else "failed",
                    "tts_task_id": task.id,
                    "rounds_finished": task.rounds_finished,
                    "rounds_total": task.rounds_total,
                    "error_message": task.error_message,
                }
            )
        except HTTPException as exc:
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "failed",
                    "tts_task_id": None,
                    "rounds_finished": 0,
                    "rounds_total": len(blocks),
                    "error_message": str(exc.detail),
                }
            )

    return {
        "project_id": project_id,
        "total": len(results),
        "succeeded": sum(1 for item in results if item["status"] == "success"),
        "skipped": sum(1 for item in results if item["status"] == "skipped"),
        "failed": sum(1 for item in results if item["status"] == "failed"),
        "elapsed_seconds": round(time.perf_counter() - started_at, 2),
        "failed_chapter_ids": [
            item["chapter_id"] for item in results if item["status"] == "failed"
        ],
        "results": results,
    }


@router.post(
    "/projects/{project_id}/chapters/script-graph-batch",
    response_model=BatchScriptResult,
)
async def generate_project_script_graph_batch(
    project_id: str,
    payload: BatchScriptRequest | None = None,
    db: Session = Depends(get_db),
):
    started_at = time.perf_counter()
    _project_or_404(db, project_id)
    payload = payload or BatchScriptRequest()
    chapters = projects.list_chapters(db, project_id)
    if payload.chapter_ids:
        selected = set(payload.chapter_ids)
        chapters = [chapter for chapter in chapters if chapter.id in selected]
    elif payload.failed_only:
        chapters = [
            chapter
            for chapter in chapters
            if not agents.list_script_blocks(db, project_id, chapter.id)
        ]
    if not chapters:
        raise HTTPException(status_code=422, detail="No chapters to generate")

    results = []
    for chapter in chapters:
        existing_blocks = agents.list_script_blocks(db, project_id, chapter.id)
        if payload.skip_existing and existing_blocks:
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "skipped",
                    "script_blocks": len(existing_blocks),
                    "error_message": None,
                }
            )
            continue

        try:
            state = await run_chapter_content_graph(project_id, chapter.id, db=db)
            saved_blocks = agents.list_script_blocks(db, project_id, chapter.id)
            error_message = state.get("error")
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "failed" if error_message else "success",
                    "script_blocks": len(saved_blocks),
                    "error_message": error_message,
                }
            )
        except (RuntimeError, AgentJsonError, KeyError, ValueError) as exc:
            results.append(
                {
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "title": chapter.title,
                    "status": "failed",
                    "script_blocks": 0,
                    "error_message": str(exc),
                }
            )

    return {
        "project_id": project_id,
        "total": len(results),
        "succeeded": sum(1 for item in results if item["status"] == "success"),
        "skipped": sum(1 for item in results if item["status"] == "skipped"),
        "failed": sum(1 for item in results if item["status"] == "failed"),
        "elapsed_seconds": round(time.perf_counter() - started_at, 2),
        "failed_chapter_ids": [
            item["chapter_id"] for item in results if item["status"] == "failed"
        ],
        "results": results,
    }


@router.post("/projects/{project_id}/chapters", response_model=ChapterRead)
def create_project_chapter(
    project_id: str,
    payload: ChapterCreate,
    db: Session = Depends(get_db),
):
    project = _project_or_404(db, project_id)
    try:
        return projects.create_manual_chapter(
            db,
            project,
            title=payload.title,
            start_page=payload.start_page,
            end_page=payload.end_page,
            chapter_number=payload.chapter_number,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/projects/{project_id}/chapters/by-number/{chapter_number}", response_model=ChapterRead)
def get_chapter_by_number(
    project_id: str, chapter_number: int, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    chapter = agents.get_chapter_by_number(db, project_id, chapter_number)
    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/text",
    response_model=ChapterTextRead,
)
def get_project_chapter_text(
    project_id: str,
    chapter_id: str,
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    try:
        text = agents.read_chapter_text(chapter)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "chapter_id": chapter.id,
        "title": chapter.title,
        "text": text,
        "chars": len(text),
        "chars_no_whitespace": len("".join(text.split())),
        "text_path": chapter.text_path,
    }


@router.delete("/projects/{project_id}/chapters/{chapter_id}", response_model=list[ChapterRead])
def delete_project_chapter(
    project_id: str,
    chapter_id: str,
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    return projects.delete_chapter(db, project_id, chapter)


@router.patch("/projects/{project_id}/chapters/{chapter_id}", response_model=ChapterRead)
def update_project_chapter(
    project_id: str,
    chapter_id: str,
    payload: ChapterUpdate,
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    try:
        return projects.update_chapter(
            db,
            chapter,
            title=payload.title,
            start_page=payload.start_page,
            end_page=payload.end_page,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/merge-next",
    response_model=ChapterRead,
)
def merge_project_chapter_with_next(
    project_id: str,
    chapter_id: str,
    db: Session = Depends(get_db),
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    try:
        return projects.merge_chapter_with_next(db, project, chapter)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/projects/{project_id}/parse-runs/latest", response_model=ParseRunRead)
def latest_project_parse_run(project_id: str, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    run = projects.latest_parse_run(db, project_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Parse run not found")
    return run


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/analysis",
    response_model=AnalysisReportRead,
)
async def generate_chapter_analysis(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    chapter_text = agents.read_chapter_text(chapter)
    try:
        output = await ChapterAgents().analyze_chapter(
            chapter.title, chapter_text, _quality_context(db, project_id)
        )
    except (RuntimeError, AgentJsonError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _analysis_response(
        agents.save_analysis_report(db, project, chapter, output.content, output.raw)
    )


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/analysis/latest",
    response_model=AnalysisReportRead,
)
def get_latest_chapter_analysis(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    report = agents.latest_analysis_report(db, project_id, chapter_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Analysis report not found")
    return _analysis_response(report)


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/plan",
    response_model=PodcastPlanRead,
)
async def generate_chapter_plan(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    analysis = agents.latest_analysis_report(db, project_id, chapter_id)
    if analysis is None:
        raise HTTPException(status_code=422, detail="Generate analysis first")
    try:
        output = await ChapterAgents().create_podcast_plan(
            chapter.title,
            json.loads(analysis.content_json),
            _quality_context(db, project_id),
        )
    except (RuntimeError, AgentJsonError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _plan_response(
        agents.save_podcast_plan(db, project, chapter, analysis, output.content, output.raw)
    )


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/plan/latest",
    response_model=PodcastPlanRead,
)
def get_latest_chapter_plan(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    plan = agents.latest_podcast_plan(db, project_id, chapter_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Podcast plan not found")
    return _plan_response(plan)


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/script",
    response_model=list[ScriptBlockRead],
)
async def generate_chapter_script(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    analysis = agents.latest_analysis_report(db, project_id, chapter_id)
    plan = agents.latest_podcast_plan(db, project_id, chapter_id)
    if analysis is None:
        raise HTTPException(status_code=422, detail="Generate analysis first")
    if plan is None:
        raise HTTPException(status_code=422, detail="Generate podcast plan first")
    try:
        output = await ChapterAgents().write_script_blocks(
            chapter.title,
            json.loads(analysis.content_json),
            json.loads(plan.content_json),
            _quality_context(db, project_id),
        )
    except (RuntimeError, AgentJsonError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return [
        _script_block_response(block)
        for block in agents.save_script_blocks(
            db, project, chapter, plan, output.content["blocks"]
        )
    ]


@router.post("/projects/{project_id}/chapters/{chapter_id}/script-pipeline")
async def generate_chapter_script_pipeline(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    chapter_text = agents.read_chapter_text(chapter)
    chapter_agents = ChapterAgents()
    quality_context = _quality_context(db, project_id)

    try:
        analysis_output = await chapter_agents.analyze_chapter(
            chapter.title, chapter_text, quality_context
        )
        analysis = agents.save_analysis_report(
            db, project, chapter, analysis_output.content, analysis_output.raw
        )

        plan_output = await chapter_agents.create_podcast_plan(
            chapter.title, analysis_output.content, quality_context
        )
        plan = agents.save_podcast_plan(
            db, project, chapter, analysis, plan_output.content, plan_output.raw
        )

        script_output = await chapter_agents.write_script_blocks(
            chapter.title,
            analysis_output.content,
            plan_output.content,
            quality_context,
        )
        saved = agents.save_script_blocks(
            db, project, chapter, plan, script_output.content["blocks"]
        )
    except (RuntimeError, AgentJsonError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "analysis": _analysis_response(analysis),
        "plan": _plan_response(plan),
        "script_blocks": [_script_block_response(block) for block in saved],
    }


@router.post("/projects/{project_id}/chapters/{chapter_id}/script-graph")
async def generate_chapter_script_graph(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)

    try:
        state = await run_chapter_content_graph(project_id, chapter_id, db=db)
    except (RuntimeError, AgentJsonError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "project_id": project_id,
        "chapter_id": chapter_id,
        "book_type": state.get("book_type"),
        "analysis": state.get("analysis"),
        "plan": state.get("podcast_plan"),
        "script_blocks": [
            _script_block_response(block)
            for block in agents.list_script_blocks(db, project_id, chapter_id)
        ],
        "review_report": state.get("review_report"),
        "review_passed": state.get("review_passed", False),
        "retry_count": state.get("retry_count", 0),
        "max_retries": state.get("max_retries", 2),
        "next_action": state.get("next_action"),
        "error": state.get("error"),
        "saved_artifact_ids": state.get("saved_artifact_ids", {}),
    }


@router.post("/projects/{project_id}/chapters/{chapter_id}/podcast-pipeline")
async def generate_chapter_podcast_pipeline(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)

    try:
        analysis, plan, saved = await _ensure_script_pipeline(db, project, chapter)
        confirmed = agents.confirm_chapter_script(db, project_id, chapter_id)
        tts_task = await _run_tts_generation(db, project, chapter)
    except (RuntimeError, AgentJsonError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "analysis": _analysis_response(analysis),
        "plan": _plan_response(plan),
        "script_blocks": [_script_block_response(block) for block in confirmed or saved],
        "tts_task": _tts_task_response(tts_task),
    }


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/script-review",
    response_model=ScriptReviewReportRead,
)
async def generate_chapter_script_review(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    blocks = agents.list_script_blocks(db, project_id, chapter_id)
    if not blocks:
        raise HTTPException(status_code=422, detail="Generate script blocks first")
    analysis = agents.latest_analysis_report(db, project_id, chapter_id)
    plan = agents.latest_podcast_plan(db, project_id, chapter_id)
    block_payload = [
        {
            "block_index": block.block_index,
            "speaker": block.speaker,
            "speaker_role": block.speaker_role,
            "text": block.text,
            "estimated_seconds": block.estimated_seconds,
            "locked": block.locked,
            "status": block.status,
            "source_refs": _coerce_source_refs(json.loads(block.source_refs_json or "[]")),
        }
        for block in blocks
    ]

    try:
        output = await ChapterAgents().review_script(
            chapter.title,
            json.loads(analysis.content_json) if analysis else None,
            json.loads(plan.content_json) if plan else None,
            block_payload,
            _quality_context(db, project_id),
        )
    except (RuntimeError, AgentJsonError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _script_review_response(
        agents.save_script_review_report(db, project, chapter, output.content, output.raw)
    )


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/script-review/latest",
    response_model=ScriptReviewReportRead,
)
def get_latest_chapter_script_review(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    report = agents.latest_script_review_report(db, project_id, chapter_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Script review report not found")
    return _script_review_response(report)


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/script-blocks",
    response_model=list[ScriptBlockRead],
)
def list_chapter_script_blocks(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    return [
        _script_block_response(block)
        for block in agents.list_script_blocks(db, project_id, chapter_id)
    ]


@router.patch(
    "/projects/{project_id}/chapters/{chapter_id}/script-blocks/{block_id}",
    response_model=ScriptBlockRead,
)
def update_chapter_script_block(
    project_id: str,
    chapter_id: str,
    block_id: str,
    payload: ScriptBlockUpdate,
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    block = _script_block_or_404(db, project_id, chapter_id, block_id)
    try:
        updated = agents.update_script_block(
            db,
            block,
            text=payload.text,
            speech_rate=payload.speech_rate,
            emotion=payload.emotion,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _script_block_response(updated)


@router.patch(
    "/projects/{project_id}/chapters/{chapter_id}/script-blocks/{block_id}/lock",
    response_model=ScriptBlockRead,
)
def set_chapter_script_block_lock(
    project_id: str,
    chapter_id: str,
    block_id: str,
    payload: ScriptBlockLockUpdate,
    db: Session = Depends(get_db),
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    block = _script_block_or_404(db, project_id, chapter_id, block_id)
    return _script_block_response(
        agents.set_script_block_locked(db, block, payload.locked)
    )


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/script/confirm",
    response_model=list[ScriptBlockRead],
)
def confirm_chapter_script(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    try:
        blocks = agents.confirm_chapter_script(db, project_id, chapter_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return [_script_block_response(block) for block in blocks]


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/tts/preview-payload",
    response_model=TTSPayloadPreview,
)
def preview_chapter_tts_payload(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    blocks = agents.list_script_blocks(db, project_id, chapter_id)
    if not blocks:
        raise HTTPException(status_code=422, detail="Generate script blocks first")
    if not agents.chapter_script_is_confirmed(db, project_id, chapter_id):
        raise HTTPException(status_code=422, detail="Confirm script before TTS")

    input_id = f"{project_id}_chapter_{chapter.chapter_number:03d}"
    try:
        payload = PodcastTTSPackager().build_payload(
            input_id,
            [
                TTSScriptBlock(speaker=block.speaker, text=block.text)
                for block in blocks
            ],
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "project_id": project_id,
        "chapter_id": chapter_id,
        "input_id": input_id,
        "script_blocks": len(blocks),
        "payload": payload,
    }


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/tts/generate",
    response_model=TTSTaskRead,
)
async def generate_chapter_tts(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    project = _project_or_404(db, project_id)
    chapter = _chapter_or_404(db, project_id, chapter_id)
    return _tts_task_response(await _run_tts_generation(db, project, chapter))


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/tts/tasks",
    response_model=list[TTSTaskRead],
)
def list_chapter_tts_tasks(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    return [
        _tts_task_response(task)
        for task in agents.list_tts_tasks(db, project_id, chapter_id)
    ]


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/tts/tasks/latest",
    response_model=TTSTaskRead,
)
def get_latest_chapter_tts_task(
    project_id: str, chapter_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    task = agents.latest_tts_task(db, project_id, chapter_id)
    if task is None:
        raise HTTPException(status_code=404, detail="TTS task not found")
    return _tts_task_response(task)


@router.get("/projects/{project_id}/chapters/{chapter_id}/tts/tasks/{task_id}/audio")
def get_chapter_tts_audio(
    project_id: str, chapter_id: str, task_id: str, db: Session = Depends(get_db)
):
    _project_or_404(db, project_id)
    _chapter_or_404(db, project_id, chapter_id)
    task = _tts_task_or_404(db, project_id, chapter_id, task_id)
    if task.status != "success" or not task.output_path:
        raise HTTPException(status_code=422, detail="TTS audio is not ready")
    output_path = Path(task.output_path)
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="TTS audio file not found")
    return FileResponse(output_path, media_type="audio/mpeg", filename="chapter.mp3")


@router.post("/document/parse")
def parse_document(request: ParsePdfRequest) -> dict:
    pdf_path = Path(request.pdf_path)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")

    try:
        result = DocumentParserWorkflow().parse(pdf_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return result.model_dump()

