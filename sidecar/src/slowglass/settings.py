import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_PORT = 47821


@dataclass(frozen=True)
class Settings:
    """Where the sidecar keeps its data and which localhost port it serves on."""

    home: Path
    port: int = DEFAULT_PORT

    @property
    def database_path(self) -> Path:
        return self.home / "slowglass.db"

    @classmethod
    def from_env(cls) -> "Settings":
        home = Path(os.environ.get("SLOWGLASS_HOME", Path.home() / "Music" / "slowglass"))
        port = int(os.environ.get("SLOWGLASS_PORT", DEFAULT_PORT))
        return cls(home=home, port=port)
