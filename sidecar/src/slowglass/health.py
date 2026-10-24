import os
from importlib.metadata import version
from typing import Any

from sqlalchemy import Engine

from slowglass.database import database_status


def health_report(engine: Engine) -> dict[str, Any]:
    return {
        "version": version("slowglass"),
        "pid": os.getpid(),
        "database": database_status(engine),
    }
