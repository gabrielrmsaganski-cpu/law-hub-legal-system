from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from app.models.entities import MatchType, MonitoredEntity
from app.utils.text import cnpj_root, digits_only, normalize_name


@dataclass
class MatchDecision:
    entity: MonitoredEntity
    match_type: MatchType
    match_score: float
    risk_score: float
    explanation: str
    details: dict


class MatchingEngine:
    def __init__(self, db: Session):
        self.db = db

    def evaluate(
        self,
        *,
        cnpj: str | None,
        company_name: str | None,
        other_names: list[str] | None,
        related_people: list[str] | None,
    ) -> list[MatchDecision]:
        decisions: list[MatchDecision] = []
        entities = self.db.query(MonitoredEntity).all()
        cnpj_digits = digits_only(cnpj)
        root = cnpj_root(cnpj)
        normalized_company = normalize_name(company_name)
        related_names = [normalize_name(name) for name in (other_names or []) if name]
        related_people_normalized = [normalize_name(name) for name in (related_people or []) if name]

        for entity in entities:
            entity_cnpj = digits_only(entity.cnpj)
            entity_root = cnpj_root(entity.cnpj)
            entity_name = entity.normalized_name or normalize_name(entity.corporate_name)
            alias_names = [normalize_name(alias) for alias in (entity.aliases or [])]
            partner_names = [normalize_name(partner) for partner in (entity.partners or [])]

            if cnpj_digits and entity_cnpj and cnpj_digits == entity_cnpj:
                decisions.append(MatchDecision(entity, MatchType.EXACT_MATCH, 1.0, 0.98, "CNPJ exato encontrado", {"field": "cnpj"}))
                continue
            if root and entity_root and root == entity_root:
                decisions.append(MatchDecision(entity, MatchType.ROOT_MATCH, 0.92, 0.9, "CNPJ raiz coincide com empresa monitorada", {"field": "cnpj_root"}))
                continue
            if normalized_company and normalized_company == entity_name:
                decisions.append(MatchDecision(entity, MatchType.FUZZY_NAME_MATCH, 0.9, 0.8, "Razao social normalizada coincide exatamente", {"field": "corporate_name"}))
                continue
            if normalized_company:
                score = max(
                    [fuzz.token_sort_ratio(normalized_company, candidate) / 100 for candidate in [entity_name, *alias_names, *related_names] if candidate] or [0.0]
                )
                if score >= 0.88:
                    decisions.append(
                        MatchDecision(
                            entity,
                            MatchType.FUZZY_NAME_MATCH,
                            round(score, 2),
                            round(min(0.75 + score / 4, 0.89), 2),
                            "Similaridade alta entre empresa extraida e base monitorada",
                            {"field": "name_similarity", "score": round(score, 2)},
                        )
                    )
                    continue
            if entity.group and any(entity.group.name.upper() in name for name in related_names):
                decisions.append(MatchDecision(entity, MatchType.ECONOMIC_GROUP_MATCH, 0.83, 0.84, "Grupo economico relacionado identificado", {"field": "economic_group"}))
                continue
            if related_people_normalized and set(related_people_normalized).intersection(partner_names):
                decisions.append(MatchDecision(entity, MatchType.PARTNER_MATCH, 0.8, 0.78, "Socio ou administrador relacionado encontrado", {"field": "partners"}))
        return sorted(decisions, key=lambda item: (item.risk_score, item.match_score), reverse=True)

