from __future__ import annotations

import asyncio
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.models import Chapter
from app.db.session import Base
from app.graphs.chapter_content_graph import run_chapter_content_graph
from app.repositories import agents, projects
from app.services.chapter_agents import AgentOutput


class RetrySmokeAgents:
    def __init__(self) -> None:
        self.review_calls = 0
        self.rewrite_calls = 0

    async def analyze_chapter(self, chapter_title, chapter_text, quality_context=None, mode=None):
        return AgentOutput(
            {"chapter_title": chapter_title, "summary": "需要先失败再改写。"},
            '{"summary":"retry"}',
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
                        "text": "这段故意比较粗糙。",
                        "estimated_seconds": 6,
                        "source_refs": [],
                    }
                ]
            },
            '{"blocks":[]}',
        )

    async def review_script(
        self, chapter_title, analysis, plan, blocks, quality_context=None, mode=None
    ):
        self.review_calls += 1
        passed = self.review_calls > 1
        return AgentOutput(
            {
                "overall_score": 90 if passed else 55,
                "pass_review": passed,
                "issues": [] if passed else [{"block_index": 1, "issue": "不够清楚"}],
                "suggested_edits": [],
                "do_not_change": [],
            },
            json.dumps({"pass_review": passed}),
        )

    async def rewrite_script_blocks(
        self, chapter_title, analysis, plan, blocks, revision_issues, quality_context=None, mode=None
    ):
        self.rewrite_calls += 1
        return AgentOutput(
            {
                "blocks": [
                    {
                        "speaker": "Dr_Ye",
                        "speaker_role": "advisor_friend",
                        "text": "改写后把问题解释清楚。",
                        "estimated_seconds": 8,
                        "source_refs": [{"note": "rewrite"}],
                    }
                ]
            },
            '{"blocks":[]}',
        )


def main() -> None:
    with TemporaryDirectory() as temp_dir:
        settings.app_storage_dir = str(Path(temp_dir) / "storage")
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        db = Session()
        try:
            project = projects.create_project(db, "LangGraph retry smoke", "测试书")
            text_path = Path(temp_dir) / "chapter.txt"
            text_path.write_text("一段用于审核重写的章节正文。", encoding="utf-8")
            chapter = Chapter(
                id="retry-smoke-chapter",
                project_id=project.id,
                chapter_number=1,
                title="审核重写烟测",
                start_page=1,
                end_page=1,
                source="smoke",
                confidence=1.0,
                chars_no_whitespace=20,
                preview="审核重写烟测",
                text_path=str(text_path),
            )
            db.add(chapter)
            db.commit()

            retry_agents = RetrySmokeAgents()
            state = asyncio.run(
                run_chapter_content_graph(
                    project.id,
                    chapter.id,
                    db=db,
                    chapter_agents=retry_agents,
                    max_retries=2,
                )
            )
            saved_blocks = agents.list_script_blocks(db, project.id, chapter.id)
            assert retry_agents.rewrite_calls == 1
            assert state["retry_count"] == 1
            assert state["review_passed"] is True
            assert saved_blocks[0].speaker == "Dr_Ye"
            print("LangGraph review retry smoke passed")
        finally:
            db.close()


if __name__ == "__main__":
    main()
