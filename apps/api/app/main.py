from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    alerts,
    audit,
    auth,
    dashboard,
    entities,
    events,
    executions,
    health,
    imports,
    matches,
    operations,
    settings,
    users,
)
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.seed import seed
from app.services.scheduler.manager import start_scheduler, stop_scheduler

settings_obj = get_settings()
configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed(session)
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title=settings_obj.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in [
    health.router,
    auth.router,
    dashboard.router,
    entities.router,
    events.router,
    matches.router,
    alerts.router,
    executions.router,
    settings.router,
    users.router,
    audit.router,
    imports.router,
    operations.router,
]:
    app.include_router(router, prefix=settings_obj.api_prefix)
