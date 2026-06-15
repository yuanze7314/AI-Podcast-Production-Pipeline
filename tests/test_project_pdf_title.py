from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.session import Base
from app.repositories import projects


def make_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "app_storage_dir", str(tmp_path / "storage"))
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return Session()


def test_import_local_pdf_infers_book_title_when_missing(tmp_path, monkeypatch):
    db = make_db(tmp_path, monkeypatch)
    try:
        project = projects.create_project(db, "导入项目")
        source_pdf = tmp_path / "蛤蟆先生去看心理医生 (（英）罗伯特•戴博德) (z-library.sk, 1lib.sk, z-lib.sk).pdf"
        source_pdf.write_bytes(b"%PDF-1.4")

        updated = projects.import_pdf_from_path(db, project, source_pdf)

        assert updated.book_title == "蛤蟆先生去看心理医生"
    finally:
        db.close()


def test_upload_pdf_keeps_existing_book_title(tmp_path, monkeypatch):
    db = make_db(tmp_path, monkeypatch)
    try:
        project = projects.create_project(db, "导入项目", "手动书名")

        updated = projects.save_uploaded_pdf(
            db,
            project,
            "另一本书 (z-library.sk).pdf",
            b"%PDF-1.4",
        )

        assert updated.book_title == "手动书名"
    finally:
        db.close()


def test_upload_pdf_infers_book_title_when_missing(tmp_path, monkeypatch):
    db = make_db(tmp_path, monkeypatch)
    try:
        project = projects.create_project(db, "上传项目")

        updated = projects.save_uploaded_pdf(
            db,
            project,
            "蛤蟆先生去看心理医生 (z-library.sk).pdf",
            b"%PDF-1.4",
        )

        assert updated.book_title == "蛤蟆先生去看心理医生"
    finally:
        db.close()
