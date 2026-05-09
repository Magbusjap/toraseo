# ToraSEO MCP Server

Model Context Protocol server for ToraSEO. It exposes structured analysis tools to MCP-compatible AI clients such as Codex and Claude Desktop, and it also supports the bridge handshake used by the desktop app.

## Status

**0.0.9 release candidate.** The MCP server is active for the current ToraSEO workflows:

- setup verification
- text analysis
- two-text comparison
- page by URL
- site by URL
- site comparison by URL
- bridge result delivery into the desktop app

## Install

From the repository root:

```bash
npm install
npm run build:mcp
```

Or from this folder:

```bash
cd mcp
npm install
npm run build
```

## Register In An MCP Client

```json
{
  "mcpServers": {
    "toraseo": {
      "command": "node",
      "args": ["/absolute/path/to/toraseo/mcp/dist/index.js"]
    }
  }
}
```

On Windows, use an absolute path with escaped backslashes if your client requires JSON string escaping.

## Runtime Paths

| Path | How the MCP server is used |
|---|---|
| `MCP + Instructions` | Codex or Claude Desktop calls ToraSEO tools directly and reports back from tool evidence. |
| `API + AI Chat` | The desktop app can use local scan logic and provider interpretation without requiring bridge commands. |
| `Skill without MCP and APP` | The MCP server is not used; the instruction package answers in chat from pasted or visible evidence. |

## Notes

- The MCP server should not invent ranking, traffic, backlink, click, or impression data.
- Site comparison should use one competitive dashboard, not three full audits side by side.
- Text analysis should not copy full user content back into chat.
- Crawling behavior must follow [CRAWLING_POLICY.md](../CRAWLING_POLICY.md).

## Documentation

- [Documentation hub](../docs/README.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [FAQ](../docs/FAQ.md)
- [Smoke tests](../docs/SMOKE_TESTS.md)
