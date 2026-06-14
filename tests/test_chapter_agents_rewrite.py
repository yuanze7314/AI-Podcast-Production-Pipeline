import pytest

from app.core.config import settings
from app.services.chapter_agents import ChapterAgents


class FakeJsonClient:
    def __init__(self):
        self.messages = []

    async def chat_json(self, messages):
        self.messages = messages
        return """
        {
          "blocks": [
            {
              "speaker": "Dr_Ye",
              "speaker_role": "advisor_friend",
              "text": "这里改成更清楚的解释。",
              "estimated_seconds": 9,
              "source_refs": [{"note": "issue-1"}]
            }
          ]
        }
        """


@pytest.mark.parametrize("locked", [False, True])
def test_rewrite_script_blocks_outputs_normalized_blocks_and_mentions_protected_blocks(locked):
    import asyncio

    client = FakeJsonClient()
    output = asyncio.run(
        ChapterAgents(client).rewrite_script_blocks(
            "第一章",
            {"summary": "原分析"},
            {"tone": "解释型"},
            [
                {
                    "block_index": 1,
                    "speaker": "Alice",
                    "text": "原脚本",
                    "locked": locked,
                    "status": "confirmed" if locked else "draft",
                }
            ],
            [{"block_index": 1, "issue": "解释不够清楚"}],
            {"reader_insight": {"reader_questions": ["为什么"]}},
        )
    )

    block = output.content["blocks"][0]
    assert block["speaker"] == "Dr_Ye"
    assert block["voice_id"] == settings.voice_dr_ye
    assert block["tts_params"]["encoding"] == "mp3"
    assert block["status"] == "draft"
    user_prompt = client.messages[-1]["content"]
    assert "解释不够清楚" in user_prompt
    assert "不要改写 locked=true 或 status=confirmed" in user_prompt
