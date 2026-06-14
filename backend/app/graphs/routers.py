from __future__ import annotations

from typing import Any


def normalize_book_type(value: Any) -> str:
    if value is None:
        return "fallback"
    text = str(value).strip().lower()
    if text in {"concept", "concept_explainer", "conceptual"}:
        return "concept"
    if text in {"narrative", "narrative_story", "story", "biography", "history"}:
        return "narrative"
    if text in {"report", "research_report", "industry_report", "policy_report"}:
        return "report"
    if any(keyword in text for keyword in ["概念", "理论", "心理", "经济"]):
        return "concept"
    if any(keyword in text for keyword in ["叙事", "故事", "传记", "历史"]):
        return "narrative"
    if any(keyword in text for keyword in ["报告", "白皮书", "政策", "行业"]):
        return "report"
    return "fallback"


def route_by_book_type(state: dict[str, Any]) -> str:
    book_type = normalize_book_type(state.get("book_type"))
    if book_type == "concept":
        return "concept_flow"
    if book_type == "narrative":
        return "narrative_flow"
    if book_type == "report":
        return "report_flow"
    return "fallback_flow"


def route_by_review_result(state: dict[str, Any]) -> str:
    if state.get("review_passed") is True:
        return "save_script"
    retry_count = int(state.get("retry_count") or 0)
    max_retries = int(state.get("max_retries") or 2)
    if retry_count < max_retries:
        return "rewrite_script"
    return "human_review_required"
