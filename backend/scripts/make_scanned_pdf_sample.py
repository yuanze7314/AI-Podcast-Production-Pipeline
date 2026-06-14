import argparse
from pathlib import Path

import fitz


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_pdf")
    parser.add_argument("output_pdf")
    parser.add_argument("--pages", type=int, default=12)
    parser.add_argument("--dpi", type=int, default=180)
    args = parser.parse_args()

    source = Path(args.source_pdf)
    output = Path(args.output_pdf)
    output.parent.mkdir(parents=True, exist_ok=True)

    zoom = args.dpi / 72
    matrix = fitz.Matrix(zoom, zoom)

    with fitz.open(source) as doc, fitz.open() as scanned:
        page_count = min(args.pages, len(doc))
        for page_index in range(page_count):
            page = doc[page_index]
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            target = scanned.new_page(width=page.rect.width, height=page.rect.height)
            target.insert_image(target.rect, pixmap=pixmap)
        scanned.save(output)

    print(
        {
            "source_pdf": str(source),
            "output_pdf": str(output),
            "pages": page_count,
            "dpi": args.dpi,
        }
    )


if __name__ == "__main__":
    main()
