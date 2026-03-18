from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import (
    AlertSeverity,
    CreditorListItem,
    LegalDocument,
    LegalEvent,
    MatchResult,
    MonitoredEntity,
    RiskAlert,
    RunStatus,
    SchedulerRun,
)
from app.services.ai.extraction import AIExtractionService
from app.services.integrations.escavador import EscavadorClient
from app.services.matching.engine import MatchingEngine
from app.services.notifications.service import NotificationService
from app.utils.text import sha256_text


class MonitoringOrchestrator:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()
        self.redis = Redis.from_url(self.settings.redis_url, decode_responses=True)
        self._fallback_lock = False

    def _lock_key(self) -> str:
        return "law-monitor:daily-job-lock"

    def run(self, *, manual: bool, requested_by: str | None, reprocess_date: date | None = None) -> SchedulerRun:
        acquired = self._acquire_lock()
        if not acquired:
            raise RuntimeError("Ja existe uma execucao em andamento")

        run = SchedulerRun(
            manual=manual,
            requested_by=requested_by,
            reprocess_date=reprocess_date,
            status=RunStatus.RUNNING,
            started_at=datetime.now(UTC),
            run_type="reprocess" if reprocess_date else "daily",
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

        try:
            summary = self._execute_pipeline(reprocess_date)
            run.status = RunStatus.SUCCESS
            run.summary_json = summary
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.FAILED
            run.error_message = str(exc)
            self.db.commit()
            raise
        finally:
            run.finished_at = datetime.now(UTC)
            self.db.commit()
            self._release_lock()
        return run

    def _acquire_lock(self) -> bool:
        try:
            return bool(self.redis.set(self._lock_key(), "1", ex=3600, nx=True))
        except RedisError:
            if self._fallback_lock:
                return False
            self._fallback_lock = True
            return True

    def _release_lock(self) -> None:
        try:
            self.redis.delete(self._lock_key())
        except RedisError:
            self._fallback_lock = False

    def _execute_pipeline(self, reprocess_date: date | None) -> dict:
        escavador = EscavadorClient(self.db)
        ai_service = AIExtractionService(self.db)
        matcher = MatchingEngine(self.db)
        notifier = NotificationService(self.db)

        monitored_entities = (
            self.db.query(MonitoredEntity)
            .filter(MonitoredEntity.monitoring_status == "active")
            .all()
        )
        since = (
            datetime.combine(reprocess_date, datetime.min.time(), tzinfo=UTC)
            if reprocess_date
            else datetime.now(UTC) - timedelta(days=1)
        )

        processed_documents = 0
        generated_alerts = 0
        generated_matches = 0

        for entity in monitored_entities:
            processes = escavador.search_processes_for_entity(entity.cnpj, entity.corporate_name)
            for process in processes[:10]:
                process_number = process.get("numero_cnj") or process.get("numero")
                if not process_number:
                    continue
                detail = escavador.get_process_detail(process_number)
                candidate_documents = escavador.extract_candidate_documents(detail, since=since)
                for candidate in candidate_documents:
                    dedup_key = sha256_text(
                        "|".join(
                            [
                                str(process_number),
                                candidate.get("external_id") or "",
                                candidate.get("content_text", "")[:500],
                            ]
                        )
                    )
                    if self.db.query(LegalDocument).filter(LegalDocument.dedup_key == dedup_key).first():
                        continue

                    document = LegalDocument(
                        external_id=candidate.get("external_id"),
                        process_number=process_number,
                        title=candidate.get("title"),
                        court=detail.get("tribunal") or detail.get("orgao_julgador"),
                        publication_date=AIExtractionService.parse_datetime(candidate.get("publication_date")),
                        document_date=AIExtractionService.parse_datetime(candidate.get("document_date")),
                        content_text=candidate["content_text"],
                        source_url=candidate.get("source_url"),
                        dedup_key=dedup_key,
                        source_hash=sha256_text(candidate["content_text"]),
                        raw_payload_json={"candidate": candidate["raw_payload"], "process": detail},
                        normalized_payload_json={"process_number": process_number, "source": "escavador"},
                    )
                    self.db.add(document)
                    self.db.commit()
                    self.db.refresh(document)
                    processed_documents += 1

                    extraction = ai_service.extract_document(document)
                    extracted = extraction.extraction_json
                    event = LegalEvent(
                        document_id=document.id,
                        event_type=extracted.get("tipo_evento", "OUTRO"),
                        event_subtype=extracted.get("subtipo_evento"),
                        principal_company=extracted.get("empresa_principal"),
                        principal_company_cnpj=extracted.get("cnpj_empresa_principal"),
                        process_number=extracted.get("numero_processo") or document.process_number,
                        court=extracted.get("tribunal") or document.court,
                        event_date=AIExtractionService.parse_datetime(extracted.get("data_evento")),
                        publication_date=AIExtractionService.parse_datetime(extracted.get("data_publicacao")) or document.publication_date,
                        creditor_list_detected=bool(extracted.get("lista_credores_detectada")),
                        summary=extracted.get("resumo_juridico"),
                        operational_impact=extracted.get("impacto_operacional"),
                        recommended_action=extracted.get("acao_recomendada"),
                        confidence_score=extracted.get("confianca_extracao"),
                    )
                    self.db.add(event)
                    self.db.commit()
                    self.db.refresh(event)

                    for creditor in extracted.get("credores_extraidos", []):
                        self.db.add(
                            CreditorListItem(
                                legal_event_id=event.id,
                                creditor_name=creditor.get("nome"),
                                creditor_document=creditor.get("documento"),
                                amount=creditor.get("valor"),
                                class_name=creditor.get("classe"),
                            )
                        )
                    self.db.commit()

                    matches = matcher.evaluate(
                        cnpj=event.principal_company_cnpj,
                        company_name=event.principal_company,
                        other_names=extracted.get("outras_empresas", []),
                        related_people=[],
                    )
                    for decision in matches[:5]:
                        match = MatchResult(
                            legal_event_id=event.id,
                            monitored_entity_id=decision.entity.id,
                            match_type=decision.match_type,
                            match_score=decision.match_score,
                            risk_score=decision.risk_score,
                            explanation=decision.explanation,
                            details_json=decision.details,
                        )
                        self.db.add(match)
                        self.db.commit()
                        self.db.refresh(match)
                        generated_matches += 1

                        severity = self._severity_from_match(decision.match_score, event.event_type)
                        alert = RiskAlert(
                            match_result_id=match.id,
                            severity=severity,
                            title=f"{event.event_type} envolvendo {decision.entity.corporate_name}",
                            summary=event.summary or decision.explanation,
                            recommended_action=event.recommended_action,
                        )
                        self.db.add(alert)
                        self.db.commit()
                        self.db.refresh(alert)
                        generated_alerts += 1
                        notifier.notify(alert)

        return {
            "processed_documents": processed_documents,
            "generated_matches": generated_matches,
            "generated_alerts": generated_alerts,
            "monitored_entities": len(monitored_entities),
        }

    def _severity_from_match(self, match_score: float, event_type: str) -> AlertSeverity:
        critical_events = {"RECUPERACAO_JUDICIAL", "FALENCIA", "RELACAO_CREDORES"}
        if match_score >= 0.95 and event_type in critical_events:
            return AlertSeverity.CRITICO
        if match_score >= 0.9 or event_type in critical_events:
            return AlertSeverity.ALTO
        if match_score >= 0.8:
            return AlertSeverity.MEDIO
        return AlertSeverity.BAIXO
