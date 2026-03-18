from __future__ import annotations

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import (
    FollowUpStatus,
    MonitoredEntity,
    OperationalCase,
    OperationalCaseEvent,
    OperationalPriority,
    PortfolioType,
    WorkbookImportRun,
)
from app.services.audit import register_audit
from app.utils.text import normalize_name

WORKBOOK_SHEETS: dict[PortfolioType, str] = {
    PortfolioType.LAW_FUNDO: "LAW FUNDO",
    PortfolioType.LAW_SEC: "LAW SEC",
}
NAMESPACE = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
PROCESS_NUMBER_PATTERN = re.compile(r"\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}")
MONEY_PATTERN = re.compile(r"R\$\s*([\d\.\,]+)")


@dataclass
class WorkbookCaseRecord:
    portfolio: PortfolioType
    spreadsheet_row_id: str
    cedente_name: str
    sacado_name: str | None
    current_status: str
    current_phase: str | None
    document_sent_date: date | None
    filing_date: date | None
    action_amount: float | None
    legal_cost_amount: float | None
    latest_progress: str | None
    progress_updated_at: date | None
    internal_owner: str | None
    priority: OperationalPriority
    internal_notes: str | None
    process_number: str | None
    next_action: str | None
    aging_days: int | None
    manual_review_required: bool
    status_group: str


def _excel_date(value: str) -> date:
    return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()


def _to_float(value: Any) -> float | None:
    if value in (None, "", "--", "---"):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).strip().replace("R$", "").replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _clean_text(value: Any) -> str | None:
    if value in (None, "", "--", "---"):
        return None
    text = " ".join(str(value).replace("\n", " ").split())
    return text or None


def _parse_date(value: Any) -> date | None:
    if value in (None, "", "--", "---"):
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        return _excel_date(str(value))
    raw = str(value).strip()
    if raw.replace(".", "", 1).isdigit():
        return _excel_date(raw)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _infer_status_group(status: str, latest_progress: str | None) -> str:
    haystack = normalize_name(f"{status} {latest_progress or ''}")
    if "FALENCIA" in haystack:
        return "insolvencia"
    if "RECUPERACAO JUDICIAL" in haystack:
        return "insolvencia"
    if "ENCERRADO" in haystack:
        return "encerrado"
    if "APELACAO" in haystack or "JULG" in haystack or "PERICIA" in haystack:
        return "julgamento"
    if "EXECUCAO" in haystack or "PENHORA" in haystack:
        return "execucao"
    if "CITACAO" in haystack:
        return "citacao"
    if "NOTIFIC" in haystack:
        return "notificacao"
    if "SUSPENSO" in haystack or "INTERROMP" in haystack:
        return "suspenso"
    if "NAO INICIADA" in haystack or "NAO AJUIZADO" in haystack:
        return "pre_ajuizamento"
    return "andamento"


def _infer_priority(status: str, amount: float | None, latest_progress: str | None) -> OperationalPriority:
    haystack = normalize_name(f"{status} {latest_progress or ''}")
    if any(token in haystack for token in ["FALENCIA", "RECUPERACAO JUDICIAL", "PERICIA", "IDPJ"]):
        return OperationalPriority.ALTA
    if amount and amount >= 150000:
        return OperationalPriority.ALTA
    if any(token in haystack for token in ["EXECUCAO", "CITACAO", "EMBARGOS", "BLOQUEIO", "PENHORA"]):
        return OperationalPriority.MEDIA
    return OperationalPriority.BAIXA


def _infer_next_action(status: str, latest_progress: str | None) -> str | None:
    haystack = normalize_name(f"{status} {latest_progress or ''}")
    if "DOCUMENT" in haystack and "AGUARD" in haystack:
        return "Cobrar documentacao operacional e atualizar cadastro do caso."
    if "CITACAO" in haystack:
        return "Monitorar citacao e validar prazo para resposta ou cumprimento."
    if "EMBARGOS" in haystack:
        return "Preparar manifestacao processual sobre os embargos."
    if "CUSTAS" in haystack:
        return "Avaliar recolhimento de custas e destravar prosseguimento."
    if "RECUPERACAO JUDICIAL" in haystack:
        return "Avaliar estrategia de habilitacao ou impugnacao no processo recuperacional."
    if "FALENCIA" in haystack:
        return "Validar habilitacao no quadro geral de credores e risco de recuperacao."
    if "JULG" in haystack or "APELACAO" in haystack:
        return "Monitorar decisao e preparar proxima medida processual."
    if "EXECUCAO" in haystack or "PENHORA" in haystack:
        return "Acompanhar medidas expropriatorias e localizar patrimonio."
    if latest_progress:
        return "Atualizar andamento e definir responsavel interno para a proxima acao."
    return None


def _extract_process_number(latest_progress: str | None) -> str | None:
    if not latest_progress:
        return None
    match = PROCESS_NUMBER_PATTERN.search(latest_progress)
    return match.group(0) if match else None


def _extract_amount_from_progress(latest_progress: str | None) -> float | None:
    if not latest_progress:
        return None
    match = MONEY_PATTERN.search(latest_progress)
    if not match:
        return None
    return _to_float(match.group(1))


class WorkbookCaseParser:
    def __init__(self, workbook_path: Path):
        self.workbook_path = workbook_path

    def parse(self) -> list[WorkbookCaseRecord]:
        records: list[WorkbookCaseRecord] = []
        with zipfile.ZipFile(self.workbook_path) as archive:
            shared_strings = self._shared_strings(archive)
            date_styles = self._date_styles(archive)
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            rel_map = {
                rel.attrib["Id"]: rel.attrib["Target"]
                for rel in rels.findall("rel:Relationship", NAMESPACE)
            }
            for portfolio, sheet_name in WORKBOOK_SHEETS.items():
                sheet = next(
                    item
                    for item in workbook.find("main:sheets", NAMESPACE).findall("main:sheet", NAMESPACE)
                    if item.attrib["name"] == sheet_name
                )
                relation_id = sheet.attrib[
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ]
                target = rel_map[relation_id]
                if not target.startswith("xl/"):
                    target = f"xl/{target}"
                worksheet = ET.fromstring(archive.read(target))
                records.extend(
                    self._sheet_records(
                        worksheet=worksheet,
                        portfolio=portfolio,
                        shared_strings=shared_strings,
                        date_styles=date_styles,
                    )
                )
        return records

    def _shared_strings(self, archive: zipfile.ZipFile) -> list[str]:
        if "xl/sharedStrings.xml" not in archive.namelist():
            return []
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        values: list[str] = []
        for item in root.findall("main:si", NAMESPACE):
            values.append("".join(token.text or "" for token in item.iterfind(".//main:t", NAMESPACE)))
        return values

    def _date_styles(self, archive: zipfile.ZipFile) -> set[int]:
        if "xl/styles.xml" not in archive.namelist():
            return set()
        styles = ET.fromstring(archive.read("xl/styles.xml"))
        custom_formats: dict[int, str] = {}
        node = styles.find("main:numFmts", NAMESPACE)
        if node is not None:
            for item in node.findall("main:numFmt", NAMESPACE):
                custom_formats[int(item.attrib["numFmtId"])] = item.attrib["formatCode"].lower()
        date_styles: set[int] = set()
        cell_formats = styles.find("main:cellXfs", NAMESPACE)
        if cell_formats is None:
            return date_styles
        for index, item in enumerate(cell_formats.findall("main:xf", NAMESPACE)):
            format_id = int(item.attrib.get("numFmtId", 0))
            format_code = custom_formats.get(format_id, "")
            if format_id in {14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47}:
                date_styles.add(index)
            elif any(token in format_code for token in ["dd", "mm", "yy", "hh"]):
                date_styles.add(index)
        return date_styles

    def _sheet_records(
        self,
        *,
        worksheet: ET.Element,
        portfolio: PortfolioType,
        shared_strings: list[str],
        date_styles: set[int],
    ) -> list[WorkbookCaseRecord]:
        rows: list[list[Any]] = []
        for row in worksheet.findall(".//main:sheetData/main:row", NAMESPACE):
            cells: dict[int, Any] = {}
            for cell in row.findall("main:c", NAMESPACE):
                cells[self._column_index(cell.attrib["r"])] = self._cell_value(
                    cell, shared_strings, date_styles
                )
            if cells:
                rows.append([cells.get(index) for index in range(max(cells) + 1)])
        if not rows:
            return []
        headers = rows[0]
        header_index = {normalize_name(str(name)): index for index, name in enumerate(headers) if name is not None}
        records: list[WorkbookCaseRecord] = []
        for row in rows[1:]:
            row_id = self._row_value(row, header_index, "ID")
            cedente = _clean_text(self._row_value(row, header_index, "Cedente"))
            if row_id in (None, "") or not cedente:
                continue
            sacado = _clean_text(self._row_value(row, header_index, "Sacado"))
            status = _clean_text(self._row_value(row, header_index, "Status")) or "Sem status"
            latest_progress = _clean_text(self._row_value(row, header_index, "Ultimo Andamento"))
            action_amount = _to_float(self._row_value(row, header_index, "Valor da Acao"))
            if action_amount is None:
                action_amount = _extract_amount_from_progress(latest_progress)
            current_phase = _clean_text(self._row_value(row, header_index, "Fase"))
            priority = _infer_priority(status, action_amount, latest_progress)
            records.append(
                WorkbookCaseRecord(
                    portfolio=portfolio,
                    spreadsheet_row_id=str(row_id).replace(".0", ""),
                    cedente_name=cedente,
                    sacado_name=sacado,
                    current_status=status,
                    current_phase=current_phase,
                    document_sent_date=_parse_date(self._row_value(row, header_index, "Data Envio Docs")),
                    filing_date=_parse_date(self._row_value(row, header_index, "Data Ajuizamento")),
                    action_amount=action_amount,
                    legal_cost_amount=_to_float(self._row_value(row, header_index, "Custas Juridicas")),
                    latest_progress=latest_progress,
                    progress_updated_at=_parse_date(self._row_value(row, header_index, "Data Atualizacao")),
                    internal_owner=_clean_text(self._row_value(row, header_index, "Responsavel")),
                    priority=priority,
                    internal_notes=_clean_text(self._row_value(row, header_index, "Observacoes")),
                    process_number=_extract_process_number(latest_progress),
                    next_action=_infer_next_action(status, latest_progress),
                    aging_days=None,
                    manual_review_required=not bool(latest_progress and sacado),
                    status_group=_infer_status_group(status, latest_progress),
                )
            )
        return records

    def _column_index(self, cell_reference: str) -> int:
        value = 0
        for token in "".join(char for char in cell_reference if char.isalpha()):
            value = value * 26 + ord(token.upper()) - 64
        return value - 1

    def _cell_value(
        self, cell: ET.Element, shared_strings: list[str], date_styles: set[int]
    ) -> Any:
        value_node = cell.find("main:v", NAMESPACE)
        cell_type = cell.attrib.get("t")
        style_id = int(cell.attrib.get("s", "0"))
        if cell_type == "inlineStr":
            return "".join(token.text or "" for token in cell.findall(".//main:t", NAMESPACE))
        if value_node is None:
            return None
        raw = value_node.text
        if cell_type == "s":
            return shared_strings[int(raw)] if raw is not None else None
        if style_id in date_styles:
            try:
                return _excel_date(raw)
            except (TypeError, ValueError):
                return raw
        return raw

    def _row_value(self, row: list[Any], header_index: dict[str, int], key: str) -> Any:
        index = header_index.get(normalize_name(key))
        if index is not None and index < len(row):
            return row[index]
        return None


class OperationalCaseService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()
        self.client = OpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None

    def sync_from_workbook(self, workbook_path: Path, *, actor_email: str | None) -> WorkbookImportRun:
        parser = WorkbookCaseParser(workbook_path)
        records = parser.parse()
        import_run = WorkbookImportRun(source_name=workbook_path.name, records_total=len(records))
        self.db.add(import_run)
        self.db.commit()
        self.db.refresh(import_run)

        created_count = 0
        updated_count = 0
        entity_index = self._entity_index()

        for record in records:
            existing = (
                self.db.query(OperationalCase)
                .filter(
                    OperationalCase.source_book == record.portfolio,
                    OperationalCase.spreadsheet_row_id == record.spreadsheet_row_id,
                )
                .first()
            )
            linked_entity = self._match_entity(record, entity_index)
            payload = {
                "import_run_id": import_run.id,
                "source_book": record.portfolio,
                "spreadsheet_row_id": record.spreadsheet_row_id,
                "cedente_name": record.cedente_name,
                "sacado_name": record.sacado_name,
                "normalized_cedente_name": normalize_name(record.cedente_name),
                "normalized_sacado_name": normalize_name(record.sacado_name or "") if record.sacado_name else None,
                "monitored_entity_id": linked_entity.id if linked_entity else None,
                "current_status": record.current_status,
                "current_phase": record.current_phase,
                "status_group": record.status_group,
                "document_sent_date": record.document_sent_date,
                "filing_date": record.filing_date,
                "action_amount": record.action_amount,
                "legal_cost_amount": record.legal_cost_amount,
                "process_number": record.process_number,
                "latest_progress": record.latest_progress,
                "progress_updated_at": record.progress_updated_at,
                "internal_owner": record.internal_owner,
                "priority": record.priority,
                "next_action": record.next_action,
                "aging_days": self._aging_days(record),
                "manual_review_required": record.manual_review_required or linked_entity is None,
                "internal_notes": record.internal_notes,
            }
            if existing:
                previous_status = existing.current_status
                previous_phase = existing.current_phase
                for key, value in payload.items():
                    setattr(existing, key, value)
                updated_count += 1
                self._register_case_event(
                    existing,
                    event_type="spreadsheet_sync",
                    title="Sincronizacao da planilha LAW",
                    description=record.latest_progress,
                    previous_status=previous_status,
                    new_status=record.current_status,
                    previous_phase=previous_phase,
                    new_phase=record.current_phase,
                    created_by=actor_email,
                    payload={"portfolio": record.portfolio.value, "row_id": record.spreadsheet_row_id},
                )
            else:
                case = OperationalCase(**payload)
                self.db.add(case)
                self.db.flush()
                created_count += 1
                self._register_case_event(
                    case,
                    event_type="spreadsheet_sync",
                    title="Caso importado da planilha LAW",
                    description=record.latest_progress,
                    previous_status=None,
                    new_status=record.current_status,
                    previous_phase=None,
                    new_phase=record.current_phase,
                    created_by=actor_email,
                    payload={"portfolio": record.portfolio.value, "row_id": record.spreadsheet_row_id},
                )

        import_run.created_count = created_count
        import_run.updated_count = updated_count
        import_run.summary_json = self.build_summary()
        self.db.commit()

        register_audit(
            self.db,
            actor_email=actor_email,
            entity_name="workbook_import",
            entity_id=str(import_run.id),
            action="sync",
            changes={
                "source_name": workbook_path.name,
                "records_total": len(records),
                "created_count": created_count,
                "updated_count": updated_count,
            },
        )
        return import_run

    def build_summary(self) -> dict[str, Any]:
        cases = self.db.query(OperationalCase).all()
        total_amount = sum(case.action_amount or 0 for case in cases)
        status_counter = Counter(case.current_status for case in cases if case.current_status)
        priority_counter = Counter(case.priority.value for case in cases)
        portfolio_totals: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"portfolio": "", "cases": 0, "amount": 0.0, "high_priority": 0}
        )
        aging_buckets = {"0-15 dias": 0, "16-30 dias": 0, "31-60 dias": 0, "60+ dias": 0}
        cedente_totals: dict[str, float] = defaultdict(float)
        tracked_companies: set[str] = set()

        for case in cases:
            bucket = self._aging_bucket(case.aging_days)
            aging_buckets[bucket] += 1
            entry = portfolio_totals[case.source_book.value]
            entry["portfolio"] = case.source_book.value
            entry["cases"] += 1
            entry["amount"] += case.action_amount or 0
            if case.priority == OperationalPriority.ALTA:
                entry["high_priority"] += 1
            cedente_totals[case.cedente_name] += case.action_amount or 0
            tracked_companies.add(case.cedente_name)
            if case.sacado_name:
                tracked_companies.add(case.sacado_name)

        recent_updates = [
            {
                "id": str(case.id),
                "portfolio": case.source_book.value,
                "cedente": case.cedente_name,
                "sacado": case.sacado_name,
                "status": case.current_status,
                "priority": case.priority.value,
                "next_action": case.next_action,
            }
            for case in self.db.query(OperationalCase).order_by(OperationalCase.updated_at.desc()).limit(8).all()
        ]

        return {
            "total_cases": len(cases),
            "total_amount": total_amount,
            "high_priority_cases": sum(1 for case in cases if case.priority == OperationalPriority.ALTA),
            "pending_manual_review": sum(1 for case in cases if case.manual_review_required),
            "tracked_companies": len(tracked_companies),
            "by_portfolio": list(portfolio_totals.values()),
            "by_status": [
                {"name": key, "value": value}
                for key, value in status_counter.most_common()
            ],
            "by_priority": [
                {"name": key, "value": value}
                for key, value in priority_counter.most_common()
            ],
            "aging_buckets": [
                {"name": key, "value": value}
                for key, value in aging_buckets.items()
            ],
            "top_cedentes": [
                {"name": key, "value": value}
                for key, value in sorted(
                    cedente_totals.items(), key=lambda item: item[1], reverse=True
                )[:8]
            ],
            "recent_updates": recent_updates,
        }

    def create_case(self, *, payload: dict[str, Any], actor_email: str | None) -> OperationalCase:
        source_book = payload["source_book"]
        if isinstance(source_book, str):
            source_book = PortfolioType(source_book)

        follow_up_status = payload.get("follow_up_status", FollowUpStatus.PENDENTE)
        if isinstance(follow_up_status, str):
            follow_up_status = FollowUpStatus(follow_up_status)

        priority = payload.get("priority", OperationalPriority.MEDIA)
        if isinstance(priority, str):
            priority = OperationalPriority(priority)

        case = OperationalCase(
            source_book=source_book,
            spreadsheet_row_id=payload["spreadsheet_row_id"],
            cedente_name=payload["cedente_name"],
            sacado_name=payload.get("sacado_name"),
            normalized_cedente_name=normalize_name(payload["cedente_name"]),
            normalized_sacado_name=normalize_name(payload["sacado_name"])
            if payload.get("sacado_name")
            else None,
            current_status=payload["current_status"],
            current_phase=payload.get("current_phase"),
            status_group=_infer_status_group(payload["current_status"], payload.get("latest_progress")),
            follow_up_status=follow_up_status,
            priority=priority,
            document_sent_date=payload.get("document_sent_date"),
            filing_date=payload.get("filing_date"),
            action_amount=payload.get("action_amount"),
            legal_cost_amount=payload.get("legal_cost_amount"),
            process_number=payload.get("process_number"),
            latest_progress=payload.get("latest_progress"),
            progress_updated_at=payload.get("progress_updated_at"),
            internal_owner=payload.get("internal_owner"),
            next_action=payload.get("next_action"),
            next_action_due_date=payload.get("next_action_due_date"),
            manual_review_required=payload.get("manual_review_required", True),
            internal_notes=payload.get("internal_notes"),
        )

        case.aging_days = self._aging_days(
            WorkbookCaseRecord(
                portfolio=case.source_book,
                spreadsheet_row_id=case.spreadsheet_row_id,
                cedente_name=case.cedente_name,
                sacado_name=case.sacado_name,
                current_status=case.current_status,
                current_phase=case.current_phase,
                document_sent_date=case.document_sent_date,
                filing_date=case.filing_date,
                action_amount=case.action_amount,
                legal_cost_amount=case.legal_cost_amount,
                latest_progress=case.latest_progress,
                progress_updated_at=case.progress_updated_at,
                internal_owner=case.internal_owner,
                priority=case.priority,
                internal_notes=case.internal_notes,
                process_number=case.process_number,
                next_action=case.next_action,
                aging_days=None,
                manual_review_required=case.manual_review_required,
                status_group=case.status_group,
            )
        )

        self.db.add(case)
        self.db.flush()

        self._register_case_event(
            case,
            event_type="manual_create",
            title="Caso cadastrado manualmente",
            description=case.internal_notes or case.latest_progress or case.next_action,
            previous_status=None,
            new_status=case.current_status,
            previous_phase=None,
            new_phase=case.current_phase or case.priority.value,
            created_by=actor_email,
            payload={
                "source_book": case.source_book.value,
                "spreadsheet_row_id": case.spreadsheet_row_id,
            },
        )

        self.db.commit()
        self.db.refresh(case)

        register_audit(
            self.db,
            actor_email=actor_email,
            entity_name="operational_case",
            entity_id=str(case.id),
            action="manual_create",
            changes={
                "source_book": case.source_book.value,
                "spreadsheet_row_id": case.spreadsheet_row_id,
                "cedente_name": case.cedente_name,
                "sacado_name": case.sacado_name,
                "current_status": case.current_status,
            },
        )
        return case

    def update_case(
        self,
        case: OperationalCase,
        *,
        changes: dict[str, Any],
        actor_email: str | None,
    ) -> OperationalCase:
        previous_status = case.current_status
        previous_phase = case.current_phase
        previous_priority = case.priority.value
        previous_follow_up = case.follow_up_status.value

        if "current_status" in changes and changes["current_status"] is not None:
            case.current_status = changes["current_status"]
            case.status_group = _infer_status_group(case.current_status, changes.get("latest_progress", case.latest_progress))
        if "current_phase" in changes:
            case.current_phase = changes["current_phase"]
        if "follow_up_status" in changes and changes["follow_up_status"] is not None:
            case.follow_up_status = changes["follow_up_status"]
        if "priority" in changes and changes["priority"] is not None:
            case.priority = changes["priority"]
        if "document_sent_date" in changes:
            case.document_sent_date = changes["document_sent_date"]
        if "filing_date" in changes:
            case.filing_date = changes["filing_date"]
        if "action_amount" in changes:
            case.action_amount = changes["action_amount"]
        if "legal_cost_amount" in changes:
            case.legal_cost_amount = changes["legal_cost_amount"]
        if "process_number" in changes:
            case.process_number = changes["process_number"]
        if "latest_progress" in changes:
            case.latest_progress = changes["latest_progress"]
            case.status_group = _infer_status_group(case.current_status, case.latest_progress)
        if "progress_updated_at" in changes:
            case.progress_updated_at = changes["progress_updated_at"]
        if "internal_owner" in changes:
            case.internal_owner = changes["internal_owner"]
        if "next_action" in changes:
            case.next_action = changes["next_action"]
        if "next_action_due_date" in changes:
            case.next_action_due_date = changes["next_action_due_date"]
        if "manual_review_required" in changes and changes["manual_review_required"] is not None:
            case.manual_review_required = changes["manual_review_required"]
        if "internal_notes" in changes:
            case.internal_notes = changes["internal_notes"]

        case.aging_days = self._aging_days(
            WorkbookCaseRecord(
                portfolio=case.source_book,
                spreadsheet_row_id=case.spreadsheet_row_id,
                cedente_name=case.cedente_name,
                sacado_name=case.sacado_name,
                current_status=case.current_status,
                current_phase=case.current_phase,
                document_sent_date=case.document_sent_date,
                filing_date=case.filing_date,
                action_amount=case.action_amount,
                legal_cost_amount=case.legal_cost_amount,
                latest_progress=case.latest_progress,
                progress_updated_at=case.progress_updated_at,
                internal_owner=case.internal_owner,
                priority=case.priority,
                internal_notes=case.internal_notes,
                process_number=case.process_number,
                next_action=case.next_action,
                aging_days=case.aging_days,
                manual_review_required=case.manual_review_required,
                status_group=case.status_group,
            )
        )

        audit_changes = {
            key: (
                value.value
                if hasattr(value, "value")
                else value.isoformat()
                if hasattr(value, "isoformat")
                else value
            )
            for key, value in changes.items()
        }

        self._register_case_event(
            case,
            event_type="manual_edit",
            title="Caso operacional atualizado",
            description=case.internal_notes or case.latest_progress or case.next_action,
            previous_status=previous_status,
            new_status=case.current_status,
            previous_phase=previous_phase or previous_priority,
            new_phase=case.current_phase or case.priority.value,
            created_by=actor_email,
            payload={
                "changes": audit_changes,
                "previous_follow_up_status": previous_follow_up,
                "new_follow_up_status": case.follow_up_status.value,
            },
        )

        self.db.add(case)
        self.db.commit()
        self.db.refresh(case)

        register_audit(
            self.db,
            actor_email=actor_email,
            entity_name="operational_case",
            entity_id=str(case.id),
            action="manual_edit",
            changes=audit_changes,
        )
        return case

    def analyze_case(self, case: OperationalCase) -> dict[str, Any]:
        fallback = self._fallback_case_analysis(case)
        if not self.client:
            return {**fallback, "generated_by": "heuristic-fallback"}

        schema = {
            "name": "operational_case_analysis",
            "schema": {
                "type": "object",
                "properties": {
                    "summary_executive": {"type": "string"},
                    "priority_justification": {"type": "string"},
                    "owner_recommendation": {"type": "string"},
                    "follow_up_recommendation": {"type": "string"},
                    "key_risks": {"type": "array", "items": {"type": "string"}},
                    "recommended_actions": {"type": "array", "items": {"type": "string"}},
                    "risk_score": {"type": "integer"},
                    "match_confidence_score": {"type": "integer"},
                    "confidence_score": {"type": "number"},
                    "structured_facts": {
                        "type": "object",
                        "properties": {
                            "portfolio": {"type": ["string", "null"]},
                            "cedente": {"type": "string"},
                            "sacado": {"type": ["string", "null"]},
                            "status_atual": {"type": "string"},
                            "fase_atual": {"type": ["string", "null"]},
                            "follow_up_status": {"type": "string"},
                            "prioridade": {"type": "string"},
                            "owner": {"type": ["string", "null"]},
                            "aging_days": {"type": ["integer", "null"]},
                            "valor_acao": {"type": ["number", "null"]},
                            "custas_juridicas": {"type": ["number", "null"]},
                            "process_number": {"type": ["string", "null"]},
                            "manual_review_required": {"type": "boolean"},
                        },
                        "required": [
                            "portfolio",
                            "cedente",
                            "sacado",
                            "status_atual",
                            "fase_atual",
                            "follow_up_status",
                            "prioridade",
                            "owner",
                            "aging_days",
                            "valor_acao",
                            "custas_juridicas",
                            "process_number",
                            "manual_review_required",
                        ],
                        "additionalProperties": False,
                    },
                },
                "required": [
                    "summary_executive",
                    "priority_justification",
                    "owner_recommendation",
                    "follow_up_recommendation",
                    "key_risks",
                    "recommended_actions",
                    "risk_score",
                    "match_confidence_score",
                    "confidence_score",
                    "structured_facts",
                ],
                "additionalProperties": False,
            },
        }

        try:
            prompt = (
                "Analise o caso operacional juridico-financeiro abaixo e devolva estritamente um JSON no schema. "
                "Considere risco juridico, completude operacional, necessidade de revisao manual e proxima acao objetiva."
            )
            response = self.client.responses.create(
                model=self.settings.openai_model_primary,
                input=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": json.dumps(self._case_snapshot(case), ensure_ascii=False)},
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": schema["name"],
                        "schema": schema["schema"],
                        "strict": True,
                    }
                },
            )
            raw_text = getattr(response, "output_text", None)
            if raw_text:
                return {**json.loads(raw_text), "generated_by": self.settings.openai_model_primary}
        except Exception:
            pass

        return {**fallback, "generated_by": "heuristic-fallback"}

    def _entity_index(self) -> dict[str, MonitoredEntity]:
        entities = self.db.query(MonitoredEntity).all()
        index: dict[str, MonitoredEntity] = {}
        for entity in entities:
            candidates = {
                normalize_name(entity.corporate_name),
                normalize_name(entity.trade_name or ""),
                *(normalize_name(alias) for alias in (entity.aliases or [])),
            }
            for candidate in candidates:
                if candidate:
                    index[candidate] = entity
        return index

    def _match_entity(
        self, record: WorkbookCaseRecord, entity_index: dict[str, MonitoredEntity]
    ) -> MonitoredEntity | None:
        for raw_value in [record.cedente_name, record.sacado_name]:
            normalized = normalize_name(raw_value or "")
            if normalized and normalized in entity_index:
                return entity_index[normalized]
        return None

    def _case_snapshot(self, case: OperationalCase) -> dict[str, Any]:
        return {
            "portfolio": case.source_book.value,
            "cedente": case.cedente_name,
            "sacado": case.sacado_name,
            "status_atual": case.current_status,
            "fase_atual": case.current_phase,
            "grupo_status": case.status_group,
            "follow_up_status": case.follow_up_status.value,
            "prioridade": case.priority.value,
            "owner": case.internal_owner,
            "aging_days": case.aging_days,
            "valor_acao": case.action_amount,
            "custas_juridicas": case.legal_cost_amount,
            "process_number": case.process_number,
            "ultimo_andamento": case.latest_progress,
            "proxima_acao": case.next_action,
            "revisao_manual": case.manual_review_required,
            "notas_internas": case.internal_notes,
        }

    def _fallback_case_analysis(self, case: OperationalCase) -> dict[str, Any]:
        risk_score = self._risk_score(case)
        match_confidence_score = self._match_confidence_score(case)
        key_risks: list[str] = []
        recommended_actions: list[str] = []

        if case.manual_review_required:
            key_risks.append("Caso depende de revisao manual para consolidar contexto operacional.")
            recommended_actions.append("Validar owner, contraparte e integridade dos campos importados.")
        if case.action_amount and case.action_amount >= 150000:
            key_risks.append("Exposicao financeira relevante em relacao ao restante da carteira.")
            recommended_actions.append("Escalar o caso para revisao executiva e priorizar resposta juridica.")
        if case.status_group in {"insolvencia", "execucao"}:
            key_risks.append("Evento processual em estagio sensivel com potencial de impacto na recuperacao.")
            recommended_actions.append("Monitorar prazo processual e medidas patrimoniais sem depender da planilha.")
        if not case.internal_owner:
            key_risks.append("Nao ha owner interno definido para conduzir a tratativa.")
            recommended_actions.append("Atribuir responsavel e data de proxima acao.")
        if (case.aging_days or 0) > 30:
            key_risks.append("Caso com aging elevado sem atualizacao recente.")
            recommended_actions.append("Revisar o ultimo andamento e atualizar o caso no fluxo operacional.")
        if not recommended_actions and case.next_action:
            recommended_actions.append(case.next_action)
        if not key_risks:
            key_risks.append("Caso com contexto operacional relativamente completo, mas ainda dependente de monitoramento.")

        priority_justification = (
            f"Prioridade {case.priority.value} sustentada por status {case.current_status.lower()}"
            + (f", aging de {case.aging_days} dias" if case.aging_days is not None else "")
            + (f" e exposicao de {case.action_amount:.2f}" if case.action_amount else "")
            + "."
        )
        owner_recommendation = case.internal_owner or "Definir owner juridico-financeiro para assumir o caso."
        follow_up_recommendation = case.next_action or recommended_actions[0]

        return {
            "summary_executive": (
                f"{case.cedente_name} esta em {case.current_status.lower()} no portfolio {case.source_book.value.replace('_', ' ')}"
                + (f", contra {case.sacado_name}" if case.sacado_name else "")
                + ". O caso requer acompanhamento institucional dentro do sistema, com historico, owner e proxima acao claros."
            ),
            "priority_justification": priority_justification,
            "owner_recommendation": owner_recommendation,
            "follow_up_recommendation": follow_up_recommendation,
            "key_risks": key_risks[:4],
            "recommended_actions": recommended_actions[:4],
            "risk_score": risk_score,
            "match_confidence_score": match_confidence_score,
            "confidence_score": 0.78,
            "structured_facts": self._case_snapshot(case),
        }

    def _risk_score(self, case: OperationalCase) -> int:
        score = 35
        if case.priority == OperationalPriority.ALTA:
            score += 25
        elif case.priority == OperationalPriority.MEDIA:
            score += 12
        if case.status_group in {"insolvencia", "execucao"}:
            score += 20
        elif case.status_group in {"citacao", "julgamento"}:
            score += 10
        if case.manual_review_required:
            score += 8
        if case.action_amount and case.action_amount >= 150000:
            score += 10
        elif case.action_amount and case.action_amount >= 50000:
            score += 5
        if (case.aging_days or 0) > 30:
            score += 5
        return min(score, 100)

    def _match_confidence_score(self, case: OperationalCase) -> int:
        score = 45
        if case.monitored_entity_id:
            score += 25
        if case.sacado_name:
            score += 10
        if case.process_number:
            score += 8
        if case.latest_progress:
            score += 7
        if case.manual_review_required:
            score -= 15
        return max(min(score, 100), 0)

    def _aging_days(self, record: WorkbookCaseRecord) -> int | None:
        reference = record.progress_updated_at or record.filing_date or record.document_sent_date
        if not reference:
            return None
        return (datetime.now(UTC).date() - reference).days

    def _aging_bucket(self, aging_days: int | None) -> str:
        if aging_days is None:
            return "60+ dias"
        if aging_days <= 15:
            return "0-15 dias"
        if aging_days <= 30:
            return "16-30 dias"
        if aging_days <= 60:
            return "31-60 dias"
        return "60+ dias"

    def _register_case_event(
        self,
        case: OperationalCase,
        *,
        event_type: str,
        title: str,
        description: str | None,
        previous_status: str | None,
        new_status: str | None,
        previous_phase: str | None,
        new_phase: str | None,
        created_by: str | None,
        payload: dict[str, Any],
    ) -> None:
        if event_type == "spreadsheet_sync" and previous_status == new_status and previous_phase == new_phase:
            latest_event = (
                self.db.query(OperationalCaseEvent)
                .filter(OperationalCaseEvent.operational_case_id == case.id)
                .order_by(OperationalCaseEvent.created_at.desc())
                .first()
            )
            if latest_event and latest_event.title == title:
                return
        self.db.add(
            OperationalCaseEvent(
                operational_case_id=case.id,
                event_type=event_type,
                title=title,
                description=description,
                previous_status=previous_status,
                new_status=new_status,
                previous_phase=previous_phase,
                new_phase=new_phase,
                source="spreadsheet" if event_type == "spreadsheet_sync" else "manual",
                created_by=created_by,
                payload_json=payload,
            )
        )
