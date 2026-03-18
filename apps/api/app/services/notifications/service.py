from __future__ import annotations

import json
import smtplib
from email.message import EmailMessage

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import AlertSeverity, RiskAlert, SystemSetting


class NotificationService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()

    def _resolve_recipients(self, severity: AlertSeverity) -> list[str]:
        matrix = self.db.get(SystemSetting, "notification_matrix")
        if matrix:
            return matrix.value_json.get(severity.value, [])
        return [address.strip() for address in self.settings.alert_email_to.split(",") if address.strip()]

    def notify(self, alert: RiskAlert) -> None:
        if alert.severity != AlertSeverity.CRITICO:
            return
        recipients = self._resolve_recipients(alert.severity)
        if recipients:
            self.send_email(alert, recipients)
        if self.settings.alert_webhook_url:
            self.send_webhook(alert)

    def send_email(self, alert: RiskAlert, recipients: list[str]) -> None:
        if not self.settings.smtp_host:
            return
        message = EmailMessage()
        message["From"] = self.settings.alert_email_from
        message["To"] = ", ".join(recipients)
        message["Subject"] = f"[LAW] Alerta critico: {alert.title}"
        message.set_content(f"{alert.summary}\n\nAcao sugerida: {alert.recommended_action or '-'}")
        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port) as server:
            server.starttls()
            if self.settings.smtp_user:
                server.login(self.settings.smtp_user, self.settings.smtp_pass)
            server.send_message(message)

    def send_webhook(self, alert: RiskAlert) -> None:
        payload = {
            "title": alert.title,
            "severity": alert.severity.value,
            "summary": alert.summary,
            "recommended_action": alert.recommended_action,
        }
        with httpx.Client(timeout=10) as client:
            client.post(
                self.settings.alert_webhook_url,
                headers={"Content-Type": "application/json"},
                content=json.dumps(payload),
            )

