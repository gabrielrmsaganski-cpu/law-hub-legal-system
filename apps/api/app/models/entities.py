import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    JURIDICO = "juridico"
    RISCO = "risco"
    LEITURA = "leitura"


class AlertSeverity(str, enum.Enum):
    CRITICO = "critico"
    ALTO = "alto"
    MEDIO = "medio"
    BAIXO = "baixo"


class AlertStatus(str, enum.Enum):
    NOVO = "novo"
    EM_ANALISE = "em_analise"
    CONFIRMADO = "confirmado"
    DESCARTADO = "descartado"


class MatchType(str, enum.Enum):
    EXACT_MATCH = "EXACT_MATCH"
    ROOT_MATCH = "ROOT_MATCH"
    ECONOMIC_GROUP_MATCH = "ECONOMIC_GROUP_MATCH"
    FUZZY_NAME_MATCH = "FUZZY_NAME_MATCH"
    PARTNER_MATCH = "PARTNER_MATCH"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class RunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class PortfolioType(str, enum.Enum):
    LAW_FUNDO = "LAW_FUNDO"
    LAW_SEC = "LAW_SEC"


class OperationalPriority(str, enum.Enum):
    ALTA = "alta"
    MEDIA = "media"
    BAIXA = "baixa"


class FollowUpStatus(str, enum.Enum):
    PENDENTE = "pendente"
    EM_ANDAMENTO = "em_andamento"
    AGUARDANDO_RETORNO = "aguardando_retorno"
    CONCLUIDO = "concluido"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.LEITURA)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EconomicGroup(Base):
    __tablename__ = "economic_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)


class MonitoredEntity(Base):
    __tablename__ = "monitored_entities"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cnpj: Mapped[str | None] = mapped_column(String(18), index=True)
    corporate_name: Mapped[str] = mapped_column(String(255), index=True)
    trade_name: Mapped[str | None] = mapped_column(String(255), index=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    exposure_amount: Mapped[float | None] = mapped_column(Float)
    internal_owner: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    monitoring_status: Mapped[str] = mapped_column(String(30), default="active")
    normalized_name: Mapped[str | None] = mapped_column(String(255), index=True)
    cnpj_root: Mapped[str | None] = mapped_column(String(8), index=True)
    aliases: Mapped[list[str] | None] = mapped_column(JSON, default=list)
    partners: Mapped[list[str] | None] = mapped_column(JSON, default=list)
    group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("economic_groups.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    group: Mapped["EconomicGroup | None"] = relationship()


class LegalDocument(Base):
    __tablename__ = "legal_documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(50), default="escavador")
    external_id: Mapped[str | None] = mapped_column(String(255), index=True)
    process_number: Mapped[str | None] = mapped_column(String(50), index=True)
    title: Mapped[str | None] = mapped_column(String(255))
    court: Mapped[str | None] = mapped_column(String(255), index=True)
    publication_date: Mapped[datetime | None] = mapped_column(DateTime)
    document_date: Mapped[datetime | None] = mapped_column(DateTime)
    content_text: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500))
    dedup_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    source_hash: Mapped[str] = mapped_column(String(64), index=True)
    raw_payload_json: Mapped[dict] = mapped_column(JSON)
    normalized_payload_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIExtraction(Base):
    __tablename__ = "ai_extractions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("legal_documents.id"), unique=True)
    prompt_version: Mapped[str] = mapped_column(String(50))
    model_name: Mapped[str] = mapped_column(String(100))
    extraction_json: Mapped[dict] = mapped_column(JSON)
    summary_text: Mapped[str | None] = mapped_column(Text)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped["LegalDocument"] = relationship()


class LegalEvent(Base):
    __tablename__ = "legal_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("legal_documents.id"), unique=True)
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    event_subtype: Mapped[str | None] = mapped_column(String(100))
    principal_company: Mapped[str | None] = mapped_column(String(255), index=True)
    principal_company_cnpj: Mapped[str | None] = mapped_column(String(18), index=True)
    process_number: Mapped[str | None] = mapped_column(String(50), index=True)
    court: Mapped[str | None] = mapped_column(String(255))
    event_date: Mapped[datetime | None] = mapped_column(DateTime)
    publication_date: Mapped[datetime | None] = mapped_column(DateTime)
    creditor_list_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    summary: Mapped[str | None] = mapped_column(Text)
    operational_impact: Mapped[str | None] = mapped_column(Text)
    recommended_action: Mapped[str | None] = mapped_column(Text)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document: Mapped["LegalDocument"] = relationship()


class CreditorListItem(Base):
    __tablename__ = "creditor_list_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    legal_event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("legal_events.id"), index=True)
    creditor_name: Mapped[str] = mapped_column(String(255), index=True)
    creditor_document: Mapped[str | None] = mapped_column(String(18), index=True)
    amount: Mapped[float | None] = mapped_column(Float)
    class_name: Mapped[str | None] = mapped_column(String(255))

    event: Mapped["LegalEvent"] = relationship()


class MatchResult(Base):
    __tablename__ = "match_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    legal_event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("legal_events.id"), index=True)
    monitored_entity_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("monitored_entities.id"), index=True)
    match_type: Mapped[MatchType] = mapped_column(Enum(MatchType))
    match_score: Mapped[float] = mapped_column(Float)
    risk_score: Mapped[float] = mapped_column(Float)
    explanation: Mapped[str] = mapped_column(Text)
    details_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    legal_event: Mapped["LegalEvent"] = relationship()
    monitored_entity: Mapped["MonitoredEntity"] = relationship()


class RiskAlert(Base):
    __tablename__ = "risk_alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    match_result_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("match_results.id"), unique=True)
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), index=True)
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus), default=AlertStatus.NOVO, index=True)
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text)
    recommended_action: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(255))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    match_result: Mapped["MatchResult"] = relationship()


class AlertAction(Base):
    __tablename__ = "alert_actions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    alert_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("risk_alerts.id"), index=True)
    action_type: Mapped[str] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    alert: Mapped["RiskAlert"] = relationship()


class SchedulerRun(Base):
    __tablename__ = "scheduler_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    run_type: Mapped[str] = mapped_column(String(30), default="daily")
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), default=RunStatus.PENDING, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    requested_by: Mapped[str | None] = mapped_column(String(255))
    reprocess_date: Mapped[Date | None] = mapped_column(Date)
    manual: Mapped[bool] = mapped_column(Boolean, default=False)
    summary_json: Mapped[dict | None] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)


class IntegrationLog(Base):
    __tablename__ = "integrations_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(50), index=True)
    operation: Mapped[str] = mapped_column(String(100))
    status_code: Mapped[int | None] = mapped_column(Integer)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    request_payload_json: Mapped[dict | None] = mapped_column(JSON)
    response_payload_json: Mapped[dict | None] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    actor_email: Mapped[str | None] = mapped_column(String(255), index=True)
    entity_name: Mapped[str] = mapped_column(String(100), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(50))
    changes_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_json: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WorkbookImportRun(Base):
    __tablename__ = "workbook_import_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_name: Mapped[str] = mapped_column(String(255), index=True)
    records_total: Mapped[int] = mapped_column(Integer, default=0)
    created_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    summary_json: Mapped[dict | None] = mapped_column(JSON)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class OperationalCase(Base):
    __tablename__ = "operational_cases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    import_run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workbook_import_runs.id"))
    related_alert_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("risk_alerts.id"))
    monitored_entity_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("monitored_entities.id"), index=True)
    source_book: Mapped[PortfolioType] = mapped_column(Enum(PortfolioType), index=True)
    spreadsheet_row_id: Mapped[str] = mapped_column(String(50), index=True)
    cedente_name: Mapped[str] = mapped_column(String(255), index=True)
    sacado_name: Mapped[str | None] = mapped_column(String(255), index=True)
    normalized_cedente_name: Mapped[str | None] = mapped_column(String(255), index=True)
    normalized_sacado_name: Mapped[str | None] = mapped_column(String(255), index=True)
    current_status: Mapped[str] = mapped_column(String(120), index=True)
    current_phase: Mapped[str | None] = mapped_column(String(120), index=True)
    status_group: Mapped[str] = mapped_column(String(80), index=True)
    follow_up_status: Mapped[FollowUpStatus] = mapped_column(
        Enum(FollowUpStatus), default=FollowUpStatus.PENDENTE, index=True
    )
    priority: Mapped[OperationalPriority] = mapped_column(
        Enum(OperationalPriority), default=OperationalPriority.MEDIA, index=True
    )
    document_sent_date: Mapped[Date | None] = mapped_column(Date)
    filing_date: Mapped[Date | None] = mapped_column(Date)
    action_amount: Mapped[float | None] = mapped_column(Float)
    legal_cost_amount: Mapped[float | None] = mapped_column(Float)
    process_number: Mapped[str | None] = mapped_column(String(50), index=True)
    latest_progress: Mapped[str | None] = mapped_column(Text)
    progress_updated_at: Mapped[Date | None] = mapped_column(Date)
    internal_owner: Mapped[str | None] = mapped_column(String(255))
    next_action: Mapped[str | None] = mapped_column(Text)
    next_action_due_date: Mapped[Date | None] = mapped_column(Date)
    aging_days: Mapped[int | None] = mapped_column(Integer)
    manual_review_required: Mapped[bool] = mapped_column(Boolean, default=False)
    internal_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    import_run: Mapped["WorkbookImportRun | None"] = relationship()
    monitored_entity: Mapped["MonitoredEntity | None"] = relationship()
    related_alert: Mapped["RiskAlert | None"] = relationship()
    events: Mapped[list["OperationalCaseEvent"]] = relationship(
        back_populates="operational_case", cascade="all, delete-orphan"
    )


class OperationalCaseEvent(Base):
    __tablename__ = "operational_case_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    operational_case_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("operational_cases.id"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(50), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    previous_status: Mapped[str | None] = mapped_column(String(120))
    new_status: Mapped[str | None] = mapped_column(String(120))
    previous_phase: Mapped[str | None] = mapped_column(String(120))
    new_phase: Mapped[str | None] = mapped_column(String(120))
    source: Mapped[str] = mapped_column(String(50), default="spreadsheet")
    created_by: Mapped[str | None] = mapped_column(String(255))
    payload_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    operational_case: Mapped["OperationalCase"] = relationship(back_populates="events")
