from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.entities import EconomicGroup, MonitoredEntity, OperationalCase, SystemSetting, User, UserRole
from app.services.operations import OperationalCaseService
from app.utils.text import cnpj_root, normalize_name


def seed(session: Session) -> None:
    settings = get_settings()
    admin_user = session.query(User).filter(User.email == settings.default_admin_email).first()
    if admin_user:
        admin_user.full_name = "Administrador LAW"
        admin_user.password_hash = hash_password(settings.default_admin_password)
        admin_user.role = UserRole.ADMIN
    else:
        session.add(
            User(
                email=settings.default_admin_email,
                full_name="Administrador LAW",
                password_hash=hash_password(settings.default_admin_password),
                role=UserRole.ADMIN,
            )
        )

    group = session.query(EconomicGroup).filter(EconomicGroup.name == "Grupo LAW Demo").first()
    if not group:
        group = EconomicGroup(name="Grupo LAW Demo", description="Grupo economico de exemplo")
        session.add(group)
        session.flush()

    if not session.query(MonitoredEntity).count():
        samples = [
            {
                "cnpj": "12.345.678/0001-90",
                "corporate_name": "LAW Cedente Alpha S.A.",
                "trade_name": "Alpha",
                "entity_type": "cedente",
                "exposure_amount": 1450000,
                "internal_owner": "Mesa FIDC",
            },
            {
                "cnpj": "98.765.432/0001-10",
                "corporate_name": "LAW Sacado Beta Ltda",
                "trade_name": "Beta",
                "entity_type": "sacado",
                "exposure_amount": 480000,
                "internal_owner": "Risco",
            },
        ]
        for sample in samples:
            session.add(
                MonitoredEntity(
                    **sample,
                    normalized_name=normalize_name(sample["corporate_name"]),
                    cnpj_root=cnpj_root(sample["cnpj"]),
                    aliases=[sample["trade_name"]],
                    partners=["Joao Exemplo"],
                    group_id=group.id,
                )
            )

    session.merge(
        SystemSetting(
            key="notification_matrix",
            value_json={
                "critico": ["risk@law.local"],
                "alto": ["juridico@law.local"],
                "medio": ["operacoes@law.local"],
                "baixo": ["analise@law.local"],
            },
        )
    )

    if not session.query(OperationalCase).count():
        workbook_path = (
            Path(settings.law_workbook_path)
            if settings.law_workbook_path
            else Path(__file__).resolve().parents[3] / "Law Sistema Juridico (1).xlsx"
        )
        if workbook_path.exists():
            OperationalCaseService(session).sync_from_workbook(workbook_path, actor_email="system@law.local")
    session.commit()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed(session)
