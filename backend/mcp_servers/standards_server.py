"""A small MCP server the registry can point agents at: the platform's published standards.

Run: python mcp_servers/standards_server.py     (serves http://127.0.0.1:8810/mcp)
It also exposes `delete_standard`, which the registry entry does NOT allow, to show an allowlist at work.
"""
from mcp.server.mcpserver import MCPServer

server = MCPServer("platform-standards")

STANDARDS = {
    "naming": "Agents are named <domain>-<purpose>-agent. Skills are named <path>-path.",
    "data-classification": "Confidential or regulated data may only be used by pro-code agents with an audit trail.",
    "release": "Pro-code agents need evaluation results and an approver other than the author before production.",
}


@server.tool()
def list_standards() -> list[str]:
    """List the ids of the published platform standards."""
    return sorted(STANDARDS)


@server.tool()
def get_standard(standard_id: str) -> str:
    """Return the text of one platform standard by id."""
    return STANDARDS.get(standard_id, f"No standard called {standard_id!r}.")


@server.tool()
def delete_standard(standard_id: str) -> str:
    """Delete a standard. Not for agents."""
    return "deleted"


if __name__ == "__main__":
    server.run("streamable-http", host="127.0.0.1", port=8810)
