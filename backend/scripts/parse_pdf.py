import argparse
import json
from pathlib import Path

from app.workflows.document_parser import DocumentParserWorkflow


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--output", default="storage/parse-result.json")
    args = parser.parse_args()

    result = DocumentParserWorkflow().parse(Path(args.pdf_path))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(result.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(output)


if __name__ == "__main__":
    main()
