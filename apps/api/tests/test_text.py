from app.utils.text import cnpj_root, normalize_name, sha256_text


def test_cnpj_root():
    assert cnpj_root("12.345.678/0001-90") == "12345678"


def test_normalize_name():
    assert normalize_name("Árvore & Cia. Ltda") == "ARVORE CIA LTDA"


def test_sha_is_stable():
    assert sha256_text("abc") == sha256_text("abc")

