from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.monitoring import MonitoringOrchestrator

scheduler = BackgroundScheduler()


def _scheduled_job() -> None:
    with SessionLocal() as db:
        orchestrator = MonitoringOrchestrator(db)
        orchestrator.run(manual=False, requested_by="scheduler")


def start_scheduler() -> None:
    settings = get_settings()
    if scheduler.running:
        return
    scheduler.add_job(
        _scheduled_job,
        CronTrigger(
            hour=settings.scheduler_daily_hour,
            minute=settings.scheduler_daily_minute,
            timezone=settings.app_timezone,
        ),
        id="daily_monitoring",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=1800,
    )
    scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)

