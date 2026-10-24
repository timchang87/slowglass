from importlib.metadata import version
from typing import Any

from mcp.server.mcpserver import MCPServer
from sqlalchemy import Engine

from slowglass.health import health_report


def create_mcp_server(engine: Engine) -> MCPServer:
    """The sidecar's capabilities as MCP tools. Mirrors the HTTP API."""
    server = MCPServer(
        name="slowglass",
        version=version("slowglass"),
        instructions="Slowglass Studio: read-mostly tools for a music-production learning tool.",
    )

    @server.tool()
    def health() -> dict[str, Any]:
        """Sidecar version, process id and database status."""
        return health_report(engine)

    return server
