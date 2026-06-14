from __future__ import annotations

import httpx

from app.core.config import settings


class DeepSeekClient:
    """Minimal OpenAI-compatible chat client for DeepSeek."""

    def __init__(self) -> None:
        if not settings.deepseek_api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        self.base_url = settings.deepseek_base_url.rstrip("/")
        self.api_key = settings.deepseek_api_key

    async def chat_json(self, messages: list[dict[str, str]]) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": settings.deepseek_model,
                    "messages": messages,
                    "temperature": settings.deepseek_temperature,
                    "max_tokens": settings.deepseek_max_tokens,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
