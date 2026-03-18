from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import MatchResult

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("")
def list_matches(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[dict]:
    matches = (
        db.query(MatchResult)
        .options(joinedload(MatchResult.legal_event), joinedload(MatchResult.monitored_entity))
        .order_by(MatchResult.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": str(match.id),
            "match_type": match.match_type.value,
            "match_score": match.match_score,
            "risk_score": match.risk_score,
            "explanation": match.explanation,
            "event_type": match.legal_event.event_type,
            "company": match.monitored_entity.corporate_name,
            "cnpj": match.monitored_entity.cnpj,
        }
        for match in matches
    ]

