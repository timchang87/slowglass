from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine
from sqlmodel import create_engine

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def open_database(path: Path) -> Engine:
    """Create the database file if needed and bring its schema up to date."""
    path.parent.mkdir(parents=True, exist_ok=True)
    url = f"sqlite:///{path}"
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    return create_engine(url)


def database_status(engine: Engine) -> dict[str, str | None]:
    try:
        with engine.connect() as connection:
            revision = MigrationContext.configure(connection).get_current_revision()
    except Exception as error:  # reported, not raised: health must always answer
        return {"status": "error", "migration": None, "error": str(error)}
    return {"status": "ok", "migration": revision}
