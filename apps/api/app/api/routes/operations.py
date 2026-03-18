from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.core.config import get_settings
from app.db.session import get_db
from app.models.entities import OperationalCase, OperationalCaseEvent, UserRole
from app.schemas.common import (
    OperationalCaseAnalysisOut,
    OperationalCaseCommentCreate,
    OperationalCaseCreate,
    OperationalCaseFollowUpUpdate,
    OperationalCaseUpdate,
    WorkbookImportResult,
)
from app.services.audit import register_audit
from app.services.operations import OperationalCaseService

router = APIRouter(prefix="/operations", tags=["operations"])


def _case_to_dict(case: OperationalCase) -> dict:
    return {
        "id": str(case.id),
        "source_book": case.source_book.value,
        "spreadsheet_row_id": case.spreadsheet_row_id,
        "cedente_name": case.cedente_name,
        "sacado_name": case.sacado_name,
        "current_status": case.current_status,
        "current_phase": case.current_phase,
        "status_group": case.status_group,
        "follow_up_status": case.follow_up_status.value,
        "priority": case.priority.value,
        "document_sent_date": case.document_sent_date.isoformat() if case.document_sent_date else None,
        "filing_date": case.filing_date.isoformat() if case.filing_date else None,
        "action_amount": case.action_amount,
        "legal_cost_amount": case.legal_cost_amount,
        "process_number": case.process_number,
        "latest_progress": case.latest_progress,
        "progress_updated_at": case.progress_updated_at.isoformat() if case.progress_updated_at else None,
        "internal_owner": case.internal_owner,
        "next_action": case.next_action,
        "next_action_due_date": case.next_action_due_date.isoformat() if case.next_action_due_date else None,
        "aging_days": case.aging_days,
        "manual_review_required": case.manual_review_required,
        "internal_notes": case.internal_notes,
        "monitored_entity_name": case.monitored_entity.corporate_name if case.monitored_entity else None,
        "related_alert_id": str(case.related_alert_id) if case.related_alert_id else None,
        "created_at": case.created_at.isoformat(),
        "updated_at": case.updated_at.isoformat(),
    }


def _event_to_dict(event: OperationalCaseEvent) -> dict:
    return {
        "id": str(event.id),
        "event_type": event.event_type,
        "title": event.title,
        "description": event.description,
        "previous_status": event.previous_status,
        "new_status": event.new_status,
        "previous_phase": event.previous_phase,
        "new_phase": event.new_phase,
        "source": event.source,
        "created_by": event.created_by,
        "payload_json": event.payload_json,
        "created_at": event.created_at.isoformat(),
    }


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), _=Depends(get_current_user)) -> dict:
    return OperationalCaseService(db).build_summary()


@router.get("/cases")
def list_cases(
    search: str | None = Query(default=None),
    portfolio: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    follow_up_status: str | None = Query(default=None),
    status_group: str | None = Query(default=None),
    owner: str | None = Query(default=None),
    manual_review_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> list[dict]:
    query = (
        db.query(OperationalCase)
        .options(joinedload(OperationalCase.monitored_entity))
        .order_by(OperationalCase.updated_at.desc())
    )
    if search:
        token = f"%{search.strip()}%"
        query = query.filter(
            OperationalCase.cedente_name.ilike(token)
            | OperationalCase.sacado_name.ilike(token)
            | OperationalCase.current_status.ilike(token)
            | OperationalCase.process_number.ilike(token)
        )
    if portfolio:
        query = query.filter(OperationalCase.source_book == portfolio)
    if priority:
        query = query.filter(OperationalCase.priority == priority)
    if follow_up_status:
        query = query.filter(OperationalCase.follow_up_status == follow_up_status)
    if status_group:
        query = query.filter(OperationalCase.status_group == status_group)
    if owner:
        query = query.filter(OperationalCase.internal_owner.ilike(f"%{owner.strip()}%"))
    if manual_review_only:
        query = query.filter(OperationalCase.manual_review_required.is_(True))
    cases = query.all()
    return [_case_to_dict(case) for case in cases]


@router.post("/cases")
def create_case(
    payload: OperationalCaseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    case = OperationalCaseService(db).create_case(
        payload=payload.model_dump(mode="json"),
        actor_email=current_user.email,
    )
    return _case_to_dict(case)


@router.get("/cases/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)) -> dict:
    case = (
        db.query(OperationalCase)
        .options(
            joinedload(OperationalCase.monitored_entity),
            joinedload(OperationalCase.events),
        )
        .filter(OperationalCase.id == case_id)
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="Caso operacional nao encontrado")
    return {
        **_case_to_dict(case),
        "events": [_event_to_dict(event) for event in sorted(case.events, key=lambda item: item.created_at, reverse=True)],
    }


@router.post("/cases/{case_id}/follow-up")
def update_follow_up(
    case_id: str,
    payload: OperationalCaseFollowUpUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    case = db.query(OperationalCase).filter(OperationalCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Caso operacional nao encontrado")
    previous_status = case.follow_up_status.value
    previous_priority = case.priority.value
    case.follow_up_status = payload.follow_up_status
    if payload.priority is not None:
        case.priority = payload.priority
    if payload.internal_owner is not None:
        case.internal_owner = payload.internal_owner
    if payload.next_action is not None:
        case.next_action = payload.next_action
    if payload.next_action_due_date is not None:
        case.next_action_due_date = payload.next_action_due_date
    if payload.internal_notes is not None:
        case.internal_notes = payload.internal_notes
    db.add(
        OperationalCaseEvent(
            operational_case_id=case.id,
            event_type="follow_up_update",
            title="Atualizacao operacional",
            description=payload.internal_notes or payload.next_action,
            previous_status=previous_status,
            new_status=payload.follow_up_status.value,
            previous_phase=previous_priority,
            new_phase=case.priority.value,
            source="manual",
            created_by=current_user.email,
            payload_json=payload.model_dump(mode="json"),
        )
    )
    db.commit()
    register_audit(
        db,
        actor_email=current_user.email,
        entity_name="operational_case",
        entity_id=str(case.id),
        action="follow_up_update",
        changes=payload.model_dump(mode="json"),
    )
    return {"ok": True}


@router.patch("/cases/{case_id}")
def patch_case(
    case_id: str,
    payload: OperationalCaseUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    case = db.query(OperationalCase).filter(OperationalCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Caso operacional nao encontrado")
    changes = payload.model_dump(exclude_unset=True)
    case = OperationalCaseService(db).update_case(
        case,
        changes=changes,
        actor_email=current_user.email,
    )
    return _case_to_dict(case)


@router.post("/cases/{case_id}/analysis", response_model=OperationalCaseAnalysisOut)
def analyze_case(
    case_id: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
) -> OperationalCaseAnalysisOut:
    case = (
        db.query(OperationalCase)
        .options(joinedload(OperationalCase.monitored_entity))
        .filter(OperationalCase.id == case_id)
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="Caso operacional nao encontrado")
    analysis = OperationalCaseService(db).analyze_case(case)
    return OperationalCaseAnalysisOut(**analysis)


@router.post("/cases/{case_id}/comments")
def add_comment(
    case_id: str,
    payload: OperationalCaseCommentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    case = db.query(OperationalCase).filter(OperationalCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Caso operacional nao encontrado")
    db.add(
        OperationalCaseEvent(
            operational_case_id=case.id,
            event_type="comment",
            title="Comentario operacional",
            description=payload.message,
            previous_status=None,
            new_status=case.follow_up_status.value,
            previous_phase=None,
            new_phase=case.priority.value,
            source="manual",
            created_by=current_user.email,
            payload_json={"message": payload.message},
        )
    )
    db.commit()
    register_audit(
        db,
        actor_email=current_user.email,
        entity_name="operational_case",
        entity_id=str(case.id),
        action="comment_added",
        changes={"message": payload.message},
    )
    return {"ok": True}


@router.post("/sync", response_model=WorkbookImportResult)
def sync_workbook(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> WorkbookImportResult:
    settings = get_settings()
    root_dir = Path(__file__).resolve().parents[5]
    workbook_path = (
        Path(settings.law_workbook_path)
        if settings.law_workbook_path
        else root_dir / "Law Sistema Juridico (1).xlsx"
    )
    if not workbook_path.exists():
        raise HTTPException(status_code=404, detail="Planilha LAW nao encontrada para sincronizacao")
    import_run = OperationalCaseService(db).sync_from_workbook(
        workbook_path, actor_email=current_user.email
    )
    return WorkbookImportResult(
        source_name=import_run.source_name,
        records_total=import_run.records_total,
        created_count=import_run.created_count,
        updated_count=import_run.updated_count,
        summary=import_run.summary_json or {},
    )
