import argparse
from pathlib import Path
from urllib.request import urlretrieve


TESSDATA_FAST_BASE_URL = (
    "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main"
)
DEFAULT_LANGUAGES = ["chi_sim", "eng"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--target",
        default="E:/agent-tools/tessdata",
        help="Directory where Tesseract .traineddata files will be stored.",
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        default=DEFAULT_LANGUAGES,
        help="Tesseract language codes to download.",
    )
    args = parser.parse_args()

    target = Path(args.target)
    target.mkdir(parents=True, exist_ok=True)

    for language in args.languages:
        output_path = target / f"{language}.traineddata"
        url = f"{TESSDATA_FAST_BASE_URL}/{language}.traineddata"
        if output_path.exists() and output_path.stat().st_size > 0:
            print(f"exists {output_path}")
            continue
        print(f"download {url} -> {output_path}")
        urlretrieve(url, output_path)


if __name__ == "__main__":
    main()
