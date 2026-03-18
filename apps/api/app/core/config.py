from pathlib import Path
from functools import lru_cache
from typing import Literal

from pydantic import EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(str(ROOT_ENV_FILE), ".env"), extra="ignore")

    app_name: str = "LAW Juridico Monitor API"
    system_brand_name: str = "LAW FIDC Risk Shield"
    environment: Literal["development", "staging", "production"] = "development"
    api_prefix: str = "/api/v1"
    app_timezone: str = "America/Sao_Paulo"

    database_url: str = "sqlite:///./law_hub.db"
    redis_url: str = "redis://localhost:6379/0"

    escavador_api_key: str = ""
    escavador_v1_base_url: str = "https://api.escavador.com/api/v1"
    escavador_base_url: str = "https://api.escavador.com/api/v2"
    openai_api_key: str = ""
    openai_model_primary: str = "gpt-5.4"
    openai_model_secondary: str = "gpt-5-mini"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    alert_email_from: EmailStr = "alerts@lawmonitor.com"
    alert_email_to: str = "risk@lawmonitor.com"
    alert_webhook_url: str = ""

    jwt_secret: str = "CHANGE_ME_JWT_SECRET"
    jwt_refresh_secret: str = "CHANGE_ME_JWT_REFRESH_SECRET"
    jwt_access_ttl_minutes: int = 30
    jwt_refresh_ttl_days: int = 7

    scheduler_daily_hour: int = 22
    scheduler_daily_minute: int = 0
    law_workbook_path: str | None = None

    default_admin_email: EmailStr = "admin@example.com"
    default_admin_password: str = Field(default="CHANGE_ME_DEFAULT_ADMIN_PASSWORD", min_length=8)


@lru_cache
def get_settings() -> Settings:
    return Settings()
