"""Slowglass Studio sidecar: the local service behind the desktop app and Claude's MCP tools."""


def main() -> None:
    import uvicorn

    from slowglass.app import create_app
    from slowglass.parent_watch import exit_when_parent_dies
    from slowglass.settings import Settings

    settings = Settings.from_env()
    if settings.parent_pid is not None:
        exit_when_parent_dies(settings.parent_pid)
    uvicorn.run(create_app(settings), host="127.0.0.1", port=settings.port, log_level="info")
