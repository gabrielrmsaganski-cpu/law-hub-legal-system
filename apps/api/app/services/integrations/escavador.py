from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_fixed

from app.core.config import get_settings
from app.models.entities import IntegrationLog
from app.utils.text import digits_only

RELEVANT_KEYWORDS = [
    "recuperacao judicial",
    "pedido de recuperacao judicial",
    "deferimento do processamento",
    "falencia",
    "convolacao em falencia",
    "edital de credores",
    "relacao nominal de credores",
    "quadro geral de credores",
    "habilitacao de credito",
    "impugnacao de credito",
    "administrador judicial",
]


class EscavadorClient:
    def __init__(self, db: Session):
        self.settings = get_settings()
        self.db = db
        self.headers = {
            "Authorization": f"Bearer {self.settings.escavador_api_key}",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
        }

    def _log(
        self,
        *,
        operation: str,
        success: bool,
        status_code: int | None,
        request_payload: dict[str, Any] | None,
        response_payload: dict[str, Any] | None,
        error_message: str | None = None,
    ) -> None:
        self.db.add(
            IntegrationLog(
                provider="escavador",
                operation=operation,
                status_code=status_code,
                success=success,
                request_payload_json=request_payload,
                response_payload_json=response_payload,
                error_message=error_message,
            )
        )
        self.db.commit()

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
    def _request(self, method: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.settings.escavador_base_url.rstrip('/')}/{path.lstrip('/')}"
        with httpx.Client(timeout=30) as client:
            response = client.request(method, url, params=params, headers=self.headers)
            try:
                payload = response.json()
            except Exception:  # noqa: BLE001
                payload = {"raw_text": response.text}
            self._log(
                operation=path,
                success=response.is_success,
                status_code=response.status_code,
                request_payload=params,
                response_payload=payload,
                error_message=None if response.is_success else response.text[:500],
            )
            response.raise_for_status()
            return payload

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
    def _request_v1(self, method: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.settings.escavador_v1_base_url.rstrip('/')}/{path.lstrip('/')}"
        with httpx.Client(timeout=30) as client:
            response = client.request(method, url, params=params, headers=self.headers)
            try:
                payload = response.json()
            except Exception:  # noqa: BLE001
                payload = {"raw_text": response.text}
            self._log(
                operation=f"v1/{path}",
                success=response.is_success,
                status_code=response.status_code,
                request_payload=params,
                response_payload=payload,
                error_message=None if response.is_success else response.text[:500],
            )
            response.raise_for_status()
            return payload

    def search_processes_for_entity(self, cnpj: str | None, name: str) -> list[dict[str, Any]]:
        if not self.settings.escavador_api_key:
            raise RuntimeError("ESCAVADOR_API_KEY nao configurada")
        document = digits_only(cnpj)
        if not document and not name:
            return []
        query = document or f'"{name}"'
        try:
            search_payload = self._request_v1(
                "GET",
                "busca",
                params={
                    "q": query,
                    "qo": "en",
                    "page": 1,
                    "limit": 20,
                    "utilizar_operadores_logicos": 0,
                },
            )
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            if "402" in message:
                raise RuntimeError(
                    "Token Escavador valido, mas a conta atual nao possui acesso de busca por envolvidos/instituicoes (HTTP 402)."
                ) from exc
            raise
        items = search_payload.get("items") or []
        processes: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("tipo_resultado") != "Instituicao":
                continue
            institution_link = item.get("link_api", "")
            institution_id = str(item.get("id") or "").strip()
            if not institution_id and institution_link:
                institution_id = institution_link.rstrip("/").split("/")[-1]
            if not institution_id:
                continue
            institution_processes = self._request_v1(
                "GET",
                f"instituicoes/{institution_id}/processos",
                params={"limit": 20, "page": 1},
            )
            for process in institution_processes.get("items", []):
                if isinstance(process, dict):
                    processes.append(process)
        return processes

    def get_process_detail(self, process_number: str) -> dict[str, Any]:
        return self._request("GET", f"processos/numero_cnj/{process_number}")

    def extract_candidate_documents(
        self,
        process_payload: dict[str, Any],
        *,
        since: datetime | None,
    ) -> list[dict[str, Any]]:
        documents: list[dict[str, Any]] = []
        movements = process_payload.get("movimentos") or process_payload.get("movements") or []
        publications = process_payload.get("publicacoes") or process_payload.get("publications") or []
        combined = [
            *[{"kind": "movimento", **movement} for movement in movements if isinstance(movement, dict)],
            *[{"kind": "publicacao", **publication} for publication in publications if isinstance(publication, dict)],
        ]
        for item in combined:
            text = " ".join(
                str(item.get(field) or "")
                for field in ("conteudo", "texto", "titulo", "descricao", "resumo")
            ).strip()
            normalized = text.lower()
            if not text:
                continue
            if since:
                raw_date = item.get("data") or item.get("data_publicacao") or item.get("created_at")
                if raw_date:
                    try:
                        date_value = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                        if date_value < since:
                            continue
                    except ValueError:
                        pass
            if any(keyword in normalized for keyword in RELEVANT_KEYWORDS):
                documents.append(
                    {
                        "external_id": str(item.get("id") or item.get("uuid") or ""),
                        "title": item.get("titulo") or item.get("descricao"),
                        "content_text": text,
                        "publication_date": item.get("data_publicacao") or item.get("data"),
                        "document_date": item.get("data"),
                        "source_url": item.get("url"),
                        "raw_payload": item,
                    }
                )
        return documents
