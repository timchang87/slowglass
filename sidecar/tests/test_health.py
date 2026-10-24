from importlib.metadata import version

import httpx
from mcp import Client

from tests.conftest import RunningSidecar


def test_http_health_reports_version_and_ready_database(sidecar: RunningSidecar) -> None:
    response = httpx.get(f"{sidecar.base_url}/health")

    assert response.status_code == 200
    body = response.json()
    assert body["version"] == version("slowglass")
    assert body["database"] == {"status": "ok", "migration": "0001_initial"}


async def test_mcp_health_tool_matches_http_health(sidecar: RunningSidecar) -> None:
    async with Client(sidecar.mcp_url) as client:
        tools = await client.list_tools()
        result = await client.call_tool("health", {})

    assert "health" in [tool.name for tool in tools.tools]
    assert result.is_error is False
    report = result.structured_content
    assert report is not None
    assert report["version"] == version("slowglass")
    assert report["database"] == {"status": "ok", "migration": "0001_initial"}
