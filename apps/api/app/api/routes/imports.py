from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
import os

import pandas as pd
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import get_settings
from app.db.session import get_db
from app.models.entities import MonitoredEntity, UserRole
from app.services.operations import OperationalCaseService, WorkbookCaseParser
from app.utils.text import cnpj_root, normalize_name

router = APIRouter(prefix="/imports", tags=["imports"])


def _workbook_preview_payload(records: list) -> dict:
    sample = [
        {
            "portfolio": record.portfolio.value,
            "row_id": record.spreadsheet_row_id,
            "cedente_name": record.cedente_name,
            "sacado_name": record.sacado_name,
            "current_status": record.current_status,
            "priority": record.priority.value,
            "next_action": record.next_action,
            "action_amount": record.action_amount,
        }
        for record in records[:12]
    ]
    return {
        "exists": True,
        "records_total": len(records),
        "cases": sample,
        "summary": {
            "law_fundo": sum(1 for record in records if record.portfolio.value == "LAW_FUNDO"),
            "law_sec": sum(1 for record in records if record.portfolio.value == "LAW_SEC"),
            "high_priority": sum(1 for record in records if record.priority.value == "alta"),
        },
    }


def _persist_upload(file: UploadFile) -> Path:
    suffix = Path(file.filename or "workbook.xlsx").suffix or ".xlsx"
    content = file.file.read()
    with NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(content)
        return Path(handle.name)


def _read_dataframe(file: UploadFile) -> pd.DataFrame:
    content = file.file.read()
    suffix = file.filename.lower()
    if suffix.endswith(".csv"):
        return pd.read_csv(BytesIO(content))
    return pd.read_excel(BytesIO(content))


@router.post("/counterparties/preview")
def preview_import(file: UploadFile = File(...), _=Depends(require_roles(UserRole.ADMIN, UserRole.RISCO))) -> list[dict]:
    dataframe = _read_dataframe(file).fillna("")
    return dataframe.head(20).to_dict(orient="records")


@router.post("/counterparties/commit")
def commit_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_roles(UserRole.ADMIN, UserRole.RISCO)),
) -> dict:
    dataframe = _read_dataframe(file).fillna("")
    imported = 0
    updated = 0
    for row in dataframe.to_dict(orient="records"):
        cnpj = row.get("cnpj") or row.get("CNPJ")
        corporate_name = row.get("razao_social") or row.get("corporate_name") or row.get("Razao Social")
        if not corporate_name:
            continue
        entity = db.query(MonitoredEntity).filter(MonitoredEntity.cnpj == cnpj).first() if cnpj else None
        if entity:
            entity.corporate_name = corporate_name
            entity.trade_name = row.get("nome_fantasia") or row.get("trade_name")
            entity.entity_type = row.get("tipo") or row.get("entity_type") or entity.entity_type
            entity.exposure_amount = row.get("exposicao_financeira") or row.get("exposure_amount") or entity.exposure_amount
            entity.internal_owner = row.get("responsavel_interno") or row.get("internal_owner")
            entity.notes = row.get("observacoes") or row.get("notes")
            entity.monitoring_status = row.get("status_monitoramento") or row.get("monitoring_status") or "active"
            entity.normalized_name = normalize_name(corporate_name)
            entity.cnpj_root = cnpj_root(cnpj)
            updated += 1
        else:
            db.add(
                MonitoredEntity(
                    cnpj=cnpj,
                    corporate_name=corporate_name,
                    trade_name=row.get("nome_fantasia") or row.get("trade_name"),
                    entity_type=row.get("tipo") or row.get("entity_type") or "cedente",
                    exposure_amount=row.get("exposicao_financeira") or row.get("exposure_amount"),
                    internal_owner=row.get("responsavel_interno") or row.get("internal_owner"),
                    notes=row.get("observacoes") or row.get("notes"),
                    monitoring_status=row.get("status_monitoramento") or row.get("monitoring_status") or "active",
                    normalized_name=normalize_name(corporate_name),
                    cnpj_root=cnpj_root(cnpj),
                    aliases=[],
                    partners=[],
                )
            )
            imported += 1
    db.commit()
    return {"imported": imported, "updated": updated}


@router.get("/workbook/preview")
def preview_workbook_import(_=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO))) -> dict:
    settings = get_settings()
    root_dir = Path(__file__).resolve().parents[5]
    workbook_path = (
        Path(settings.law_workbook_path)
        if settings.law_workbook_path
        else root_dir / "Law Sistema Juridico (1).xlsx"
    )
    if not workbook_path.exists():
        return {"exists": False, "cases": [], "summary": {}}
    parser = WorkbookCaseParser(workbook_path)
    records = parser.parse()
    return _workbook_preview_payload(records)


@router.post("/workbook/preview-upload")
def preview_uploaded_workbook(
    file: UploadFile = File(...),
    _=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    temp_path = _persist_upload(file)
    try:
        records = WorkbookCaseParser(temp_path).parse()
        return _workbook_preview_payload(records)
    finally:
        os.unlink(temp_path)


@router.post("/workbook/commit")
def commit_workbook_import(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    settings = get_settings()
    root_dir = Path(__file__).resolve().parents[5]
    workbook_path = (
        Path(settings.law_workbook_path)
        if settings.law_workbook_path
        else root_dir / "Law Sistema Juridico (1).xlsx"
    )
    if not workbook_path.exists():
        return {"ok": False, "detail": "Planilha LAW nao encontrada"}
    result = OperationalCaseService(db).sync_from_workbook(workbook_path, actor_email=current_user.email)
    return {
        "ok": True,
        "source_name": result.source_name,
        "records_total": result.records_total,
        "created_count": result.created_count,
        "updated_count": result.updated_count,
        "summary": result.summary_json or {},
    }


@router.post("/workbook/commit-upload")
def commit_uploaded_workbook_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.JURIDICO, UserRole.RISCO)),
) -> dict:
    temp_path = _persist_upload(file)
    try:
        result = OperationalCaseService(db).sync_from_workbook(temp_path, actor_email=current_user.email)
        return {
            "ok": True,
            "source_name": file.filename or temp_path.name,
            "records_total": result.records_total,
            "created_count": result.created_count,
            "updated_count": result.updated_count,
            "summary": result.summary_json or {},
        }
    finally:
        os.unlink(temp_path)
