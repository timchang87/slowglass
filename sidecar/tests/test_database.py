from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from slowglass.app import create_app
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


def test_default_home_is_slowglass_in_music_folder(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SLOWGLASS_HOME", raising=False)

    assert Settings.from_env().home == Path.home() / "Music" / "slowglass"


def test_home_and_port_can_be_overridden(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SLOWGLASS_HOME", str(tmp_path))
    monkeypatch.setenv("SLOWGLASS_PORT", "50123")

    settings = Settings.from_env()

    assert (settings.home, settings.port) == (tmp_path, 50123)


def test_health_echoes_the_launching_apps_instance_token(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(home=tmp_path, instance="launch-42"))) as client:
        health = client.get("/health").json()

    assert health["instance"] == "launch-42"
