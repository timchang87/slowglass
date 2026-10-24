from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from slowglass.database import open_database
from slowglass.health import health_report
from slowglass.mcp_server import create_mcp_server
from slowglass.settings import Settings


def create_app(settings: Settings) -> FastAPI:
    engine = open_database(settings.database_path)
    mcp = create_mcp_server(engine)
    mcp_app = mcp.streamable_http_app(streamable_http_path="/mcp")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async with mcp.session_manager.run():
            yield

    app = FastAPI(title="slowglass sidecar", lifespan=lifespan)

    @app.get("/health")
    def health() -> dict[str, Any]:
        return health_report(engine)

    app.mount("/", mcp_app)
    return app
