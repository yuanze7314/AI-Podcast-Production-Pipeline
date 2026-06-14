from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from shutil import which

try:
    import fitz
except ImportError:  # pragma: no cover - dependency check happens at runtime
    fitz = None

from app.core.config import settings


@dataclass(frozen=True)
class OCRPage:
    page_number: int
    text: str


@dataclass(frozen=True)
class OCRResult:
    provider: str
    language: str
    dpi: int
    pages: list[OCRPage]

    @property
    def page_texts(self) -> list[str]:
        return [page.text for page in self.pages]


class OCRProviderError(RuntimeError):
    pass


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _candidate_tessdata_paths() -> list[Path]:
    candidates: list[Path] = []
    if settings.ocr_tessdata:
        candidates.append(Path(settings.ocr_tessdata))

    candidates.extend(
        [
            Path("E:/agent-tools/tessdata"),
            _project_root() / "tools" / "tessdata",
            Path("C:/Program Files/Tesseract-OCR/tessdata"),
            Path("C:/Program Files (x86)/Tesseract-OCR/tessdata"),
        ]
    )
    return candidates


def _candidate_tesseract_paths() -> list[Path]:
    candidates: list[Path] = []
    path_hit = which("tesseract")
    if path_hit:
        candidates.append(Path(path_hit))
    candidates.extend(
        [
            Path("C:/Program Files/Tesseract-OCR/tesseract.exe"),
            Path("C:/Program Files (x86)/Tesseract-OCR/tesseract.exe"),
        ]
    )
    return candidates


def _resolve_tessdata_path() -> Path | None:
    for candidate in _candidate_tessdata_paths():
        if candidate.exists() and candidate.is_dir():
            return candidate
    return None


def _resolve_tesseract_path() -> Path | None:
    for candidate in _candidate_tesseract_paths():
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _language_codes(language: str) -> list[str]:
    return [item.strip() for item in language.split("+") if item.strip()]


def _missing_language_files(tessdata_path: Path | None, language: str) -> list[str]:
    if tessdata_path is None:
        return _language_codes(language)
    return [
        code
        for code in _language_codes(language)
        if not (tessdata_path / f"{code}.traineddata").exists()
    ]


class PyMuPDFOCRProvider:
    provider_name = "pymupdf_ocr"

    def __init__(
        self,
        language: str | None = None,
        dpi: int | None = None,
        tessdata: str | None = None,
    ) -> None:
        self.language = language or settings.ocr_language
        self.dpi = dpi or settings.ocr_dpi
        resolved_tessdata = tessdata or settings.ocr_tessdata
        self.tessdata = str(Path(resolved_tessdata)) if resolved_tessdata else None
        if self.tessdata is None:
            discovered = _resolve_tessdata_path()
            self.tessdata = str(discovered) if discovered else None

    def extract(self, pdf_path: Path) -> OCRResult:
        if fitz is None:
            raise OCRProviderError("PyMuPDF is not installed.")
        tessdata_path = Path(self.tessdata) if self.tessdata else None
        if tessdata_path is None or not tessdata_path.exists():
            raise OCRProviderError("OCR tessdata path not found.")
        missing_languages = _missing_language_files(tessdata_path, self.language)
        if missing_languages:
            raise OCRProviderError(
                f"OCR language data missing: {', '.join(missing_languages)}"
            )

        pages: list[OCRPage] = []
        try:
            with fitz.open(pdf_path) as doc:
                for page_index, page in enumerate(doc):
                    textpage = page.get_textpage_ocr(
                        flags=0,
                        language=self.language,
                        dpi=self.dpi,
                        full=True,
                        tessdata=self.tessdata,
                    )
                    pages.append(
                        OCRPage(
                            page_number=page_index + 1,
                            text=page.get_text("text", textpage=textpage),
                        )
                    )
        except Exception as exc:
            raise OCRProviderError(
                "PyMuPDF OCR failed. Install Tesseract language data or choose another OCR provider."
            ) from exc

        return OCRResult(
            provider=self.provider_name,
            language=self.language,
            dpi=self.dpi,
            pages=pages,
        )


class OCRTextExtractor:
    def __init__(self, provider: str | None = None) -> None:
        self.provider = provider or settings.ocr_provider

    def extract(self, pdf_path: Path) -> OCRResult:
        if self.provider == "pymupdf":
            return PyMuPDFOCRProvider().extract(pdf_path)
        raise OCRProviderError(f"Unsupported OCR provider: {self.provider}")


def diagnose_ocr_environment() -> dict:
    tesseract_path = _resolve_tesseract_path()
    tessdata_path = _resolve_tessdata_path()
    missing_languages = _missing_language_files(tessdata_path, settings.ocr_language)
    pymupdf_ocr_api_available = bool(
        fitz is not None and hasattr(fitz.Page, "get_textpage_ocr")
    )

    return {
        "configured_provider": settings.ocr_provider,
        "language": settings.ocr_language,
        "dpi": settings.ocr_dpi,
        "pymupdf_available": fitz is not None,
        "pymupdf_ocr_api_available": pymupdf_ocr_api_available,
        "tesseract_on_path": which("tesseract") is not None,
        "tesseract_path": str(tesseract_path) if tesseract_path else None,
        "tessdata": str(tessdata_path) if tessdata_path else settings.ocr_tessdata,
        "tessdata_exists": tessdata_path is not None,
        "missing_languages": missing_languages,
        "ready": bool(
            settings.ocr_provider == "pymupdf"
            and fitz is not None
            and pymupdf_ocr_api_available
            and tesseract_path is not None
            and tessdata_path is not None
            and not missing_languages
        ),
    }
