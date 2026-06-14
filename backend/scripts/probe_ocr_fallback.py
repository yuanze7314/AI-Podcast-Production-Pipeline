import argparse
import json
from pathlib import Path

from app.workflows.document_parser import DocumentParserWorkflow


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--output", default="test-output/ocr-fallback-probe.json")
    args = parser.parse_args()

    pdf_path = Path(args.pdf_path)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = DocumentParserWorkflow().parse(pdf_path)
        payload = {
            "status": "success",
            "file": str(pdf_path),
            "source_type": result.text_layer.source_type,
            "pages": result.text_layer.pages,
            "extracted_chars": result.text_layer.extracted_chars,
            "quality_score": result.text_layer.quality_score,
            "chapters": [
                {
                    "chapter": chapter.chapter,
                    "title": chapter.title,
                    "start_page": chapter.start_page,
                    "end_page": chapter.end_page,
                    "confidence": chapter.confidence,
                    "chars_no_whitespace": chapter.chars_no_whitespace,
                }
                for chapter in result.chapters
            ],
        }
    except Exception as exc:
        payload = {
            "status": "failed",
            "file": str(pdf_path),
            "error": str(exc),
        }

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if payload["status"] != "success":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
