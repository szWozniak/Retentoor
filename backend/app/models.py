from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RecordBase(SQLModel):
    """Generic record. Rename/extend once the challenge is known."""

    title: str
    content: str = ""
    label: str | None = None  # e.g. classification result / status
    source: str | None = None  # e.g. URL or uploaded file name


class Record(RecordBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now)


class RecordCreate(RecordBase):
    pass


class RecordUpdate(SQLModel):
    title: str | None = None
    content: str | None = None
    label: str | None = None
    source: str | None = None
