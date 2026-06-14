from __future__ import annotations

import inspect
from typing import Any

from app.core.config import settings
from app.graphs.routers import normalize_book_type
from app.graphs.state import PodcastGraphState


async def _call_agent(method, *args, **kwargs):
    try:
        return await method(*args, **kwargs)
    except TypeError as exc:
        if "unexpected keyword argument" not in str(exc):
            raise
        supported = {
            name
            for name, parameter in inspect.signature(method).parameters.items()
            if parameter.kind
            in {
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                inspect.Parameter.KEYWORD_ONLY,
            }
        }
        filtered = {key: value for key, value in kwargs.items() if key in supported}
        return await method(*args, **filtered)


def _book_type_from_profile(profile: dict[str, Any] | None) -> str:
    if not profile:
        return "fallback"
    for key in ("book_type", "recommended_mode", "book_category", "category"):
        book_type = normalize_book_type(profile.get(key))
        if book_type != "fallback":
            return book_type
    evidence = " ".join(str(value) for value in profile.values())
    return normalize_book_type(evidence)


def _chapter_overview(state: PodcastGraphState) -> list[dict[str, Any]]:
    return [
        {
            "chapter_number": state.get("chapter_number", 1),
            "title": state.get("chapter_title", ""),
            "preview": (state.get("chapter_text") or "")[:500],
        }
    ]


async def book_profiler_node(
    state: PodcastGraphState, chapter_agents
) -> PodcastGraphState:
    if state.get("book_profile"):
        book_type = _book_type_from_profile(state.get("book_profile"))
        return {"book_type": book_type}

    if not hasattr(chapter_agents, "profile_book"):
        return {"book_profile": None, "book_type": "fallback"}

    output = await _call_agent(
        chapter_agents.profile_book,
        state.get("book_title") or state.get("project_title") or "",
        _chapter_overview(state),
        state.get("reader_insight"),
    )
    profile = output.content
    return {
        "book_profile": profile,
        "book_profile_raw": output.raw,
        "book_type": _book_type_from_profile(profile),
    }


async def typed_analysis_node(
    state: PodcastGraphState, chapter_agents, mode: str
) -> PodcastGraphState:
    if state.get("analysis"):
        return {}
    output = await _call_agent(
        chapter_agents.analyze_chapter,
        state["chapter_title"],
        state["chapter_text"],
        state.get("quality_context") or {},
        mode=mode,
    )
    return {"analysis": output.content}


def _normalize_script_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, block in enumerate(blocks, start=1):
        speaker = block.get("speaker")
        if speaker not in {"Alice", "Dr_Ye"}:
            raise ValueError(f"Invalid speaker at block {index}")
        item = dict(block)
        item.setdefault("speaker_role", "host" if speaker == "Alice" else "advisor_friend")
        item.setdefault(
            "voice_id", settings.voice_alice if speaker == "Alice" else settings.voice_dr_ye
        )
        item.setdefault(
            "tts_params",
            {
                "encoding": settings.volcengine_tts_encoding,
                "sample_rate": settings.volcengine_tts_sample_rate,
                "speech_rate": settings.volcengine_tts_speech_rate,
                "emotion": None,
            },
        )
        item.setdefault("estimated_seconds", 0)
        item.setdefault("locked", False)
        item.setdefault("status", "draft")
        item.setdefault("block_index", index)
        item.setdefault("source_refs", [])
        normalized.append(item)
    return normalized


async def typed_script_writer_node(
    state: PodcastGraphState, chapter_agents, mode: str
) -> PodcastGraphState:
    if state.get("script_blocks"):
        return {}
    output = await _call_agent(
        chapter_agents.write_script_blocks,
        state["chapter_title"],
        state.get("analysis") or {},
        state.get("podcast_plan") or {},
        state.get("quality_context") or {},
        mode=mode,
    )
    blocks = output.content.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        raise ValueError("Script response must contain non-empty blocks")
    return {"script_blocks": _normalize_script_blocks(blocks)}


async def script_review_node(
    state: PodcastGraphState, chapter_agents, mode: str
) -> PodcastGraphState:
    if state.get("review_report"):
        return {}
    output = await _call_agent(
        chapter_agents.review_script,
        state["chapter_title"],
        state.get("analysis"),
        state.get("podcast_plan"),
        state.get("script_blocks", []),
        state.get("quality_context") or {},
        mode=mode,
    )
    report = output.content
    issues = report.get("issues", [])
    if not isinstance(issues, list):
        issues = [{"note": str(issues)}]
    return {
        "review_report": report,
        "revision_issues": issues,
        "review_passed": bool(report.get("pass_review")),
    }


async def script_rewrite_node(
    state: PodcastGraphState, chapter_agents, mode: str
) -> PodcastGraphState:
    rewrite_method = getattr(chapter_agents, "rewrite_script_blocks", None)
    if rewrite_method is None:
        rewrite_method = chapter_agents.write_script_blocks
        args = (
            state["chapter_title"],
            state.get("analysis") or {},
            state.get("podcast_plan") or {},
            state.get("quality_context") or {},
        )
    else:
        args = (
            state["chapter_title"],
            state.get("analysis") or {},
            state.get("podcast_plan") or {},
            state.get("script_blocks", []),
            state.get("revision_issues", []),
            state.get("quality_context") or {},
        )

    output = await _call_agent(rewrite_method, *args, mode=mode)
    blocks = output.content.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        raise ValueError("Rewrite response must contain non-empty blocks")
    return {
        "script_blocks": _normalize_script_blocks(blocks),
        "review_report": None,
        "review_passed": False,
        "retry_count": int(state.get("retry_count") or 0) + 1,
    }
