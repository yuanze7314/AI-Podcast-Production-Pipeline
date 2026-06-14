from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.graphs.nodes import (
    book_profiler_node,
    build_podcast_plan_node,
    human_review_required_node,
    load_chapter_context_node,
    load_existing_artifacts_node,
    load_project_context_node,
    reader_insight_node,
    save_artifacts_node,
    script_review_node,
    script_rewrite_node,
    typed_analysis_node,
    typed_script_writer_node,
)
from app.graphs.routers import route_by_book_type, route_by_review_result
from app.graphs.state import PodcastGraphState
from app.services.chapter_agents import ChapterAgents


def build_chapter_content_graph(db: Session, chapter_agents) -> Any:
    graph = StateGraph(PodcastGraphState)

    async def profile_book(state: PodcastGraphState) -> PodcastGraphState:
        return await book_profiler_node(state, chapter_agents)

    async def load_project(state: PodcastGraphState) -> PodcastGraphState:
        return load_project_context_node(state, db)

    async def load_chapter(state: PodcastGraphState) -> PodcastGraphState:
        return load_chapter_context_node(state, db)

    async def load_existing(state: PodcastGraphState) -> PodcastGraphState:
        return load_existing_artifacts_node(state, db)

    async def load_reader_insight(state: PodcastGraphState) -> PodcastGraphState:
        return reader_insight_node(state, db)

    async def save_artifacts(state: PodcastGraphState) -> PodcastGraphState:
        return save_artifacts_node(state, db)

    def make_analysis_node(mode: str):
        async def analyze(state: PodcastGraphState) -> PodcastGraphState:
            return await typed_analysis_node(state, chapter_agents, mode)

        return analyze

    def make_script_node(mode: str):
        async def write_script(state: PodcastGraphState) -> PodcastGraphState:
            return await typed_script_writer_node(state, chapter_agents, mode)

        return write_script

    async def review_script(state: PodcastGraphState) -> PodcastGraphState:
        return await script_review_node(
            state, chapter_agents, state.get("book_type") or "fallback"
        )

    async def rewrite_script(state: PodcastGraphState) -> PodcastGraphState:
        return await script_rewrite_node(
            state, chapter_agents, state.get("book_type") or "fallback"
        )

    graph.add_node("load_project", load_project)
    graph.add_node("load_chapter", load_chapter)
    graph.add_node("load_existing", load_existing)
    graph.add_node("reader_insight", load_reader_insight)
    graph.add_node("book_profiler", profile_book)

    for mode in ("concept", "narrative", "report", "fallback"):
        graph.add_node(f"{mode}_analysis", make_analysis_node(mode))
        graph.add_node(
            f"{mode}_plan",
            lambda state, current_mode=mode: build_podcast_plan_node(
                state, current_mode
            ),
        )
        graph.add_node(f"{mode}_script", make_script_node(mode))

    graph.add_node("review_script", review_script)
    graph.add_node("rewrite_script", rewrite_script)
    graph.add_node("human_review_required", human_review_required_node)
    graph.add_node("save_artifacts", save_artifacts)

    graph.add_edge(START, "load_project")
    graph.add_edge("load_project", "load_chapter")
    graph.add_edge("load_chapter", "load_existing")
    graph.add_edge("load_existing", "reader_insight")
    graph.add_edge("reader_insight", "book_profiler")
    graph.add_conditional_edges(
        "book_profiler",
        route_by_book_type,
        {
            "concept_flow": "concept_analysis",
            "narrative_flow": "narrative_analysis",
            "report_flow": "report_analysis",
            "fallback_flow": "fallback_analysis",
        },
    )

    for mode in ("concept", "narrative", "report", "fallback"):
        graph.add_edge(f"{mode}_analysis", f"{mode}_plan")
        graph.add_edge(f"{mode}_plan", f"{mode}_script")
        graph.add_edge(f"{mode}_script", "review_script")

    graph.add_conditional_edges(
        "review_script",
        route_by_review_result,
        {
            "save_script": "save_artifacts",
            "rewrite_script": "rewrite_script",
            "human_review_required": "human_review_required",
        },
    )
    graph.add_edge("rewrite_script", "review_script")
    graph.add_edge("human_review_required", "save_artifacts")
    graph.add_edge("save_artifacts", END)

    return graph.compile()


async def run_chapter_content_graph(
    project_id: str,
    chapter_id: str,
    *,
    db: Session | None = None,
    chapter_agents: ChapterAgents | None = None,
    max_retries: int = 2,
) -> PodcastGraphState:
    owns_db = db is None
    session = db or SessionLocal()
    try:
        graph = build_chapter_content_graph(session, chapter_agents or ChapterAgents())
        initial_state: PodcastGraphState = {
            "project_id": project_id,
            "chapter_id": chapter_id,
            "retry_count": 0,
            "max_retries": max_retries,
            "review_passed": False,
            "script_blocks": [],
            "revision_issues": [],
            "saved_artifact_ids": {},
            "next_action": None,
            "error": None,
        }
        return await graph.ainvoke(initial_state)
    finally:
        if owns_db:
            session.close()
