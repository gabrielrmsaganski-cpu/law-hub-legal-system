from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import get_settings
from app.db.session import get_db
from app.models.entities import SystemSetting, UserRole

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings_view(db: Session = Depends(get_db), _=Depends(get_current_user)) -> dict:
    app_settings = get_settings()
    notification_matrix = db.get(SystemSetting, "notification_matrix")
    return {
        "brand_name": app_settings.system_brand_name,
        "timezone": app_settings.app_timezone,
        "scheduler_hour": app_settings.scheduler_daily_hour,
        "scheduler_minute": app_settings.scheduler_daily_minute,
        "notification_matrix": notification_matrix.value_json if notification_matrix else {},
    }


@router.post("/notification-matrix")
def update_notification_matrix(
    payload: dict,
    db: Session = Depends(get_db),
    _=Depends(require_roles(UserRole.ADMIN)),
) -> dict:
    db.merge(SystemSetting(key="notification_matrix", value_json=payload))
    db.commit()
    return {"ok": True}

