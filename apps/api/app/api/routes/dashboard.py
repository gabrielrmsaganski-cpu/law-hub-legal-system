from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entities import (
    AlertSeverity,
    LegalEvent,
    MatchResult,
    MonitoredEntity,
    RiskAlert,
    RunStatus,
    SchedulerRun,
)
from app.schemas.common import DashboardMetric, DashboardResponse
from app.services.operations import OperationalCaseService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(db: Session = Depends(get_db), _=Depends(get_current_user)) -> DashboardResponse:
    total_events = db.query(func.count(LegalEvent.id)).scalar() or 0
    total_alerts = db.query(func.count(RiskAlert.id)).scalar() or 0
    critical_today = db.query(func.count(RiskAlert.id)).filter(RiskAlert.severity == AlertSeverity.CRITICO).scalar() or 0
    matches = db.query(func.count(MatchResult.id)).scalar() or 0
    monitored_entities = db.query(func.count(MonitoredEntity.id)).scalar() or 0
    last_run = db.query(SchedulerRun).order_by(SchedulerRun.started_at.desc()).first()
    total_runs = db.query(func.count(SchedulerRun.id)).scalar() or 0
    successful_runs = (
        db.query(func.count(SchedulerRun.id)).filter(SchedulerRun.status == RunStatus.SUCCESS).scalar() or 0
    )
    run_ratio = f"{(successful_runs / total_runs * 100):.1f}%" if total_runs else "0%"

    event_distribution = [
        {"name": row[0], "value": row[1]}
        for row in db.query(LegalEvent.event_type, func.count(LegalEvent.id))
        .group_by(LegalEvent.event_type)
        .order_by(func.count(LegalEvent.id).desc())
        .limit(8)
        .all()
    ]
    severity_distribution = [
        {"name": row[0].value, "value": row[1]}
        for row in db.query(RiskAlert.severity, func.count(RiskAlert.id)).group_by(RiskAlert.severity).all()
    ]
    recent_timeline = [
        {
            "id": str(event.id),
            "title": event.event_type,
            "company": event.principal_company,
            "date": event.publication_date.isoformat() if event.publication_date else None,
        }
        for event in db.query(LegalEvent).order_by(LegalEvent.created_at.desc()).limit(8).all()
    ]
    operations_summary = OperationalCaseService(db).build_summary()
    return DashboardResponse(
        metrics=[
            DashboardMetric(label="Alertas criticos", value=str(critical_today), delta="prioridade imediata"),
            DashboardMetric(
                label="Empresas monitoradas",
                value=str(max(monitored_entities, operations_summary.get("tracked_companies", 0))),
                delta=f"{matches} matches gerados",
            ),
            DashboardMetric(
                label="Execucoes concluidas",
                value=run_ratio,
                delta=last_run.status.value if last_run else "pipeline pendente",
            ),
            DashboardMetric(
                label="Exposicao potencial",
                value=f"R$ {operations_summary['total_amount']:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                delta=f"{operations_summary['total_cases']} casos operacionais",
            ),
        ],
        event_distribution=event_distribution,
        severity_distribution=severity_distribution,
        recent_timeline=recent_timeline,
        integrations=[
            {"name": "Escavador", "status": "online" if last_run else "pending"},
            {"name": "OpenAI", "status": "online"},
        ],
        scheduler_status={
            "last_run": last_run.started_at.isoformat() if last_run and last_run.started_at else None,
            "status": last_run.status.value if last_run else "pending",
            "summary": last_run.summary_json if last_run else None,
        },
        operational_queue=[
            {
                "label": "Fila operacional",
                "value": operations_summary["total_cases"],
                "hint": "casos oriundos da planilha LAW",
            },
            {
                "label": "Alta prioridade",
                "value": operations_summary["high_priority_cases"],
                "hint": "casos com criticidade elevada",
            },
            {
                "label": "Revisao manual",
                "value": operations_summary["pending_manual_review"],
                "hint": "casos sem vinculo ou contexto suficiente",
            },
        ],
        portfolio_breakdown=operations_summary["by_portfolio"],
        priority_distribution=operations_summary["by_priority"],
        aging_buckets=operations_summary["aging_buckets"],
        exposure_leaders=operations_summary["top_cedentes"],
        recent_case_updates=operations_summary["recent_updates"],
    )
