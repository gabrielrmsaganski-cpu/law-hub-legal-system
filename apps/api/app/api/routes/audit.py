from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import AuditLog, IntegrationLog
from app.schemas.common import AuditLogOut, IntegrationLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs", response_model=list[AuditLogOut])
def list_audit_logs(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[AuditLog]:
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()


@router.get("/integrations", response_model=list[IntegrationLogOut])
def list_integration_logs(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[IntegrationLog]:
    return db.query(IntegrationLog).order_by(IntegrationLog.created_at.desc()).limit(100).all()
