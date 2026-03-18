from __future__ import annotations

from io import BytesIO, StringIO

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session, joinedload

from app.models.entities import MatchResult, RiskAlert


class ExportService:
    def __init__(self, db: Session):
        self.db = db

    def _alerts_dataframe(self) -> pd.DataFrame:
        alerts = (
            self.db.query(RiskAlert)
            .options(
                joinedload(RiskAlert.match_result).joinedload(MatchResult.legal_event),
                joinedload(RiskAlert.match_result).joinedload(MatchResult.monitored_entity),
            )
            .all()
        )
        rows = []
        for alert in alerts:
            match = alert.match_result
            event = match.legal_event
            entity = match.monitored_entity
            rows.append(
                {
                    "alerta_id": str(alert.id),
                    "severidade": alert.severity.value,
                    "status": alert.status.value,
                    "empresa_monitorada": entity.corporate_name,
                    "cnpj_monitorado": entity.cnpj,
                    "tipo_evento": event.event_type,
                    "empresa_encontrada": event.principal_company,
                    "cnpj_encontrado": event.principal_company_cnpj,
                    "processo": event.process_number,
                    "tribunal": event.court,
                    "score_match": match.match_score,
                    "score_risco": match.risk_score,
                    "resumo": alert.summary,
                }
            )
        return pd.DataFrame(rows)

    def alerts_csv(self) -> bytes:
        buffer = StringIO()
        self._alerts_dataframe().to_csv(buffer, index=False)
        return buffer.getvalue().encode("utf-8-sig")

    def alerts_xlsx(self) -> bytes:
        buffer = BytesIO()
        with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
            self._alerts_dataframe().to_excel(writer, sheet_name="alerts", index=False)
        return buffer.getvalue()

    def executive_pdf(self) -> bytes:
        dataframe = self._alerts_dataframe().head(20)
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        y = height - 50
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(40, y, "LAW FIDC Risk Shield")
        y -= 24
        pdf.setFont("Helvetica", 10)
        pdf.drawString(40, y, "Relatorio executivo de alertas juridicos")
        y -= 30
        for _, row in dataframe.iterrows():
            lines = [
                f"{row['severidade'].upper()} | {row['empresa_monitorada']} | {row['tipo_evento']}",
                f"Processo: {row['processo']} | Tribunal: {row['tribunal']}",
                f"Resumo: {str(row['resumo'])[:110]}",
            ]
            for line in lines:
                if y < 60:
                    pdf.showPage()
                    y = height - 50
                pdf.drawString(40, y, line)
                y -= 16
            y -= 10
        pdf.save()
        return buffer.getvalue()

