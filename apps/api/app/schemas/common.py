from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models.entities import (
    AlertSeverity,
    AlertStatus,
    FollowUpStatus,
    MatchType,
    OperationalPriority,
    PortfolioType,
    RunStatus,
    UserRole,
)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole


class DashboardMetric(BaseModel):
    label: str
    value: str
    delta: str | None = None


class DashboardResponse(BaseModel):
    metrics: list[DashboardMetric]
    event_distribution: list[dict[str, Any]]
    severity_distribution: list[dict[str, Any]]
    recent_timeline: list[dict[str, Any]]
    integrations: list[dict[str, Any]]
    scheduler_status: dict[str, Any]
    operational_queue: list[dict[str, Any]] = []
    portfolio_breakdown: list[dict[str, Any]] = []
    priority_distribution: list[dict[str, Any]] = []
    aging_buckets: list[dict[str, Any]] = []
    exposure_leaders: list[dict[str, Any]] = []
    recent_case_updates: list[dict[str, Any]] = []


class MonitoredEntityIn(BaseModel):
    cnpj: str | None = None
    corporate_name: str
    trade_name: str | None = None
    entity_type: str
    exposure_amount: float | None = None
    internal_owner: str | None = None
    notes: str | None = None
    monitoring_status: str = "active"
    aliases: list[str] = []
    partners: list[str] = []
    group_name: str | None = None


class MonitoredEntityOut(MonitoredEntityIn):
    id: UUID
    normalized_name: str | None = None
    cnpj_root: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LegalEventOut(BaseModel):
    id: UUID
    event_type: str
    event_subtype: str | None
    principal_company: str | None
    principal_company_cnpj: str | None
    process_number: str | None
    court: str | None
    event_date: datetime | None
    publication_date: datetime | None
    creditor_list_detected: bool
    summary: str | None
    operational_impact: str | None
    recommended_action: str | None
    confidence_score: float | None

    model_config = {"from_attributes": True}


class MatchResultOut(BaseModel):
    id: UUID
    match_type: MatchType
    match_score: float
    risk_score: float
    explanation: str
    details_json: dict[str, Any]
    created_at: datetime
    legal_event: LegalEventOut
    monitored_entity: MonitoredEntityOut

    model_config = {"from_attributes": True}


class AlertOut(BaseModel):
    id: UUID
    severity: AlertSeverity
    status: AlertStatus
    title: str
    summary: str
    recommended_action: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    match_result: MatchResultOut

    model_config = {"from_attributes": True}


class AlertUpdate(BaseModel):
    status: AlertStatus
    note: str | None = None


class SchedulerRunRequest(BaseModel):
    manual: bool = True


class SchedulerReprocessRequest(BaseModel):
    reprocess_date: date


class SchedulerRunOut(BaseModel):
    id: UUID
    run_type: str
    status: RunStatus
    started_at: datetime | None
    finished_at: datetime | None
    requested_by: str | None
    reprocess_date: date | None
    manual: bool
    summary_json: dict[str, Any] | None
    error_message: str | None

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: UUID
    actor_email: str | None
    entity_name: str
    entity_id: str | None
    action: str
    changes_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class IntegrationLogOut(BaseModel):
    id: UUID
    provider: str
    operation: str
    status_code: int | None
    success: bool
    request_payload_json: dict[str, Any] | None
    response_payload_json: dict[str, Any] | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OperationalCaseEventOut(BaseModel):
    id: UUID
    event_type: str
    title: str
    description: str | None
    previous_status: str | None
    new_status: str | None
    previous_phase: str | None
    new_phase: str | None
    source: str
    created_by: str | None
    payload_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OperationalCaseOut(BaseModel):
    id: UUID
    source_book: PortfolioType
    spreadsheet_row_id: str
    cedente_name: str
    sacado_name: str | None
    current_status: str
    current_phase: str | None
    status_group: str
    follow_up_status: FollowUpStatus
    priority: OperationalPriority
    document_sent_date: date | None
    filing_date: date | None
    action_amount: float | None
    legal_cost_amount: float | None
    process_number: str | None
    latest_progress: str | None
    progress_updated_at: date | None
    internal_owner: str | None
    next_action: str | None
    next_action_due_date: date | None
    aging_days: int | None
    manual_review_required: bool
    internal_notes: str | None
    monitored_entity_name: str | None = None
    related_alert_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class OperationalCaseSummary(BaseModel):
    total_cases: int
    total_amount: float
    high_priority_cases: int
    pending_manual_review: int
    by_portfolio: list[dict[str, Any]]
    by_status: list[dict[str, Any]]
    by_priority: list[dict[str, Any]]
    aging_buckets: list[dict[str, Any]]
    top_cedentes: list[dict[str, Any]]
    recent_updates: list[dict[str, Any]]


class OperationalCaseFollowUpUpdate(BaseModel):
    follow_up_status: FollowUpStatus
    priority: OperationalPriority | None = None
    internal_owner: str | None = None
    next_action: str | None = None
    next_action_due_date: date | None = None
    internal_notes: str | None = None


class OperationalCaseUpdate(BaseModel):
    current_status: str | None = None
    current_phase: str | None = None
    follow_up_status: FollowUpStatus | None = None
    priority: OperationalPriority | None = None
    document_sent_date: date | None = None
    filing_date: date | None = None
    action_amount: float | None = None
    legal_cost_amount: float | None = None
    process_number: str | None = None
    latest_progress: str | None = None
    progress_updated_at: date | None = None
    internal_owner: str | None = None
    next_action: str | None = None
    next_action_due_date: date | None = None
    manual_review_required: bool | None = None
    internal_notes: str | None = None


class OperationalCaseCreate(BaseModel):
    source_book: PortfolioType
    spreadsheet_row_id: str
    cedente_name: str
    sacado_name: str | None = None
    current_status: str
    current_phase: str | None = None
    follow_up_status: FollowUpStatus = FollowUpStatus.PENDENTE
    priority: OperationalPriority = OperationalPriority.MEDIA
    document_sent_date: date | None = None
    filing_date: date | None = None
    action_amount: float | None = None
    legal_cost_amount: float | None = None
    process_number: str | None = None
    latest_progress: str | None = None
    progress_updated_at: date | None = None
    internal_owner: str | None = None
    next_action: str | None = None
    next_action_due_date: date | None = None
    manual_review_required: bool = True
    internal_notes: str | None = None


class OperationalCaseAnalysisOut(BaseModel):
    summary_executive: str
    priority_justification: str
    owner_recommendation: str
    follow_up_recommendation: str
    key_risks: list[str]
    recommended_actions: list[str]
    risk_score: int
    match_confidence_score: int
    confidence_score: float
    structured_facts: dict[str, Any]
    generated_by: str


class OperationalCaseCommentCreate(BaseModel):
    message: str


class WorkbookImportResult(BaseModel):
    source_name: str
    records_total: int
    created_count: int
    updated_count: int
    summary: dict[str, Any]
