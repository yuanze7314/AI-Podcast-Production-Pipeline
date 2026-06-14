from app.services.podcast_tts_client import PodcastTTSPackager, ScriptBlock


def test_packager_builds_action_3_payload():
    payload = PodcastTTSPackager().build_payload(
        "podcast_001_chapter_001",
        [
            ScriptBlock(speaker="Alice", text="你好，今天我们聊第一章。"),
            ScriptBlock(speaker="Dr_Ye", text="这一章的重点是承认自己的低落。"),
        ],
    )

    assert payload["action"] == 3
    assert payload["audio_config"]["format"] == "mp3"
    assert payload["speaker_info"]["random_order"] is False
    assert payload["nlp_texts"][0]["speaker"].startswith("zh_female_")
    assert payload["nlp_texts"][1]["speaker"].startswith("zh_male_")
