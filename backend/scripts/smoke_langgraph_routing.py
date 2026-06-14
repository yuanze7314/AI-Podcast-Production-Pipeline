from app.graphs.routers import route_by_book_type, route_by_review_result


def main() -> None:
    assert route_by_book_type({"book_type": "concept"}) == "concept_flow"
    assert route_by_book_type({"book_type": "narrative_story"}) == "narrative_flow"
    assert route_by_book_type({"book_type": "research_report"}) == "report_flow"
    assert route_by_book_type({"book_type": "unknown"}) == "fallback_flow"
    assert route_by_review_result({"review_passed": True}) == "save_script"
    assert (
        route_by_review_result(
            {"review_passed": False, "retry_count": 0, "max_retries": 2}
        )
        == "rewrite_script"
    )
    assert (
        route_by_review_result(
            {"review_passed": False, "retry_count": 2, "max_retries": 2}
        )
        == "human_review_required"
    )
    print("LangGraph routing smoke passed")


if __name__ == "__main__":
    main()
