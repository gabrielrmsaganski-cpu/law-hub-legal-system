from sqlalchemy.orm import Session

from app.models.entities import AuditLog


def register_audit(
    db: Session,
    *,
    actor_email: str | None,
    entity_name: str,
    entity_id: str | None,
    action: str,
    changes: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_email=actor_email,
            entity_name=entity_name,
            entity_id=entity_id,
            action=action,
            changes_json=changes or {},
        )
    )
    db.commit()

