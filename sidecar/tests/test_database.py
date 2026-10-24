from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient

from slowglass.app import create_app
from slowglass.database import MIGRATIONS_DIR
from slowglass.settings import Settings


def test_first_run_creates_database_in_home_folder(tmp_path: Path) -> None:
    home = tmp_path / "fresh-home"

    with TestClient(create_app(Settings(home=home))) as client:
        health = client.get("/health").json()

    assert (home / "slowglass.db").is_file()
    assert health["database"]["status"] == "ok"


def test_restart_on_existing_database_keeps_working(tmp_path: Path) -> None:
    home = tmp_path / "home"
    with TestClient(create_app(Settings(home=home))) as client:
        client.get("/health")

    with TestClient(create_app(Settings(home=home))) as client:
        health = client.get("/health").json()

    assert health["database"] == {"status": "ok", "migration": "0001_initial"}


def test_default_home_is_slowglass_in_music_folder(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("SLOWGLASS_HOME", raising=False)

    assert Settings.from_env(env_file=tmp_path / "missing.env").home == Path.home() / "Music" / "slowglass"


def test_home_and_port_can_be_overridden(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SLOWGLASS_HOME", str(tmp_path))
    monkeypatch.setenv("SLOWGLASS_PORT", "50123")

    settings = Settings.from_env(env_file=tmp_path / "missing.env")

    assert (settings.home, settings.port) == (tmp_path, 50123)


def test_checkout_env_file_sets_home_and_port(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("SLOWGLASS_HOME", raising=False)
    monkeypatch.delenv("SLOWGLASS_PORT", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(f"# written by worktree setup\nSLOWGLASS_HOME={tmp_path / 'data'}\nSLOWGLASS_PORT=48001\n")

    settings = Settings.from_env(env_file=env_file)

    assert (settings.home, settings.port) == (tmp_path / "data", 48001)


def test_environment_wins_over_checkout_env_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SLOWGLASS_PORT", "50123")
    env_file = tmp_path / ".env"
    env_file.write_text("SLOWGLASS_PORT=48001\n")

    assert Settings.from_env(env_file=env_file).port == 50123


def test_migrations_have_a_single_head() -> None:
    """Parallel branches that each add a migration must be rebased onto one another before merging."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))

    heads = ScriptDirectory.from_config(config).get_heads()

    assert len(heads) == 1, f"multiple migration heads {heads}: point the newer migration's down_revision at the other"


def test_health_echoes_the_launching_apps_instance_token(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(home=tmp_path, instance="launch-42"))) as client:
        health = client.get("/health").json()

    assert health["instance"] == "launch-42"
