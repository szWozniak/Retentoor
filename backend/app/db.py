from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from .config import settings

_is_sqlite = settings.database_url.startswith("sqlite")
if settings.database_url.startswith("sqlite:///"):
    Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)


def init_db() -> None:
    from . import models  # noqa: F401 - registers tables

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
