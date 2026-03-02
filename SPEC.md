# OpenVault — Local-First Agent Memory via MCP

## What This Is
A standalone, open-source memory system for AI coding agents. Works with Cursor, Claude Code, Windsurf, Cline — anything that speaks MCP.

Forked from ClawVault's core (Versatly/clawvault). Stripped of OpenClaw coupling. Pure MCP server + CLI.

## Architecture

```
openvault/
├── src/
│   ├── server.ts          # MCP server (streamable-http + stdio transport)
│   ├── vault.ts           # Core vault operations (init, read, write, search)
│   ├── search.ts          # Hybrid search (BM25 + semantic embeddings + RRF)
│   ├── embeddings.ts      # Local embeddings via @huggingface/transformers
│   ├── types.ts           # TypeScript types
│   └── cli.ts             # CLI entry point
├── package.json
├── tsconfig.json
├── README.md
└── .cursorrules           # Example integration for Cursor
```

## MCP Tools to Expose

### vault_search
- Query the vault with natural language
- Returns ranked results via hybrid BM25 + semantic search
- Params: query (string), limit (number, default 10), category (optional filter)

### vault_write  
- Store a memory (fact, decision, lesson, preference, entity, event)
- Auto-categorizes if category not specified
- Params: text (string), category (optional), tags (optional string[])

### vault_forget
- Delete a specific memory by search match
- Params: query (string), confirm (boolean)

### vault_status
- Return vault stats: total memories, categories breakdown, last write time

### vault_context
- Return relevant context for the current project/directory
- Auto-surfaces memories related to the cwd, recent files, git repo name
- Params: cwd (optional string), projectName (optional string)

## CLI Commands

```bash
npx openvault init              # Initialize vault in ~/.openvault or custom path
npx openvault serve             # Start MCP server (stdio by default, --http for streamable-http)
npx openvault search "query"    # Search from CLI
npx openvault write "memory"    # Write from CLI
npx openvault status            # Show vault stats
```

## Key Design Decisions

1. **Zero API keys required** — embeddings run locally via @huggingface/transformers (all-MiniLM-L6-v2)
2. **Markdown-native** — all memories stored as .md files, human-readable, git-friendly
3. **MCP-first** — designed to be consumed by MCP clients, not as a library
4. **Stdio + HTTP transports** — stdio for Cursor/Claude Code, streamable-http for remote
5. **No vendor lock-in** — no cloud, no accounts, no telemetry
6. **Fast startup** — lazy-load embeddings only when semantic search is first used

## Integration Examples

### Cursor (.cursor/mcp.json)
```json
{
  "mcpServers": {
    "openvault": {
      "command": "npx",
      "args": ["openvault", "serve"]
    }
  }
}
```

### Claude Code
```bash
claude mcp add openvault -- npx openvault serve
```

### .cursorrules / CLAUDE.md snippet
```
You have access to OpenVault for persistent memory across sessions.
- Before starting work, search vault for relevant context: vault_search
- After making decisions, record them: vault_write with category "decision"  
- After learning something, record it: vault_write with category "lesson"
- After completing work, record what was done: vault_write with category "fact"
```

## Source Reference
Core search algorithm from ClawVault (Versatly/clawvault) src/lib/hybrid-search.ts.
Vault operations from src/lib/vault.ts.
Adapt, don't copy-paste — strip OpenClaw dependencies, simplify for standalone use.

## npm Package
Name: openvault
Bin: openvault -> dist/cli.js

## Dependencies (minimal)
- @modelcontextprotocol/sdk — MCP server SDK
- @huggingface/transformers — local embeddings
- commander — CLI parsing
- gray-matter — markdown frontmatter parsing
- glob — file discovery

## NOT Included (keep it simple for v1)
- No observational memory / session watching
- No graph memory
- No conflict resolution
- No cloud sync
- These come in v2+ once v1 proves the pattern
