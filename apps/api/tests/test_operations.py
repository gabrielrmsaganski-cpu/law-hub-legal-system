from datetime import date
from pathlib import Path

from app.models.entities import FollowUpStatus, OperationalCase, OperationalPriority, PortfolioType
from app.services.operations import OperationalCaseService, WorkbookCaseParser


def test_workbook_parser_extracts_cases_from_law_workbook():
    workbook_path = Path(__file__).resolve().parents[3] / "Law Sistema Juridico (1).xlsx"

    records = WorkbookCaseParser(workbook_path).parse()

    assert len(records) == 67
    assert sum(1 for record in records if record.portfolio == PortfolioType.LAW_FUNDO) == 26
    assert sum(1 for record in records if record.portfolio == PortfolioType.LAW_SEC) == 41
    assert any(record.priority == OperationalPriority.ALTA for record in records)
    assert any(record.status_group == "insolvencia" for record in records)


def test_operational_case_analysis_fallback_builds_structured_assessment():
    case = OperationalCase(
        source_book=PortfolioType.LAW_SEC,
        spreadsheet_row_id="19",
        cedente_name="EMPRESA ALFA",
        sacado_name="EMPRESA BETA",
        current_status="Recuperacao judicial em andamento",
        current_phase="Habilitacao de credito",
        status_group="insolvencia",
        follow_up_status=FollowUpStatus.PENDENTE,
        priority=OperationalPriority.ALTA,
        action_amount=210000.0,
        latest_progress="Executada em recuperacao judicial e aguardando consolidacao do quadro geral de credores.",
        progress_updated_at=date(2026, 3, 1),
        internal_owner=None,
        next_action="Avaliar habilitacao de credito e consolidar exposicao.",
        aging_days=41,
        manual_review_required=True,
        internal_notes="Caso sensivel por impacto em carteira."
    )

    analysis = OperationalCaseService(None).analyze_case(case)

    assert analysis["risk_score"] >= 80
    assert analysis["match_confidence_score"] < 80
    assert analysis["generated_by"] == "heuristic-fallback"
    assert analysis["structured_facts"]["cedente"] == "EMPRESA ALFA"
    assert analysis["recommended_actions"]
