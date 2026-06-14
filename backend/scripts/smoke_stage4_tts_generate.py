import argparse
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    parser.add_argument("--chapter-number", type=int, default=1)
    args = parser.parse_args()

    missing = []
    if not settings.volcengine_app_id:
        missing.append("VOLCENGINE_APP_ID")
    if not settings.volcengine_access_token:
        missing.append("VOLCENGINE_ACCESS_TOKEN")
    if not settings.volcengine_app_key:
        missing.append("VOLCENGINE_APP_KEY")
    if missing:
        raise SystemExit(f"Missing TTS config: {', '.join(missing)}")

    client = TestClient(app)
    chapter_response = client.get(
        f"/api/projects/{args.project_id}/chapters/by-number/{args.chapter_number}"
    )
    chapter_response.raise_for_status()
    chapter_id = chapter_response.json()["id"]

    confirm_response = client.post(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/script/confirm"
    )
    confirm_response.raise_for_status()

    tts_response = client.post(
        f"/api/projects/{args.project_id}/chapters/{chapter_id}/tts/generate"
    )
    tts_response.raise_for_status()
    task = tts_response.json()

    output_path = task.get("output_path")
    output_exists = bool(output_path and Path(output_path).exists())
    output_bytes = Path(output_path).stat().st_size if output_exists else 0

    print(
        {
            "project_id": args.project_id,
            "chapter_id": chapter_id,
            "task_id": task["id"],
            "status": task["status"],
            "rounds_finished": task["rounds_finished"],
            "rounds_total": task["rounds_total"],
            "output_path": output_path,
            "output_bytes": output_bytes,
            "error_message": task["error_message"],
        }
    )

    if task["status"] != "success":
        raise SystemExit("TTS task failed. See event_log_path and error_message.")
    if not output_exists or output_bytes == 0:
        raise SystemExit("TTS task succeeded but output MP3 is missing or empty.")


if __name__ == "__main__":
    main()
