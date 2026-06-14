import argparse
import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    client = TestClient(app)
    project = client.post(
        "/api/projects",
        json={"title": "Smoke Test", "book_title": pdf_path.stem},
    )
    project.raise_for_status()
    project_id = project.json()["id"]

    imported = client.post(
        f"/api/projects/{project_id}/pdf/local",
        json={"pdf_path": str(pdf_path)},
    )
    imported.raise_for_status()

    parsed = client.post(f"/api/projects/{project_id}/parse")
    parsed.raise_for_status()

    chapters = client.get(f"/api/projects/{project_id}/chapters")
    chapters.raise_for_status()

    print(
        {
            "project_id": project_id,
            "parse_run": parsed.json()["id"],
            "chapters": len(chapters.json()),
            "storage": os.path.join("storage", "projects", project_id),
        }
    )


if __name__ == "__main__":
    main()
