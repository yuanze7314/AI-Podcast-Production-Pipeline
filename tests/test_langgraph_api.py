import json

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.models import Chapter
from app.db.session import Base, get_db
from app.main import app
from app.repositories import agents, projects


def test_script_graph_endpoint_returns_graph_summary_and_script_blocks(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "app_storage_dir", str(tmp_path / "storage"))
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()

    project = projects.create_project(db, "Graph API", "测试书")
    text_path = tmp_path / "chapter.txt"
    text_path.write_text("章节正文", encoding="utf-8")
    chapter = Chapter(
        id="chapter-api",
        project_id=project.id,
        chapter_number=1,
        title="第一章",
        start_page=1,
        end_page=1,
        source="test",
        confidence=1.0,
        chars_no_whitespace=4,
        preview="章节正文",
        text_path=str(text_path),
    )
    db.add(chapter)
    db.commit()
    project_id = project.id
    chapter_id = chapter.id

    async def fake_run_chapter_content_graph(project_id, chapter_id, *, db, **_kwargs):
        plan = agents.save_podcast_plan(
            db,
            project,
            chapter,
            None,
            {"tone": "api"},
            '{"tone":"api"}',
        )
        blocks = agents.save_script_blocks(
            db,
            project,
            chapter,
            plan,
            [
                {
                    "speaker": "Alice",
                    "speaker_role": "host",
                    "text": "从这里开始。",
                    "voice_id": settings.voice_alice,
                    "tts_params": {
                        "encoding": "mp3",
                        "sample_rate": 24000,
                        "speech_rate": 0,
                    },
                    "estimated_seconds": 6,
                    "source_refs": [],
                }
            ],
        )
        return {
            "project_id": project_id,
            "chapter_id": chapter_id,
            "book_type": "concept",
            "analysis": {"summary": "ok"},
            "podcast_plan": {"tone": "api"},
            "review_report": {"pass_review": True},
            "review_passed": True,
            "retry_count": 0,
            "next_action": "human_confirm_script",
            "saved_artifact_ids": {
                "podcast_plan_id": plan.id,
                "script_block_ids": [block.id for block in blocks],
            },
        }

    from app.api import routes

    monkeypatch.setattr(
        routes, "run_chapter_content_graph", fake_run_chapter_content_graph
    )

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = TestClient(app).post(
            f"/api/projects/{project_id}/chapters/{chapter_id}/script-graph"
        )
        persisted_blocks = agents.list_script_blocks(db, project_id, chapter_id)
    finally:
        app.dependency_overrides.clear()
        db.close()

    assert response.status_code == 200
    payload = response.json()
    assert payload["book_type"] == "concept"
    assert payload["review_passed"] is True
    assert payload["retry_count"] == 0
    assert payload["next_action"] == "human_confirm_script"
    assert payload["analysis"] == {"summary": "ok"}
    assert payload["plan"] == {"tone": "api"}
    assert payload["review_report"] == {"pass_review": True}
    assert payload["saved_artifact_ids"]["podcast_plan_id"]
    assert payload["script_blocks"][0]["speaker"] == "Alice"
    assert payload["script_blocks"][0]["tts_params_json"]["encoding"] == "mp3"
    assert json.loads(persisted_blocks[0].tts_params_json)["encoding"] == "mp3"


def test_script_graph_batch_endpoint_runs_langgraph_for_selected_chapters(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "app_storage_dir", str(tmp_path / "storage"))
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()

    project = projects.create_project(db, "Graph Batch API", "测试书")
    chapters = []
    for index in range(1, 3):
        text_path = tmp_path / f"chapter-{index}.txt"
        text_path.write_text(f"第 {index} 章正文", encoding="utf-8")
        chapter = Chapter(
            id=f"chapter-batch-{index}",
            project_id=project.id,
            chapter_number=index,
            title=f"第 {index} 章",
            start_page=index,
            end_page=index,
            source="test",
            confidence=1.0,
            chars_no_whitespace=5,
            preview="章节正文",
            text_path=str(text_path),
        )
        db.add(chapter)
        chapters.append(chapter)
    db.commit()
    project_id = project.id
    chapter_ids = [chapter.id for chapter in chapters]
    called_chapter_ids = []

    async def fake_run_chapter_content_graph(project_id, chapter_id, *, db, **_kwargs):
        called_chapter_ids.append(chapter_id)
        chapter = next(item for item in chapters if item.id == chapter_id)
        plan = agents.save_podcast_plan(
            db,
            project,
            chapter,
            None,
            {"tone": "graph-batch"},
            '{"tone":"graph-batch"}',
        )
        blocks = agents.save_script_blocks(
            db,
            project,
            chapter,
            plan,
            [
                {
                    "speaker": "Alice",
                    "speaker_role": "host",
                    "text": f"{chapter.title} LangGraph 脚本。",
                    "voice_id": settings.voice_alice,
                    "tts_params": {
                        "encoding": "mp3",
                        "sample_rate": 24000,
                        "speech_rate": 0,
                    },
                    "estimated_seconds": 6,
                    "source_refs": [],
                }
            ],
        )
        return {
            "project_id": project_id,
            "chapter_id": chapter_id,
            "book_type": "concept",
            "review_passed": True,
            "retry_count": 0,
            "next_action": "human_confirm_script",
            "saved_artifact_ids": {"script_block_ids": [block.id for block in blocks]},
        }

    from app.api import routes

    monkeypatch.setattr(
        routes, "run_chapter_content_graph", fake_run_chapter_content_graph
    )

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = TestClient(app).post(
            f"/api/projects/{project_id}/chapters/script-graph-batch",
            json={"chapter_ids": chapter_ids, "skip_existing": False},
        )
        persisted_counts = [
            len(agents.list_script_blocks(db, project_id, chapter_id))
            for chapter_id in chapter_ids
        ]
    finally:
        app.dependency_overrides.clear()
        db.close()

    assert response.status_code == 200
    payload = response.json()
    assert called_chapter_ids == chapter_ids
    assert payload["project_id"] == project_id
    assert payload["total"] == 2
    assert payload["succeeded"] == 2
    assert payload["skipped"] == 0
    assert payload["failed"] == 0
    assert payload["failed_chapter_ids"] == []
    assert [item["status"] for item in payload["results"]] == ["success", "success"]
    assert [item["script_blocks"] for item in payload["results"]] == [1, 1]
    assert persisted_counts == [1, 1]
