import asyncio

from app.services.chapter_agents import ChapterAgents


class CapturingJsonClient:
    def __init__(self, raw):
        self.raw = raw
        self.messages = []

    async def chat_json(self, messages):
        self.messages = messages
        return self.raw


def test_analyze_chapter_uses_mode_specific_prompt_template():
    client = CapturingJsonClient('{"summary":"ok"}')

    asyncio.run(
        ChapterAgents(client).analyze_chapter(
            "第一章",
            "正文",
            {"book_profile": {"book_type": "concept"}},
            mode="concept",
        )
    )

    assert "ConceptAnalysisAgent" in client.messages[0]["content"]
    assert "概念" in client.messages[0]["content"]


def test_write_script_blocks_uses_mode_specific_prompt_template_and_validates_blocks():
    client = CapturingJsonClient(
        """
        {
          "blocks": [
            {
              "speaker": "Alice",
              "speaker_role": "host",
              "text": "今天我们看一组数据。",
              "estimated_seconds": 7,
              "source_refs": []
            }
          ]
        }
        """
    )

    output = asyncio.run(
        ChapterAgents(client).write_script_blocks(
            "第一章",
            {"summary": "ok"},
            {"tone": "report"},
            {"book_profile": {"book_type": "report"}},
            mode="report",
        )
    )

    assert "ReportScriptWriterAgent" in client.messages[0]["content"]
    assert "数据" in client.messages[0]["content"]
    assert output.content["blocks"][0]["tts_params"]["encoding"] == "mp3"
