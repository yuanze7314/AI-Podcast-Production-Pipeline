import argparse

from fastapi.testclient import TestClient

from app.main import app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    parser.add_argument("--chapter-number", type=int, default=1)
    args = parser.parse_args()

    client = TestClient(app)
    chapter_response = client.get(
        f"/api/projects/{args.project_id}/chapters/by-number/{args.chapter_number}"
    )
    chapter_response.raise_for_status()
    chapter_id = chapter_response.json()["id"]

    blocks_response = client.get(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/script-blocks"
    )
    blocks_response.raise_for_status()
    blocks = blocks_response.json()
    if not blocks:
        raise SystemExit("No script blocks found. Run Stage 2 script generation first.")

    first_block = blocks[0]
    edit_response = client.patch(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/script-blocks/{first_block['id']}",
        json={"speech_rate": 0},
    )
    edit_response.raise_for_status()

    lock_response = client.patch(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/script-blocks/{first_block['id']}/lock",
        json={"locked": True},
    )
    lock_response.raise_for_status()

    locked_edit_response = client.patch(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/script-blocks/{first_block['id']}",
        json={"text": first_block["text"]},
    )
    if locked_edit_response.status_code != 422:
        raise SystemExit("Locked script block edit should be rejected.")

    unlock_response = client.patch(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/script-blocks/{first_block['id']}/lock",
        json={"locked": False},
    )
    unlock_response.raise_for_status()

    preview_before_confirm = client.get(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/tts/preview-payload"
    )
    if preview_before_confirm.status_code != 422:
        raise SystemExit("TTS preview should be rejected before script confirmation.")

    confirm_response = client.post(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/script/confirm"
    )
    confirm_response.raise_for_status()

    preview_response = client.get(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/tts/preview-payload"
    )
    preview_response.raise_for_status()
    preview = preview_response.json()
    payload = preview["payload"]

    assert payload["action"] == 3
    assert payload["audio_config"]["format"] == "mp3"
    assert payload["speaker_info"]["random_order"] is False
    assert len(payload["nlp_texts"]) == len(blocks)
    assert payload["nlp_texts"][0]["speaker"].startswith("zh_female_")

    print(
        {
            "project_id": args.project_id,
            "chapter_id": chapter_id,
            "script_blocks": len(blocks),
            "input_id": preview["input_id"],
            "payload_rounds": len(payload["nlp_texts"]),
        }
    )


if __name__ == "__main__":
    main()
