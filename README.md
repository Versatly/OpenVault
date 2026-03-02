# OpenVault

Local-first agent memory via MCP. Works with Cursor, Claude Code, Windsurf, Cline — anything that speaks MCP.

**Zero API keys. Zero cloud. Zero telemetry.** Your memories stay on your machine.

## Quick Start

```bash
npm install -g openvault
openvault init
openvault serve
```

## Integration

### Cursor (.cursor/mcp.json)
```json
{
  "mcpServers": {
    "openvault": {
      "command": "npx",
      "args": ["-y", "openvault", "serve"]
    }
  }
}
```

### Claude Code
```bash
claude mcp add openvault -- npx -y openvault serve
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `vault_search` | Search memories with hybrid BM25 + semantic search |
| `vault_write` | Store a memory (fact, decision, lesson, preference, entity, event) |
| `vault_forget` | Delete a memory by search match |
| `vault_status` | Vault stats: total memories, categories, last write |
| `vault_context` | Auto-surface relevant context for current project |

## How It Works

- **Storage**: Markdown files with YAML frontmatter. Human-readable, git-friendly.
- **Search**: Hybrid BM25 + semantic embeddings with Reciprocal Rank Fusion.
- **Embeddings**: Local via all-MiniLM-L6-v2. No GPU, no API keys.
- **Transport**: stdio (default) or streamable-http.

## CLI

```bash
openvault init                          # Initialize vault (~/.openvault)
openvault serve                         # Start MCP server (stdio)
openvault serve --http --port 3333      # HTTP transport
openvault search "deployment decisions" # Search from terminal
openvault write "Use Railway" --category decision
openvault status                        # Show vault stats
```

## Why OpenVault?

| Feature | OpenVault | mem0 | Zep |
|---------|-----------|------|-----|
| Local-first | yes | no (cloud) | no (cloud) |
| No API keys | yes | no | no |
| Human-readable | yes (markdown) | no | no |
| Git-friendly | yes | no | no |
| MCP native | yes | no | no |
| Free | yes | freemium | paid |

## License
MIT
