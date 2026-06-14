from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.deepseek_client import DeepSeekClient

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"


class AgentJsonError(RuntimeError):
    pass


def parse_json_response(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AgentJsonError(f"LLM response is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise AgentJsonError("LLM response must be a JSON object")
    return data


@dataclass(frozen=True)
class AgentOutput:
    content: dict[str, Any]
    raw: str


def _load_prompt_template(name: str, fallback: str) -> str:
    path = PROMPTS_DIR / name
    if not path.exists():
        return fallback
    return path.read_text(encoding="utf-8").strip() or fallback


def _prompt_name(mode: str | None, suffix: str) -> str | None:
    if mode not in {"concept", "narrative", "report"}:
        return None
    return f"{mode}_{suffix}.md"


class ChapterAgents:
    def __init__(self, client: DeepSeekClient | None = None) -> None:
        self.client = client or DeepSeekClient()

    async def _json_agent_output(
        self,
        messages: list[dict[str, str]],
        validator=None,
        attempts: int = 3,
    ) -> AgentOutput:
        retry_messages = list(messages)
        last_raw = ""
        last_error: Exception | None = None

        for attempt in range(1, attempts + 1):
            raw = await self.client.chat_json(retry_messages)
            last_raw = raw
            try:
                data = parse_json_response(raw)
                if validator is not None:
                    data = validator(data)
                return AgentOutput(content=data, raw=raw)
            except AgentJsonError as exc:
                last_error = exc
                if attempt >= attempts:
                    break
                retry_messages = [
                    *messages,
                    {
                        "role": "assistant",
                        "content": raw[:4000],
                    },
                    {
                        "role": "user",
                        "content": (
                            "上一轮输出不是可解析或不符合 schema 的 JSON。"
                            f"错误：{exc}。请只重新输出一个合法 JSON 对象，"
                            "不要解释，不要 markdown，不要代码围栏。"
                        ),
                    },
                ]

        raise AgentJsonError(
            f"{last_error}; retried {attempts} times. Last raw prefix: {last_raw[:300]}"
        )

    async def analyze_reader_insight(self, input_text: str) -> AgentOutput:
        return await self._json_agent_output(
            [
                {
                    "role": "system",
                    "content": (
                        "你是 ReaderInsightAgent，负责从读者评论、笔记、划线中提炼播客创作洞察。"
                        "只输出 JSON，不要输出 markdown。输入为空时也必须输出 empty_input=true 的结构。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"读者评论/笔记/划线：\n{input_text[:12000]}\n\n"
                        "请输出 JSON，字段必须包含：empty_input, emotional_baseline, "
                        "reader_concerns, reader_questions, relatable_cases, controversial_points, "
                        "book_highlights, script_opportunities, avoid_list。"
                    ),
                },
            ]
        )

    async def profile_book(
        self,
        book_title: str,
        chapter_overview: list[dict[str, Any]],
        reader_insight: dict[str, Any] | None = None,
    ) -> AgentOutput:
        return await self._json_agent_output(
            [
                {
                    "role": "system",
                    "content": (
                        "你是 BookProfilerAgent，负责判断书籍类型、内容特征和播客表达策略。"
                        "只输出 JSON。不要输出全书时长预算，也不要做章节压缩方案。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"书名：{book_title}\n\n"
                        f"章节概览：\n{json.dumps(chapter_overview, ensure_ascii=False)}\n\n"
                        f"读者洞察：\n{json.dumps(reader_insight or {}, ensure_ascii=False)}\n\n"
                        "请输出 JSON，字段必须包含：book_category, confidence, classification_evidence, "
                        "content_features, reader_fit, recommended_mode, alice_persona, dr_ye_persona, "
                        "tone_guidelines, case_usage_guidelines, script_quality_rules, avoid_list。"
                    ),
                },
            ]
        )

    async def analyze_chapter(
        self,
        chapter_title: str,
        chapter_text: str,
        quality_context: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> AgentOutput:
        fallback_prompt = (
            "你是 ChapterAnalysisAgent，负责把书籍单章内容解析成可用于播客创作的结构化 JSON。"
            "只输出 JSON，不要输出 markdown。"
        )
        prompt_file = _prompt_name(mode, "analysis")
        return await self._json_agent_output(
            [
                {
                    "role": "system",
                    "content": _load_prompt_template(prompt_file, fallback_prompt)
                    if prompt_file
                    else fallback_prompt,
                },
                {
                    "role": "user",
                    "content": (
                        f"章节标题：{chapter_title}\n\n"
                        f"全局质量上下文：\n{json.dumps(quality_context or {}, ensure_ascii=False)}\n\n"
                        f"章节正文：\n{chapter_text[:16000]}\n\n"
                        "请输出 JSON，字段必须包含："
                        "chapter_title, summary, core_arguments, key_examples, emotional_tone, "
                        "podcast_angles, reader_questions, risks, quotable_points。"
                    ),
                },
            ]
        )

    async def create_podcast_plan(
        self,
        chapter_title: str,
        analysis: dict[str, Any],
        quality_context: dict[str, Any] | None = None,
    ) -> AgentOutput:
        return await self._json_agent_output(
            [
                {
                    "role": "system",
                    "content": (
                        "你是 PodcastPlanAgent，负责把章节分析转成双人播客策划。"
                        "Alice 是主持人位，Dr_Ye 是同等地位的建议型朋友。只输出 JSON。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"章节标题：{chapter_title}\n\n"
                        f"全局质量上下文：\n{json.dumps(quality_context or {}, ensure_ascii=False)}\n\n"
                        f"章节分析 JSON：\n{json.dumps(analysis, ensure_ascii=False)}\n\n"
                        "请输出 JSON，字段必须包含：tone, target_duration_seconds, dialogue_goal, "
                        "alice_role_notes, dr_ye_role_notes, beats, examples_to_include, highlights_to_include, "
                        "avoid_list。目标时长 180 到 240 秒。"
                    ),
                },
            ]
        )

    @staticmethod
    def _validate_script_response(data: dict[str, Any]) -> dict[str, Any]:
        blocks = data.get("blocks")
        if not isinstance(blocks, list) or not blocks:
            raise AgentJsonError("Script response must contain non-empty blocks")

        for index, block in enumerate(blocks, start=1):
            if block.get("speaker") not in {"Alice", "Dr_Ye"}:
                raise AgentJsonError(f"Invalid speaker at block {index}")
            block.setdefault(
                "voice_id",
                settings.voice_alice
                if block["speaker"] == "Alice"
                else settings.voice_dr_ye,
            )
            block.setdefault(
                "tts_params",
                {
                    "encoding": settings.volcengine_tts_encoding,
                    "sample_rate": settings.volcengine_tts_sample_rate,
                    "speech_rate": settings.volcengine_tts_speech_rate,
                    "emotion": None,
                },
            )
            block.setdefault("locked", False)
            block.setdefault("status", "draft")
            block.setdefault("block_index", index)
            block.setdefault("estimated_seconds", 0)
            block.setdefault("source_refs", [])
        return data

    async def write_script_blocks(
        self,
        chapter_title: str,
        analysis: dict[str, Any],
        plan: dict[str, Any],
        quality_context: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> AgentOutput:
        fallback_prompt = (
            "你是 ScriptWriterAgent，负责生成可编辑、可 TTS 的双人播客脚本块。"
            "只输出 JSON。speaker 只能是 Alice 或 Dr_Ye。"
        )
        prompt_file = _prompt_name(mode, "script")
        messages = [
            {
                "role": "system",
                "content": _load_prompt_template(prompt_file, fallback_prompt)
                if prompt_file
                else fallback_prompt,
            },
            {
                "role": "user",
                "content": (
                    f"章节标题：{chapter_title}\n\n"
                    f"全局质量上下文：\n{json.dumps(quality_context or {}, ensure_ascii=False)}\n\n"
                    f"章节分析：\n{json.dumps(analysis, ensure_ascii=False)}\n\n"
                    f"播客策划：\n{json.dumps(plan, ensure_ascii=False)}\n\n"
                    "请输出 JSON，根字段为 blocks。blocks 是数组，每个元素必须包含："
                    "speaker, speaker_role, text, estimated_seconds, source_refs。"
                    "speaker_role 对 Alice 使用 host，对 Dr_Ye 使用 advisor_friend。"
                    "整章目标 180 到 240 秒，语言自然，适合播客朗读。"
                ),
            },
        ]

        return await self._json_agent_output(
            messages, validator=self._validate_script_response
        )

    async def rewrite_script_blocks(
        self,
        chapter_title: str,
        analysis: dict[str, Any],
        plan: dict[str, Any],
        blocks: list[dict[str, Any]],
        revision_issues: list[dict[str, Any]],
        quality_context: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> AgentOutput:
        fallback_prompt = (
            "你是 ScriptRewriteAgent，负责根据审核问题局部重写双人播客脚本块。"
            "只输出 JSON。speaker 只能是 Alice 或 Dr_Ye。"
        )
        return await self._json_agent_output(
            [
                {
                    "role": "system",
                    "content": _load_prompt_template("rewrite_script.md", fallback_prompt),
                },
                {
                    "role": "user",
                    "content": (
                        f"章节标题：{chapter_title}\n\n"
                        f"全局质量上下文：\n{json.dumps(quality_context or {}, ensure_ascii=False)}\n\n"
                        f"章节分析：\n{json.dumps(analysis, ensure_ascii=False)}\n\n"
                        f"播客策划：\n{json.dumps(plan, ensure_ascii=False)}\n\n"
                        f"当前脚本块：\n{json.dumps(blocks, ensure_ascii=False)}\n\n"
                        f"审核问题：\n{json.dumps(revision_issues, ensure_ascii=False)}\n\n"
                        "请只重写需要修复的 draft 脚本块，并保持双人播客自然、TTS 友好。"
                        "不要改写 locked=true 或 status=confirmed 的脚本块。"
                        "输出 JSON，根字段为 blocks。blocks 数组元素必须包含："
                        "speaker, speaker_role, text, estimated_seconds, source_refs。"
                    ),
                },
            ],
            validator=self._validate_script_response,
        )

    async def review_script(
        self,
        chapter_title: str,
        analysis: dict[str, Any] | None,
        plan: dict[str, Any] | None,
        blocks: list[dict[str, Any]],
        quality_context: dict[str, Any] | None = None,
        mode: str | None = None,
    ) -> AgentOutput:
        def validate_review(data: dict[str, Any]) -> dict[str, Any]:
            data.setdefault("issues", [])
            data.setdefault("suggested_edits", [])
            data.setdefault("do_not_change", [])
            return data

        fallback_prompt = (
            "你是 ScriptReviewAgent，负责审核双人播客脚本质量。"
            "只输出 JSON。不要改写脚本，不要输出新的脚本块。"
        )
        prompt_file = _prompt_name(mode, "review")
        return await self._json_agent_output(
            [
                {
                    "role": "system",
                    "content": _load_prompt_template(prompt_file, fallback_prompt)
                    if prompt_file
                    else fallback_prompt,
                },
                {
                    "role": "user",
                    "content": (
                        f"章节标题：{chapter_title}\n\n"
                        f"全局质量上下文：\n{json.dumps(quality_context or {}, ensure_ascii=False)}\n\n"
                        f"章节分析：\n{json.dumps(analysis or {}, ensure_ascii=False)}\n\n"
                        f"播客策划：\n{json.dumps(plan or {}, ensure_ascii=False)}\n\n"
                        f"脚本块：\n{json.dumps(blocks, ensure_ascii=False)}\n\n"
                        "请输出 JSON，字段必须包含：overall_score, pass_review, "
                        "role_consistency, dialogue_naturalness, content_accuracy, "
                        "quality_context_usage, tts_risks, issues, suggested_edits, "
                        "do_not_change。issues 和 suggested_edits 必须是数组；"
                        "suggested_edits 只描述建议，不要给出完整改写脚本。"
                    ),
                },
            ],
            validator=validate_review,
        )
