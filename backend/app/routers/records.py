from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from ..db import get_session
from ..models import Record, RecordCreate, RecordUpdate

router = APIRouter(prefix="/records", tags=["records"])


def _get_or_404(session: Session, record_id: int) -> Record:
    record = session.get(Record, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    return record


@router.get("", response_model=list[Record])
def list_records(
    q: str | None = None,
    label: str | None = None,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
):
    stmt = select(Record)
    if q:
        stmt = stmt.where(col(Record.title).contains(q) | col(Record.content).contains(q))
    if label:
        stmt = stmt.where(Record.label == label)
    return session.exec(stmt.order_by(col(Record.id).desc()).offset(offset).limit(limit)).all()


@router.post("", response_model=Record, status_code=201)
def create_record(data: RecordCreate, session: Session = Depends(get_session)):
    record = Record.model_validate(data)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.get("/{record_id}", response_model=Record)
def get_record(record_id: int, session: Session = Depends(get_session)):
    return _get_or_404(session, record_id)


@router.patch("/{record_id}", response_model=Record)
def update_record(record_id: int, data: RecordUpdate, session: Session = Depends(get_session)):
    record = _get_or_404(session, record_id)
    record.sqlmodel_update(data.model_dump(exclude_unset=True))
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/{record_id}", status_code=204)
def delete_record(record_id: int, session: Session = Depends(get_session)):
    session.delete(_get_or_404(session, record_id))
    session.commit()
