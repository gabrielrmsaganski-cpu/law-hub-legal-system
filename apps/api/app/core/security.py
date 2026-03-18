from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_token(subject: str, expires_delta: timedelta, secret: str, token_type: str) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def create_access_token(subject: str) -> str:
    settings = get_settings()
    return create_token(
        subject,
        timedelta(minutes=settings.jwt_access_ttl_minutes),
        settings.jwt_secret,
        "access",
    )


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    return create_token(
        subject,
        timedelta(days=settings.jwt_refresh_ttl_days),
        settings.jwt_refresh_secret,
        "refresh",
    )


def decode_token(token: str, refresh: bool = False) -> dict[str, Any]:
    settings = get_settings()
    secret = settings.jwt_refresh_secret if refresh else settings.jwt_secret
    return jwt.decode(token, secret, algorithms=["HS256"])
