import socket
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import httpx
import pytest
import uvicorn

from slowglass.app import create_app
from slowglass.settings import Settings


@dataclass
class RunningSidecar:
    base_url: str
    home: Path

    @property
    def mcp_url(self) -> str:
        return f"{self.base_url}/mcp"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture
def sidecar(tmp_path: Path) -> Iterator[RunningSidecar]:
    """A real sidecar on a free localhost port, with its home in a temp folder."""
    home = tmp_path / "slowglass-home"
    port = _free_port()
    app = create_app(Settings(home=home, port=port))
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            httpx.get(f"{base_url}/health", timeout=0.5)
            break
        except httpx.TransportError:
            time.sleep(0.05)
    else:
        raise RuntimeError("sidecar did not start")
    yield RunningSidecar(base_url=base_url, home=home)
    server.should_exit = True
    thread.join(timeout=10)
