import argparse

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_id")
    parser.add_argument("--chapter-number", type=int, default=1)
    args = parser.parse_args()

    if not settings.deepseek_api_key:
        raise SystemExit("DEEPSEEK_API_KEY is not configured. Create local .env first.")

    client = TestClient(app)
    chapter = client.get(
        f"/api/projects/{args.project_id}/chapters/by-number/{args.chapter_number}"
    )
    chapter.raise_for_status()
    chapter_id = chapter.json()["id"]

    analysis = client.post(f"/api/projects/{args.project_id}/chapters/{chapter_id}/analysis")
    analysis.raise_for_status()

    plan = client.post(f"/api/projects/{args.project_id}/chapters/{chapter_id}/plan")
    plan.raise_for_status()

    script = client.post(f"/api/projects/{args.project_id}/chapters/{chapter_id}/script")
    script.raise_for_status()

    print(
        {
            "project_id": args.project_id,
            "chapter_id": chapter_id,
            "analysis_id": analysis.json()["id"],
            "plan_id": plan.json()["id"],
            "script_blocks": len(script.json()),
        }
    )


if __name__ == "__main__":
    main()
