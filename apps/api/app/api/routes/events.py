from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import LegalDocument, LegalEvent

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
def list_events(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[dict]:
    events = db.query(LegalEvent).order_by(LegalEvent.publication_date.desc()).limit(100).all()
    return [
        {
            "id": str(event.id),
            "event_type": event.event_type,
            "event_subtype": event.event_subtype,
            "principal_company": event.principal_company,
            "principal_company_cnpj": event.principal_company_cnpj,
            "process_number": event.process_number,
            "court": event.court,
            "publication_date": event.publication_date,
            "summary": event.summary,
            "recommended_action": event.recommended_action,
        }
        for event in events
    ]


@router.get("/documents")
def list_documents(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[dict]:
    documents = db.query(LegalDocument).order_by(LegalDocument.publication_date.desc()).limit(100).all()
    return [
        {
            "id": str(document.id),
            "title": document.title,
            "process_number": document.process_number,
            "court": document.court,
            "publication_date": document.publication_date,
            "source_url": document.source_url,
            "excerpt": document.content_text[:240],
        }
        for document in documents
    ]

