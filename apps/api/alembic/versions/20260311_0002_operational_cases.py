"""operational cases and workbook imports

Revision ID: 20260311_0002
Revises: 20260311_0001
Create Date: 2026-03-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260311_0002"
down_revision = "20260311_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    portfolio_type = sa.Enum("LAW_FUNDO", "LAW_SEC", name="portfoliotype")
    operational_priority = sa.Enum("ALTA", "MEDIA", "BAIXA", name="operationalpriority")
    follow_up_status = sa.Enum(
        "PENDENTE",
        "EM_ANDAMENTO",
        "AGUARDANDO_RETORNO",
        "CONCLUIDO",
        name="followupstatus",
    )

    portfolio_type.create(bind, checkfirst=True)
    operational_priority.create(bind, checkfirst=True)
    follow_up_status.create(bind, checkfirst=True)

    op.create_table(
        "workbook_import_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_name", sa.String(255), nullable=False),
        sa.Column("records_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary_json", sa.JSON()),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_workbook_import_runs_source_name", "workbook_import_runs", ["source_name"])
    op.create_index("ix_workbook_import_runs_imported_at", "workbook_import_runs", ["imported_at"])

    op.create_table(
        "operational_cases",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("import_run_id", sa.Uuid(), sa.ForeignKey("workbook_import_runs.id")),
        sa.Column("related_alert_id", sa.Uuid(), sa.ForeignKey("risk_alerts.id")),
        sa.Column("monitored_entity_id", sa.Uuid(), sa.ForeignKey("monitored_entities.id")),
        sa.Column("source_book", portfolio_type, nullable=False),
        sa.Column("spreadsheet_row_id", sa.String(50), nullable=False),
        sa.Column("cedente_name", sa.String(255), nullable=False),
        sa.Column("sacado_name", sa.String(255)),
        sa.Column("normalized_cedente_name", sa.String(255)),
        sa.Column("normalized_sacado_name", sa.String(255)),
        sa.Column("current_status", sa.String(120), nullable=False),
        sa.Column("current_phase", sa.String(120)),
        sa.Column("status_group", sa.String(80), nullable=False),
        sa.Column("follow_up_status", follow_up_status, nullable=False, server_default="PENDENTE"),
        sa.Column("priority", operational_priority, nullable=False, server_default="MEDIA"),
        sa.Column("document_sent_date", sa.Date()),
        sa.Column("filing_date", sa.Date()),
        sa.Column("action_amount", sa.Float()),
        sa.Column("legal_cost_amount", sa.Float()),
        sa.Column("process_number", sa.String(50)),
        sa.Column("latest_progress", sa.Text()),
        sa.Column("progress_updated_at", sa.Date()),
        sa.Column("internal_owner", sa.String(255)),
        sa.Column("next_action", sa.Text()),
        sa.Column("next_action_due_date", sa.Date()),
        sa.Column("aging_days", sa.Integer()),
        sa.Column("manual_review_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("internal_notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    for index_name, columns in [
        ("ix_operational_cases_monitored_entity_id", ["monitored_entity_id"]),
        ("ix_operational_cases_source_book", ["source_book"]),
        ("ix_operational_cases_spreadsheet_row_id", ["spreadsheet_row_id"]),
        ("ix_operational_cases_cedente_name", ["cedente_name"]),
        ("ix_operational_cases_sacado_name", ["sacado_name"]),
        ("ix_operational_cases_normalized_cedente_name", ["normalized_cedente_name"]),
        ("ix_operational_cases_normalized_sacado_name", ["normalized_sacado_name"]),
        ("ix_operational_cases_current_status", ["current_status"]),
        ("ix_operational_cases_current_phase", ["current_phase"]),
        ("ix_operational_cases_status_group", ["status_group"]),
        ("ix_operational_cases_follow_up_status", ["follow_up_status"]),
        ("ix_operational_cases_priority", ["priority"]),
        ("ix_operational_cases_process_number", ["process_number"]),
    ]:
        op.create_index(index_name, "operational_cases", columns)

    op.create_table(
        "operational_case_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("operational_case_id", sa.Uuid(), sa.ForeignKey("operational_cases.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("previous_status", sa.String(120)),
        sa.Column("new_status", sa.String(120)),
        sa.Column("previous_phase", sa.String(120)),
        sa.Column("new_phase", sa.String(120)),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("created_by", sa.String(255)),
        sa.Column("payload_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_operational_case_events_operational_case_id",
        "operational_case_events",
        ["operational_case_id"],
    )
    op.create_index(
        "ix_operational_case_events_event_type",
        "operational_case_events",
        ["event_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_operational_case_events_event_type", table_name="operational_case_events")
    op.drop_index(
        "ix_operational_case_events_operational_case_id",
        table_name="operational_case_events",
    )
    op.drop_table("operational_case_events")

    for index_name in [
        "ix_operational_cases_process_number",
        "ix_operational_cases_priority",
        "ix_operational_cases_follow_up_status",
        "ix_operational_cases_status_group",
        "ix_operational_cases_current_phase",
        "ix_operational_cases_current_status",
        "ix_operational_cases_normalized_sacado_name",
        "ix_operational_cases_normalized_cedente_name",
        "ix_operational_cases_sacado_name",
        "ix_operational_cases_cedente_name",
        "ix_operational_cases_spreadsheet_row_id",
        "ix_operational_cases_source_book",
        "ix_operational_cases_monitored_entity_id",
    ]:
        op.drop_index(index_name, table_name="operational_cases")
    op.drop_table("operational_cases")

    op.drop_index("ix_workbook_import_runs_imported_at", table_name="workbook_import_runs")
    op.drop_index("ix_workbook_import_runs_source_name", table_name="workbook_import_runs")
    op.drop_table("workbook_import_runs")

    bind = op.get_bind()
    sa.Enum(name="followupstatus").drop(bind, checkfirst=True)
    sa.Enum(name="operationalpriority").drop(bind, checkfirst=True)
    sa.Enum(name="portfoliotype").drop(bind, checkfirst=True)
