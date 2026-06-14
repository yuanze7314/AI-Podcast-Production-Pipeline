import asyncio
import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.models import Chapter
from app.db.session import Base
from app.repositories import agents, projects
from app.services.chapter_agents import AgentOutput


@pytest.fixture()
def db_session(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "app_storage_dir", str(tmp_path / "storage"))
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def create_project_with_chapter(db_session, tmp_path):
    project = projects.create_project(db_session, "Graph Smoke", "测试书")
    text_path = tmp_path / "chapter.txt"
    text_path.write_text("这是一个关于习惯、反馈和行动循环的章节。", encoding="utf-8")
    chapter = Chapter(
        id="chapter-001",
        project_id=project.id,
        chapter_number=1,
        title="第一章 习惯循环",
        start_page=1,
        end_page=10,
        source="test",
        confidence=1.0,
        chars_no_whitespace=20,
        preview="习惯循环",
        text_path=str(text_path),
    )
    db_session.add(chapter)
    db_session.commit()
    db_session.refresh(chapter)
    return project, chapter


class FakeChapterAgents:
    async def analyze_chapter(self, chapter_title, chapter_text, quality_context=None, mode=None):
        return AgentOutput(
            {
                "chapter_title": chapter_title,
                "summary": "习惯通过反馈循环被强化。",
                "core_arguments": ["行动需要清晰提示"],
                "key_examples": ["早起记录"],
                "mode": mode,
            },
            '{"summary":"ok"}',
        )

    async def write_script_blocks(
        self, chapter_title, analysis, plan, quality_context=None, mode=None
    ):
        return AgentOutput(
            {
                "blocks": [
                    {
                        "speaker": "Alice",
                        "speaker_role": "host",
                        "text": "我们先从习惯循环聊起。",
                        "estimated_seconds": 8,
                        "source_refs": [{"note": "opening"}],
                    },
                    {
                        "speaker": "Dr_Ye",
                        "speaker_role": "advisor_friend",
                        "text": "关键是让提示更容易被看见。",
                        "estimated_seconds": 10,
                        "source_refs": [{"note": "argument"}],
                    },
                ]
            },
            '{"blocks":[]}',
        )

    async def review_script(
        self, chapter_title, analysis, plan, blocks, quality_context=None, mode=None
    ):
        return AgentOutput(
            {
                "overall_score": 92,
                "pass_review": True,
                "issues": [],
                "suggested_edits": [],
                "do_not_change": [],
            },
            '{"pass_review":true}',
        )


class FakeProfilingChapterAgents(FakeChapterAgents):
    async def profile_book(self, book_title, chapter_overview, reader_insight=None):
        return AgentOutput(
            {
                "book_type": "concept",
                "confidence": 0.88,
                "reason": "章节围绕概念解释展开",
                "tone_guidelines": ["清楚解释"],
                "quality_rules": ["保留边界"],
            },
            '{"book_type":"concept"}',
        )


def test_book_type_router_routes_known_and_unknown_types():
    from app.graphs.routers import route_by_book_type

    assert route_by_book_type({"book_type": "concept"}) == "concept_flow"
    assert route_by_book_type({"book_type": "concept_explainer"}) == "concept_flow"
    assert route_by_book_type({"book_type": "narrative_story"}) == "narrative_flow"
    assert route_by_book_type({"book_type": "research_report"}) == "report_flow"
    assert route_by_book_type({"book_type": "unknown"}) == "fallback_flow"
    assert route_by_book_type({}) == "fallback_flow"


def test_review_router_respects_pass_retry_and_human_review_paths():
    from app.graphs.routers import route_by_review_result

    assert route_by_review_result({"review_passed": True}) == "save_script"
    assert (
        route_by_review_result(
            {"review_passed": False, "retry_count": 1, "max_retries": 2}
        )
        == "rewrite_script"
    )
    assert (
        route_by_review_result(
            {"review_passed": False, "retry_count": 2, "max_retries": 2}
        )
        == "human_review_required"
    )


def test_run_chapter_content_graph_saves_single_chapter_artifacts(db_session, tmp_path):
    from app.graphs.chapter_content_graph import run_chapter_content_graph

    project, chapter = create_project_with_chapter(db_session, tmp_path)

    state = asyncio.run(
        run_chapter_content_graph(
            project.id,
            chapter.id,
            db=db_session,
            chapter_agents=FakeChapterAgents(),
        )
    )

    assert state["project_id"] == project.id
    assert state["chapter_id"] == chapter.id
    assert state["chapter_text"].startswith("这是一个关于习惯")
    assert state["book_type"] == "fallback"
    assert state["analysis"]["summary"] == "习惯通过反馈循环被强化。"
    assert state["podcast_plan"]["target_duration_seconds"] == 210
    assert state["review_passed"] is True
    assert state["next_action"] == "human_confirm_script"
    assert state["saved_artifact_ids"]["analysis_report_id"]
    assert state["saved_artifact_ids"]["podcast_plan_id"]
    assert state["saved_artifact_ids"]["script_review_report_id"]

    saved_blocks = agents.list_script_blocks(db_session, project.id, chapter.id)
    assert [block.speaker for block in saved_blocks] == ["Alice", "Dr_Ye"]
    assert json.loads(saved_blocks[0].tts_params_json)["encoding"] == "mp3"


def test_graph_save_preserves_locked_or_confirmed_script_blocks(db_session, tmp_path):
    from app.graphs.chapter_content_graph import run_chapter_content_graph

    project, chapter = create_project_with_chapter(db_session, tmp_path)
    plan = agents.save_podcast_plan(
        db_session,
        project,
        chapter,
        None,
        {"tone": "existing"},
        '{"tone":"existing"}',
    )
    existing = agents.save_script_blocks(
        db_session,
        project,
        chapter,
        plan,
        [
            {
                "speaker": "Alice",
                "speaker_role": "host",
                "text": "用户已经确认的脚本。",
                "voice_id": settings.voice_alice,
                "tts_params": {"encoding": "mp3", "sample_rate": 24000, "speech_rate": 0},
                "estimated_seconds": 10,
                "locked": True,
                "status": "confirmed",
                "source_refs": [],
            }
        ],
    )

    state = asyncio.run(
        run_chapter_content_graph(
            project.id,
            chapter.id,
            db=db_session,
            chapter_agents=FakeChapterAgents(),
        )
    )

    saved_blocks = agents.list_script_blocks(db_session, project.id, chapter.id)
    assert len(saved_blocks) == 1
    assert saved_blocks[0].id == existing[0].id
    assert saved_blocks[0].text == "用户已经确认的脚本。"
    assert saved_blocks[0].locked is True
    assert saved_blocks[0].status == "confirmed"
    assert state["script_blocks"][0]["text"] == "用户已经确认的脚本。"
    assert state["next_action"] == "human_confirm_script"


def test_run_chapter_content_graph_saves_generated_book_profile(db_session, tmp_path):
    from app.graphs.chapter_content_graph import run_chapter_content_graph

    project, chapter = create_project_with_chapter(db_session, tmp_path)

    state = asyncio.run(
        run_chapter_content_graph(
            project.id,
            chapter.id,
            db=db_session,
            chapter_agents=FakeProfilingChapterAgents(),
        )
    )

    profile = agents.latest_book_profile(db_session, project.id)
    assert state["book_type"] == "concept"
    assert state["saved_artifact_ids"]["book_profile_id"] == profile.id
    assert json.loads(profile.content_json)["confidence"] == 0.88
