from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import AnalysisReport, PodcastPlan, ScriptBlock
from app.graphs.state import PodcastGraphState
from app.repositories import agents, projects


def _json_content(model) -> dict[str, Any] | None:
    if model is None:
        return None
    return json.loads(model.content_json)


def script_block_to_state(block: ScriptBlock) -> dict[str, Any]:
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
        "tts_params": json.loads(block.tts_params_json),
        "estimated_seconds": block.estimated_seconds,
        "locked": block.locked,
        "status": block.status,
        "source_refs": json.loads(block.source_refs_json or "[]"),
    }


def _quality_context(db: Session, project_id: str) -> dict[str, Any]:
    reader_insight = agents.latest_reader_insight(db, project_id)
    book_profile = agents.latest_book_profile(db, project_id)
    return {
        "reader_insight": _json_content(reader_insight),
        "book_profile": _json_content(book_profile),
    }


def load_project_context_node(state: PodcastGraphState, db: Session) -> PodcastGraphState:
    project_id = state["project_id"]
    project = projects.get_project(db, project_id)
    if project is None:
        raise ValueError("Project not found")
    return {
        "project_title": project.title,
        "book_title": project.book_title,
        "quality_context": _quality_context(db, project_id),
        "saved_artifact_ids": dict(state.get("saved_artifact_ids") or {}),
    }


def load_chapter_context_node(state: PodcastGraphState, db: Session) -> PodcastGraphState:
    project_id = state["project_id"]
    chapter_id = state["chapter_id"]
    chapter = agents.get_chapter(db, project_id, chapter_id)
    if chapter is None:
        raise ValueError("Chapter not found")
    return {
        "chapter_number": chapter.chapter_number,
        "chapter_title": chapter.title,
        "chapter_text": agents.read_chapter_text(chapter),
    }


def load_existing_artifacts_node(state: PodcastGraphState, db: Session) -> PodcastGraphState:
    project_id = state["project_id"]
    chapter_id = state["chapter_id"]
    analysis = agents.latest_analysis_report(db, project_id, chapter_id)
    plan = agents.latest_podcast_plan(db, project_id, chapter_id)
    review = agents.latest_script_review_report(db, project_id, chapter_id)
    book_profile = agents.latest_book_profile(db, project_id)
    blocks = agents.list_script_blocks(db, project_id, chapter_id)

    saved_ids = dict(state.get("saved_artifact_ids") or {})
    if analysis is not None:
        saved_ids["analysis_report_id"] = analysis.id
    if plan is not None:
        saved_ids["podcast_plan_id"] = plan.id
    if review is not None:
        saved_ids["script_review_report_id"] = review.id
    if book_profile is not None:
        saved_ids["book_profile_id"] = book_profile.id
    if blocks:
        saved_ids["script_block_ids"] = [block.id for block in blocks]

    update: PodcastGraphState = {"saved_artifact_ids": saved_ids}
    if analysis is not None:
        update["analysis"] = _json_content(analysis)
    if plan is not None:
        update["podcast_plan"] = _json_content(plan)
    if review is not None:
        review_content = _json_content(review)
        update["review_report"] = review_content
        update["review_passed"] = bool((review_content or {}).get("pass_review"))
    if book_profile is not None:
        update["book_profile"] = _json_content(book_profile)
    if blocks:
        update["script_blocks"] = [script_block_to_state(block) for block in blocks]
    return update


def reader_insight_node(state: PodcastGraphState, db: Session) -> PodcastGraphState:
    insight = agents.latest_reader_insight(db, state["project_id"])
    if insight is not None:
        return {"reader_insight": _json_content(insight)}
    return {
        "reader_insight": {
            "empty_input": True,
            "reader_concerns": [],
            "reader_questions": [],
            "script_opportunities": [],
            "avoid_list": [],
        }
    }


def build_podcast_plan_node(state: PodcastGraphState, mode: str) -> PodcastGraphState:
    if state.get("podcast_plan"):
        return {}

    analysis = state.get("analysis") or {}
    summary = analysis.get("summary") or analysis.get("chapter_summary") or ""
    tone_by_mode = {
        "concept": "清晰解释概念，保留论证层次",
        "narrative": "强调人物、事件、冲突和节奏",
        "report": "强调框架、数据、结论和边界",
        "fallback": "自然、清楚、适合双人播客",
    }
    plan = {
        "tone": tone_by_mode.get(mode, tone_by_mode["fallback"]),
        "target_duration_seconds": 210,
        "dialogue_goal": "把本章内容转成可理解、可讨论、可朗读的双人播客。",
        "beats": [
            {"name": "opening", "goal": "用一个具体问题进入本章"},
            {"name": "explain", "goal": summary[:120] or "解释本章核心内容"},
            {"name": "takeaway", "goal": "总结可带走的理解或行动"},
        ],
        "examples_to_include": analysis.get("key_examples", []),
        "highlights_to_include": analysis.get("quotable_points", []),
        "avoid_list": (state.get("reader_insight") or {}).get("avoid_list", []),
        "mode": mode,
    }
    return {"podcast_plan": plan}


def _latest_analysis(db: Session, project_id: str, chapter_id: str) -> AnalysisReport | None:
    return agents.latest_analysis_report(db, project_id, chapter_id)


def _latest_plan(db: Session, project_id: str, chapter_id: str) -> PodcastPlan | None:
    return agents.latest_podcast_plan(db, project_id, chapter_id)


def save_artifacts_node(state: PodcastGraphState, db: Session) -> PodcastGraphState:
    project = projects.get_project(db, state["project_id"])
    chapter = agents.get_chapter(db, state["project_id"], state["chapter_id"])
    if project is None or chapter is None:
        raise ValueError("Project or chapter not found")

    saved_ids = dict(state.get("saved_artifact_ids") or {})
    analysis_report = _latest_analysis(db, project.id, chapter.id)
    if state.get("book_profile") and not saved_ids.get("book_profile_id"):
        reader_insight = agents.latest_reader_insight(db, project.id)
        book_profile = agents.save_book_profile(
            db,
            project,
            reader_insight,
            state["book_profile"] or {},
            state.get("book_profile_raw")
            or json.dumps(state["book_profile"] or {}, ensure_ascii=False),
        )
        saved_ids["book_profile_id"] = book_profile.id

    if state.get("analysis") and not saved_ids.get("analysis_report_id"):
        analysis_report = agents.save_analysis_report(
            db,
            project,
            chapter,
            state["analysis"] or {},
            json.dumps(state["analysis"] or {}, ensure_ascii=False),
        )
        saved_ids["analysis_report_id"] = analysis_report.id

    plan = _latest_plan(db, project.id, chapter.id)
    if state.get("podcast_plan") and not saved_ids.get("podcast_plan_id"):
        plan = agents.save_podcast_plan(
            db,
            project,
            chapter,
            analysis_report,
            state["podcast_plan"] or {},
            json.dumps(state["podcast_plan"] or {}, ensure_ascii=False),
        )
        saved_ids["podcast_plan_id"] = plan.id

    blocks = agents.list_script_blocks(db, project.id, chapter.id)
    if state.get("script_blocks"):
        protected_blocks = [
            block for block in blocks if block.locked or block.status == "confirmed"
        ]
        if protected_blocks:
            saved_blocks = blocks
        elif not saved_ids.get("script_block_ids") or not blocks:
            saved_blocks = agents.save_script_blocks(
                db, project, chapter, plan, state["script_blocks"]
            )
        else:
            saved_blocks = blocks
        saved_ids["script_block_ids"] = [block.id for block in saved_blocks]
        script_blocks = [script_block_to_state(block) for block in saved_blocks]
    else:
        script_blocks = []

    if state.get("review_report") and not saved_ids.get("script_review_report_id"):
        review = agents.save_script_review_report(
            db,
            project,
            chapter,
            state["review_report"] or {},
            json.dumps(state["review_report"] or {}, ensure_ascii=False),
        )
        saved_ids["script_review_report_id"] = review.id

    next_action = state.get("next_action")
    if not next_action:
        next_action = (
            "human_confirm_script"
            if state.get("review_passed") is not False
            else "human_review_required"
        )

    return {
        "saved_artifact_ids": saved_ids,
        "script_blocks": script_blocks or state.get("script_blocks", []),
        "next_action": next_action,
    }


def human_review_required_node(state: PodcastGraphState) -> PodcastGraphState:
    return {"next_action": "human_review_required", "review_passed": False}
