from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from fastapi import FastAPI

from slowglass.database import open_database
from slowglass.health import HealthReport, health_report
from slowglass.mcp_server import create_mcp_server
from slowglass.settings import Settings


def create_app(settings: Settings) -> FastAPI:
    engine = open_database(settings.database_path)
    mcp = create_mcp_server(engine, settings.instance)
    mcp_app = mcp.streamable_http_app(streamable_http_path="/mcp")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        async with mcp.session_manager.run():
            yield

    app = FastAPI(title="slowglass sidecar", lifespan=lifespan)

    @app.get("/health")
    def health() -> HealthReport:
        return health_report(engine, settings.instance)

    app.mount("/", mcp_app)
    return app
