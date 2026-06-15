from __future__ import annotations

import re

SOURCE_MARKERS = (
    "z-library",
    "zlib",
    "z-lib",
    "1lib",
    "libgen",
    "pdfdrive",
)


def _basename(value: str) -> str:
    return re.split(r"[\\/]", value)[-1]


def _without_pdf_suffix(value: str) -> str:
    return re.sub(r"\.pdf$", "", value, flags=re.IGNORECASE)


def _remove_source_markers(value: str) -> str:
    lower = value.lower()
    marker_indexes = [
        index for marker in SOURCE_MARKERS if (index := lower.find(marker)) >= 0
    ]
    if not marker_indexes:
        return value
    return re.sub(r"\s*[\(（]\s*$", "", value[: min(marker_indexes)]).strip()


def _trim_trailing_groups(value: str) -> str:
    title = value.strip()
    while title.endswith((")", "）")):
        depth = 0
        open_index = -1
        for index in range(len(title) - 1, -1, -1):
            char = title[index]
            if char in (")", "）"):
                depth += 1
            elif char in ("(", "（"):
                depth -= 1
                if depth == 0:
                    open_index = index
                    break
        if open_index < 0:
            return title
        title = title[:open_index].strip()
    return title


def infer_book_title_from_pdf_name(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", _without_pdf_suffix(_basename(value)).replace("_", " "))
    return _trim_trailing_groups(_remove_source_markers(cleaned.strip())).strip()
