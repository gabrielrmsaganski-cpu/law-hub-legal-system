from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.entities import EconomicGroup, MonitoredEntity, UserRole
from app.schemas.common import MonitoredEntityIn, MonitoredEntityOut
from app.services.audit import register_audit
from app.utils.text import cnpj_root, normalize_name

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("", response_model=list[MonitoredEntityOut])
def list_entities(db: Session = Depends(get_db), _=Depends(get_current_user)) -> list[MonitoredEntity]:
    return db.query(MonitoredEntity).order_by(MonitoredEntity.updated_at.desc()).all()


@router.post("", response_model=MonitoredEntityOut)
def create_entity(
    payload: MonitoredEntityIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.ADMIN, UserRole.RISCO)),
) -> MonitoredEntity:
    group_id = None
    if payload.group_name:
        group = db.query(EconomicGroup).filter(EconomicGroup.name == payload.group_name).first()
        if not group:
            group = EconomicGroup(name=payload.group_name)
            db.add(group)
            db.commit()
            db.refresh(group)
        group_id = group.id
    entity = MonitoredEntity(
        **payload.model_dump(exclude={"group_name"}),
        normalized_name=normalize_name(payload.corporate_name),
        cnpj_root=cnpj_root(payload.cnpj),
        group_id=group_id,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    register_audit(
        db,
        actor_email=current_user.email,
        entity_name="monitored_entity",
        entity_id=str(entity.id),
        action="create",
        changes=payload.model_dump(),
    )
    return entity

