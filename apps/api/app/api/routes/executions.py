from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.entities import SchedulerRun, UserRole
from app.schemas.common import SchedulerReprocessRequest, SchedulerRunOut, SchedulerRunRequest
from app.services.monitoring import MonitoringOrchestrator

router = APIRouter(prefix="/executions", tags=["executions"])


@router.get("", response_model=list[SchedulerRunOut])
def list_runs(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[SchedulerRun]:
    return db.query(SchedulerRun).order_by(SchedulerRun.started_at.desc()).limit(50).all()


@router.post("/run", response_model=SchedulerRunOut)
def run_execution(
    payload: SchedulerRunRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.RISCO)),
) -> SchedulerRun:
    orchestrator = MonitoringOrchestrator(db)
    return orchestrator.run(manual=payload.manual, requested_by=current_user.email)


@router.post("/reprocess", response_model=SchedulerRunOut)
def reprocess_execution(
    payload: SchedulerReprocessRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.RISCO)),
) -> SchedulerRun:
    orchestrator = MonitoringOrchestrator(db)
    return orchestrator.run(manual=True, requested_by=current_user.email, reprocess_date=payload.reprocess_date)
