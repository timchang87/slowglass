import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

DEFAULT_PORT = 47821
CHECKOUT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"
"""The `.env` at the root of the checkout this code lives in, written by `scripts/worktree.mjs setup`."""


def read_env_file(path: Path) -> dict[str, str]:
    """KEY=VALUE lines, skipping blanks and # comments. A missing file reads as empty."""
    try:
        lines = path.read_text().splitlines()
    except FileNotFoundError:
        return {}
    values: dict[str, str] = {}
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


@dataclass(frozen=True)
class Settings:
    """Where the sidecar keeps its data and which localhost port it serves on."""

    home: Path
    port: int = DEFAULT_PORT
    instance: str | None = None
    """Token from the app that launched this sidecar, echoed by /health so the app knows it's talking to its own child."""
    parent_pid: int | None = None
    """Process to outlive: when set and that process disappears, the sidecar exits."""

    @property
    def database_path(self) -> Path:
        return self.home / "slowglass.db"

    @classmethod
    def from_env(cls, env_file: Path = CHECKOUT_ENV_FILE) -> "Settings":
        """Settings from the environment, falling back to the checkout's `.env`, then to defaults."""
        env: Mapping[str, str] = {**read_env_file(env_file), **os.environ}
        home = Path(env.get("SLOWGLASS_HOME", Path.home() / "Music" / "slowglass"))
        port = int(env.get("SLOWGLASS_PORT", DEFAULT_PORT))
        parent = env.get("SLOWGLASS_PARENT_PID")
        return cls(
            home=home,
            port=port,
            instance=env.get("SLOWGLASS_INSTANCE"),
            parent_pid=int(parent) if parent else None,
        )
