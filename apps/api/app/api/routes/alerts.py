from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.entities import AlertAction, MatchResult, RiskAlert, UserRole
from app.schemas.common import AlertUpdate
from app.services.audit import register_audit
from app.services.exports.reporting import ExportService

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[dict]:
    alerts = (
        db.query(RiskAlert)
        .options(
            joinedload(RiskAlert.match_result).joinedload(MatchResult.legal_event),
            joinedload(RiskAlert.match_result).joinedload(MatchResult.monitored_entity),
        )
        .order_by(RiskAlert.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": str(alert.id),
            "severity": alert.severity.value,
            "status": alert.status.value,
            "title": alert.title,
            "summary": alert.summary,
            "recommended_action": alert.recommended_action,
            "created_at": alert.created_at,
            "event_type": alert.match_result.legal_event.event_type,
            "found_company": alert.match_result.legal_event.principal_company,
            "found_cnpj": alert.match_result.legal_event.principal_company_cnpj,
            "monitored_entity": alert.match_result.monitored_entity.corporate_name,
            "match_score": alert.match_result.match_score,
            "risk_score": alert.match_result.risk_score,
        }
        for alert in alerts
    ]


@router.get("/exports/{file_format}")
def export_alerts(file_format: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    exporter = ExportService(db)
    if file_format == "csv":
        return StreamingResponse(iter([exporter.alerts_csv()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=alerts.csv"})
    if file_format == "xlsx":
        return StreamingResponse(iter([exporter.alerts_xlsx()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=alerts.xlsx"})
    if file_format == "pdf":
        return StreamingResponse(iter([exporter.executive_pdf()]), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=alerts.pdf"})
    raise HTTPException(status_code=400, detail="Formato invalido")


@router.get("/{alert_id}")
def get_alert(alert_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)) -> dict:
    alert = (
        db.query(RiskAlert)
        .options(
            joinedload(RiskAlert.match_result).joinedload(MatchResult.legal_event),
            joinedload(RiskAlert.match_result).joinedload(MatchResult.monitored_entity),
        )
        .filter(RiskAlert.id == alert_id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta nao encontrado")
    event = alert.match_result.legal_event
    entity = alert.match_result.monitored_entity
    return {
        "id": str(alert.id),
        "severity": alert.severity.value,
        "status": alert.status.value,
        "title": alert.title,
        "summary": alert.summary,
        "recommended_action": alert.recommended_action,
        "event": {
            "type": event.event_type,
            "subtype": event.event_subtype,
            "company": event.principal_company,
            "cnpj": event.principal_company_cnpj,
            "process_number": event.process_number,
            "court": event.court,
            "publication_date": event.publication_date,
            "operational_impact": event.operational_impact,
        },
        "match": {
            "type": alert.match_result.match_type.value,
            "score": alert.match_result.match_score,
            "risk_score": alert.match_result.risk_score,
            "explanation": alert.match_result.explanation,
            "details": alert.match_result.details_json,
        },
        "monitored_entity": {
            "name": entity.corporate_name,
            "cnpj": entity.cnpj,
            "type": entity.entity_type,
            "exposure_amount": entity.exposure_amount,
            "internal_owner": entity.internal_owner,
        },
    }


@router.post("/{alert_id}/status")
def update_alert(
    alert_id: str,
    payload: AlertUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    alert = db.query(RiskAlert).filter(RiskAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerta nao encontrado")
    alert.status = payload.status
    alert.reviewed_by = current_user.email
    if payload.note:
        db.add(
            AlertAction(
                alert_id=alert.id,
                action_type="status_change",
                notes=payload.note,
                created_by=current_user.email,
            )
        )
    db.commit()
    register_audit(
        db,
        actor_email=current_user.email,
        entity_name="risk_alert",
        entity_id=str(alert.id),
        action="update_status",
        changes=payload.model_dump(),
    )
    return {"ok": True}
