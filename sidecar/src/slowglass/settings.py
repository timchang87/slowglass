import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_PORT = 47821


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
    def from_env(cls) -> "Settings":
        home = Path(os.environ.get("SLOWGLASS_HOME", Path.home() / "Music" / "slowglass"))
        port = int(os.environ.get("SLOWGLASS_PORT", DEFAULT_PORT))
        parent = os.environ.get("SLOWGLASS_PARENT_PID")
        return cls(
            home=home,
            port=port,
            instance=os.environ.get("SLOWGLASS_INSTANCE"),
            parent_pid=int(parent) if parent else None,
        )
