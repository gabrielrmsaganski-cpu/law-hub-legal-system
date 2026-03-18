"""initial schema

Revision ID: 20260311_0001
Revises:
Create Date: 2026-03-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260311_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = sa.Enum("ADMIN", "JURIDICO", "RISCO", "LEITURA", name="userrole")
    match_type = sa.Enum("EXACT_MATCH", "ROOT_MATCH", "ECONOMIC_GROUP_MATCH", "FUZZY_NAME_MATCH", "PARTNER_MATCH", "MANUAL_REVIEW", name="matchtype")
    alert_severity = sa.Enum("CRITICO", "ALTO", "MEDIO", "BAIXO", name="alertseverity")
    alert_status = sa.Enum("NOVO", "EM_ANALISE", "CONFIRMADO", "DESCARTADO", name="alertstatus")
    run_status = sa.Enum("PENDING", "RUNNING", "SUCCESS", "FAILED", name="runstatus")

    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    match_type.create(bind, checkfirst=True)
    alert_severity.create(bind, checkfirst=True)
    alert_status.create(bind, checkfirst=True)
    run_status.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "economic_groups",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
    )
    op.create_index("ix_economic_groups_name", "economic_groups", ["name"], unique=True)

    op.create_table(
        "monitored_entities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("cnpj", sa.String(18)),
        sa.Column("corporate_name", sa.String(255), nullable=False),
        sa.Column("trade_name", sa.String(255)),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("exposure_amount", sa.Float()),
        sa.Column("internal_owner", sa.String(255)),
        sa.Column("notes", sa.Text()),
        sa.Column("monitoring_status", sa.String(30), nullable=False),
        sa.Column("normalized_name", sa.String(255)),
        sa.Column("cnpj_root", sa.String(8)),
        sa.Column("aliases", sa.JSON()),
        sa.Column("partners", sa.JSON()),
        sa.Column("group_id", sa.Uuid(), sa.ForeignKey("economic_groups.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    for index_name, columns in [
        ("ix_monitored_entities_cnpj", ["cnpj"]),
        ("ix_monitored_entities_cnpj_root", ["cnpj_root"]),
        ("ix_monitored_entities_corporate_name", ["corporate_name"]),
        ("ix_monitored_entities_entity_type", ["entity_type"]),
        ("ix_monitored_entities_normalized_name", ["normalized_name"]),
        ("ix_monitored_entities_trade_name", ["trade_name"]),
    ]:
        op.create_index(index_name, "monitored_entities", columns)

    op.create_table(
        "legal_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("external_id", sa.String(255)),
        sa.Column("process_number", sa.String(50)),
        sa.Column("title", sa.String(255)),
        sa.Column("court", sa.String(255)),
        sa.Column("publication_date", sa.DateTime()),
        sa.Column("document_date", sa.DateTime()),
        sa.Column("content_text", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(500)),
        sa.Column("dedup_key", sa.String(255), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("raw_payload_json", sa.JSON(), nullable=False),
        sa.Column("normalized_payload_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_legal_documents_dedup_key", "legal_documents", ["dedup_key"], unique=True)
    op.create_index("ix_legal_documents_external_id", "legal_documents", ["external_id"])
    op.create_index("ix_legal_documents_process_number", "legal_documents", ["process_number"])
    op.create_index("ix_legal_documents_source_hash", "legal_documents", ["source_hash"])

    op.create_table(
        "ai_extractions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("legal_documents.id"), nullable=False),
        sa.Column("prompt_version", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("extraction_json", sa.JSON(), nullable=False),
        sa.Column("summary_text", sa.Text()),
        sa.Column("confidence_score", sa.Float()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_unique_constraint("uq_ai_document_id", "ai_extractions", ["document_id"])

    op.create_table(
        "legal_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("legal_documents.id"), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("event_subtype", sa.String(100)),
        sa.Column("principal_company", sa.String(255)),
        sa.Column("principal_company_cnpj", sa.String(18)),
        sa.Column("process_number", sa.String(50)),
        sa.Column("court", sa.String(255)),
        sa.Column("event_date", sa.DateTime()),
        sa.Column("publication_date", sa.DateTime()),
        sa.Column("creditor_list_detected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("summary", sa.Text()),
        sa.Column("operational_impact", sa.Text()),
        sa.Column("recommended_action", sa.Text()),
        sa.Column("confidence_score", sa.Float()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_unique_constraint("uq_legal_events_document_id", "legal_events", ["document_id"])
    for index_name, columns in [
        ("ix_legal_events_event_type", ["event_type"]),
        ("ix_legal_events_principal_company", ["principal_company"]),
        ("ix_legal_events_principal_company_cnpj", ["principal_company_cnpj"]),
        ("ix_legal_events_process_number", ["process_number"]),
    ]:
        op.create_index(index_name, "legal_events", columns)

    op.create_table(
        "creditor_list_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("legal_event_id", sa.Uuid(), sa.ForeignKey("legal_events.id"), nullable=False),
        sa.Column("creditor_name", sa.String(255), nullable=False),
        sa.Column("creditor_document", sa.String(18)),
        sa.Column("amount", sa.Float()),
        sa.Column("class_name", sa.String(255)),
    )
    for index_name, columns in [
        ("ix_creditor_list_items_legal_event_id", ["legal_event_id"]),
        ("ix_creditor_list_items_creditor_name", ["creditor_name"]),
        ("ix_creditor_list_items_creditor_document", ["creditor_document"]),
    ]:
        op.create_index(index_name, "creditor_list_items", columns)

    op.create_table(
        "match_results",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("legal_event_id", sa.Uuid(), sa.ForeignKey("legal_events.id"), nullable=False),
        sa.Column("monitored_entity_id", sa.Uuid(), sa.ForeignKey("monitored_entities.id"), nullable=False),
        sa.Column("match_type", match_type, nullable=False),
        sa.Column("match_score", sa.Float(), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_match_results_legal_event_id", "match_results", ["legal_event_id"])
    op.create_index("ix_match_results_monitored_entity_id", "match_results", ["monitored_entity_id"])

    op.create_table(
        "risk_alerts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("match_result_id", sa.Uuid(), sa.ForeignKey("match_results.id"), nullable=False),
        sa.Column("severity", alert_severity, nullable=False),
        sa.Column("status", alert_status, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("recommended_action", sa.Text()),
        sa.Column("reviewed_by", sa.String(255)),
        sa.Column("reviewed_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_unique_constraint("uq_risk_alert_match_result_id", "risk_alerts", ["match_result_id"])
    op.create_index("ix_risk_alerts_severity", "risk_alerts", ["severity"])
    op.create_index("ix_risk_alerts_status", "risk_alerts", ["status"])

    op.create_table(
        "alert_actions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("alert_id", sa.Uuid(), sa.ForeignKey("risk_alerts.id"), nullable=False),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_alert_actions_alert_id", "alert_actions", ["alert_id"])

    op.create_table(
        "scheduler_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("run_type", sa.String(30), nullable=False),
        sa.Column("status", run_status, nullable=False),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("finished_at", sa.DateTime()),
        sa.Column("requested_by", sa.String(255)),
        sa.Column("reprocess_date", sa.Date()),
        sa.Column("manual", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("summary_json", sa.JSON()),
        sa.Column("error_message", sa.Text()),
    )
    op.create_index("ix_scheduler_runs_status", "scheduler_runs", ["status"])

    op.create_table(
        "integrations_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("operation", sa.String(100), nullable=False),
        sa.Column("status_code", sa.Integer()),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("request_payload_json", sa.JSON()),
        sa.Column("response_payload_json", sa.JSON()),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_integrations_log_provider", "integrations_log", ["provider"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_email", sa.String(255)),
        sa.Column("entity_name", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(100)),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("changes_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_email", "audit_logs", ["actor_email"])
    op.create_index("ix_audit_logs_entity_name", "audit_logs", ["entity_name"])

    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_index("ix_audit_logs_entity_name", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_email", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_integrations_log_provider", table_name="integrations_log")
    op.drop_table("integrations_log")
    op.drop_index("ix_scheduler_runs_status", table_name="scheduler_runs")
    op.drop_table("scheduler_runs")
    op.drop_index("ix_alert_actions_alert_id", table_name="alert_actions")
    op.drop_table("alert_actions")
    op.drop_index("ix_risk_alerts_status", table_name="risk_alerts")
    op.drop_index("ix_risk_alerts_severity", table_name="risk_alerts")
    op.drop_table("risk_alerts")
    op.drop_index("ix_match_results_monitored_entity_id", table_name="match_results")
    op.drop_index("ix_match_results_legal_event_id", table_name="match_results")
    op.drop_table("match_results")
    op.drop_index("ix_creditor_list_items_creditor_document", table_name="creditor_list_items")
    op.drop_index("ix_creditor_list_items_creditor_name", table_name="creditor_list_items")
    op.drop_index("ix_creditor_list_items_legal_event_id", table_name="creditor_list_items")
    op.drop_table("creditor_list_items")
    op.drop_index("ix_legal_events_process_number", table_name="legal_events")
    op.drop_index("ix_legal_events_principal_company_cnpj", table_name="legal_events")
    op.drop_index("ix_legal_events_principal_company", table_name="legal_events")
    op.drop_index("ix_legal_events_event_type", table_name="legal_events")
    op.drop_table("legal_events")
    op.drop_table("ai_extractions")
    op.drop_index("ix_legal_documents_source_hash", table_name="legal_documents")
    op.drop_index("ix_legal_documents_process_number", table_name="legal_documents")
    op.drop_index("ix_legal_documents_external_id", table_name="legal_documents")
    op.drop_index("ix_legal_documents_dedup_key", table_name="legal_documents")
    op.drop_table("legal_documents")
    op.drop_index("ix_monitored_entities_trade_name", table_name="monitored_entities")
    op.drop_index("ix_monitored_entities_normalized_name", table_name="monitored_entities")
    op.drop_index("ix_monitored_entities_entity_type", table_name="monitored_entities")
    op.drop_index("ix_monitored_entities_corporate_name", table_name="monitored_entities")
    op.drop_index("ix_monitored_entities_cnpj_root", table_name="monitored_entities")
    op.drop_index("ix_monitored_entities_cnpj", table_name="monitored_entities")
    op.drop_table("monitored_entities")
    op.drop_index("ix_economic_groups_name", table_name="economic_groups")
    op.drop_table("economic_groups")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

