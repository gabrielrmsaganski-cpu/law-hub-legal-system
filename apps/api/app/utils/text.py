import hashlib
import re
import unicodedata


def digits_only(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def cnpj_root(value: str | None) -> str | None:
    digits = digits_only(value)
    return digits[:8] if len(digits) >= 8 else None


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    ascii_text = re.sub(r"[^A-Za-z0-9 ]+", " ", ascii_text).upper()
    return re.sub(r"\s+", " ", ascii_text).strip()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

