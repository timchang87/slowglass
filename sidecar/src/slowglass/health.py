import os
from importlib.metadata import version
from typing import TypedDict

from sqlalchemy import Engine

from slowglass.database import DatabaseStatus, database_status


class HealthReport(TypedDict):
    version: str
    pid: int
    instance: str | None
    database: DatabaseStatus


def health_report(engine: Engine, instance: str | None) -> HealthReport:
    return {
        "version": version("slowglass"),
        "pid": os.getpid(),
        "instance": instance,
        "database": database_status(engine),
    }
