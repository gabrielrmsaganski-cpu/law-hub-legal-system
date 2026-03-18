from app.services.matching.engine import MatchingEngine
from app.utils.text import normalize_name


class DummyGroup:
    def __init__(self, name: str):
        self.name = name


class DummyEntity:
    def __init__(self, cnpj: str, name: str):
        self.id = "1"
        self.cnpj = cnpj
        self.corporate_name = name
        self.normalized_name = normalize_name(name)
        self.aliases = []
        self.partners = []
        self.group = DummyGroup("GRUPO TESTE")


class DummyQuery:
    def __init__(self, entities):
        self.entities = entities

    def all(self):
        return self.entities


class DummyDB:
    def __init__(self, entities):
        self.entities = entities

    def query(self, _):
        return DummyQuery(self.entities)


def test_exact_cnpj_has_priority():
    entity = DummyEntity("12.345.678/0001-90", "Empresa Teste SA")
    engine = MatchingEngine(DummyDB([entity]))
    results = engine.evaluate(cnpj="12.345.678/0001-90", company_name="Outra", other_names=[], related_people=[])
    assert results[0].match_type.value == "EXACT_MATCH"
    assert results[0].match_score == 1.0


def test_fuzzy_name_is_detected():
    entity = DummyEntity("12.345.678/0001-90", "Empresa Teste SA")
    engine = MatchingEngine(DummyDB([entity]))
    results = engine.evaluate(cnpj=None, company_name="Empresa Teste S/A", other_names=[], related_people=[])
    assert results
    assert results[0].match_score >= 0.88

