from typing import Any, TypedDict


class PodcastGraphState(TypedDict, total=False):
    project_id: str
    project_title: str
    book_title: str | None
    chapter_id: str
    chapter_number: int
    chapter_title: str
    chapter_text: str

    reader_insight: dict[str, Any] | None
    book_profile: dict[str, Any] | None
    book_profile_raw: str | None
    book_type: str | None
    quality_context: dict[str, Any]

    analysis: dict[str, Any] | None
    podcast_plan: dict[str, Any] | None
    script_blocks: list[dict[str, Any]]
    review_report: dict[str, Any] | None
    revision_issues: list[dict[str, Any]]

    retry_count: int
    max_retries: int
    review_passed: bool

    saved_artifact_ids: dict[str, Any]
    next_action: str | None
    error: str | None
