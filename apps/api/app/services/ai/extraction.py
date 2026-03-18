from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import AIExtraction, LegalDocument
from app.services.ai.prompt_templates import LEGAL_EXTRACTION_PROMPT, PROMPT_VERSION
from app.utils.text import normalize_name


class AIExtractionService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()
        self.client = OpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None

    def _fallback_extract(self, text: str) -> dict[str, Any]:
        cnpjs = re.findall(r"\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}", text)
        process_match = re.search(r"\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}", text)
        lower = text.lower()
        event_type = "OUTRO"
        for keyword, mapped in [
            ("recuperacao judicial", "RECUPERACAO_JUDICIAL"),
            ("falencia", "FALENCIA"),
            ("edital", "EDITAL"),
            ("credores", "RELACAO_CREDORES"),
            ("habilitacao", "HABILITACAO_CREDITO"),
            ("impugnacao", "IMPUGNACAO_CREDITO"),
        ]:
            if keyword in lower:
                event_type = mapped
                break
        company_guess = None
        company_match = re.search(r"empresa[:\s]+([A-Za-z0-9 .&/-]+)", text, re.IGNORECASE)
        if company_match:
            company_guess = company_match.group(1).strip()
        return {
            "tipo_evento": event_type,
            "subtipo_evento": None,
            "empresa_principal": company_guess,
            "cnpj_empresa_principal": cnpjs[0] if cnpjs else None,
            "outras_empresas": [],
            "cpfs_cnpjs_identificados": cnpjs,
            "numero_processo": process_match.group(0) if process_match else None,
            "tribunal": None,
            "data_evento": None,
            "data_publicacao": None,
            "lista_credores_detectada": "credores" in lower,
            "credores_extraidos": [],
            "resumo_juridico": normalize_name(text)[:700],
            "impacto_operacional": "Evento juridico relevante identificado. Validar exposicao e fluxo de cobranca.",
            "acao_recomendada": "Validar CNPJ exato, revisar exposicao e escalar para juridico e risco.",
            "confianca_extracao": 0.55,
        }

    def _call_openai(self, text: str) -> dict[str, Any]:
        if not self.client:
            return self._fallback_extract(text)
        schema = {
            "name": "legal_event_extraction",
            "schema": {
                "type": "object",
                "properties": {
                    "tipo_evento": {"type": "string"},
                    "subtipo_evento": {"type": ["string", "null"]},
                    "empresa_principal": {"type": ["string", "null"]},
                    "cnpj_empresa_principal": {"type": ["string", "null"]},
                    "outras_empresas": {"type": "array", "items": {"type": "string"}},
                    "cpfs_cnpjs_identificados": {"type": "array", "items": {"type": "string"}},
                    "numero_processo": {"type": ["string", "null"]},
                    "tribunal": {"type": ["string", "null"]},
                    "data_evento": {"type": ["string", "null"]},
                    "data_publicacao": {"type": ["string", "null"]},
                    "lista_credores_detectada": {"type": "boolean"},
                    "credores_extraidos": {"type": "array", "items": {"type": "object"}},
                    "resumo_juridico": {"type": "string"},
                    "impacto_operacional": {"type": "string"},
                    "acao_recomendada": {"type": "string"},
                    "confianca_extracao": {"type": "number"},
                },
                "required": [
                    "tipo_evento",
                    "subtipo_evento",
                    "empresa_principal",
                    "cnpj_empresa_principal",
                    "outras_empresas",
                    "cpfs_cnpjs_identificados",
                    "numero_processo",
                    "tribunal",
                    "data_evento",
                    "data_publicacao",
                    "lista_credores_detectada",
                    "credores_extraidos",
                    "resumo_juridico",
                    "impacto_operacional",
                    "acao_recomendada",
                    "confianca_extracao",
                ],
                "additionalProperties": False,
            },
            "strict": True,
        }
        response = self.client.responses.create(
            model=self.settings.openai_model_primary,
            input=[
                {"role": "system", "content": LEGAL_EXTRACTION_PROMPT},
                {"role": "user", "content": text[:12000]},
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
            return json.loads(raw_text)
        return self._fallback_extract(text)

    def extract_document(self, document: LegalDocument) -> AIExtraction:
        existing = self.db.query(AIExtraction).filter(AIExtraction.document_id == document.id).first()
        if existing:
            return existing
        extraction_json = self._call_openai(document.content_text)
        extraction = AIExtraction(
            document_id=document.id,
            prompt_version=PROMPT_VERSION,
            model_name=self.settings.openai_model_primary if self.client else "heuristic-fallback",
            extraction_json=extraction_json,
            summary_text=extraction_json.get("resumo_juridico"),
            confidence_score=extraction_json.get("confianca_extracao"),
        )
        self.db.add(extraction)
        self.db.commit()
        self.db.refresh(extraction)
        return extraction

    @staticmethod
    def parse_datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

