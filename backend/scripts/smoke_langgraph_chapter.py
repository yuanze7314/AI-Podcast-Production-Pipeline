from __future__ import annotations

import argparse
import asyncio
import json

from app.db.session import SessionLocal
from app.graphs.chapter_content_graph import run_chapter_content_graph
from app.repositories import agents


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run LangGraph for one parsed chapter.")
    parser.add_argument("project_id")
    parser.add_argument("--chapter-id")
    parser.add_argument("--chapter-number", type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    db = SessionLocal()
    try:
        chapter_id = args.chapter_id
        if chapter_id is None:
            if args.chapter_number is None:
                raise SystemExit("Provide --chapter-id or --chapter-number")
            chapter = agents.get_chapter_by_number(
                db, args.project_id, args.chapter_number
            )
            if chapter is None:
                raise SystemExit("Chapter not found")
            chapter_id = chapter.id

        state = asyncio.run(run_chapter_content_graph(args.project_id, chapter_id, db=db))
        print(
            json.dumps(
                {
                    "project_id": state.get("project_id"),
                    "chapter_id": state.get("chapter_id"),
                    "book_type": state.get("book_type"),
                    "script_blocks": len(state.get("script_blocks", [])),
                    "review_passed": state.get("review_passed"),
                    "retry_count": state.get("retry_count"),
                    "next_action": state.get("next_action"),
                    "error": state.get("error"),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
