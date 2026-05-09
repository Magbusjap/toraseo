# ToraSEO Desktop App

Visual desktop application for ToraSEO. Built with Electron, React, TypeScript, Vite, and Tailwind CSS.

## Status

**App 0.0.9 release candidate.** The app supports two main runtime paths and a chat-only fallback documented in the product docs:

- `MCP + Instructions` for Codex and Claude Desktop bridge workflows
- `API + AI Chat` for the native in-app provider runtime
- `Skill without MCP and APP` as an external chat fallback when the app or MCP path is unavailable

See:

- [Documentation hub](../docs/README.md)
- [FAQ](../docs/FAQ.md)
- [Smoke tests](../docs/SMOKE_TESTS.md)
- [Architecture](../docs/ARCHITECTURE.md)

## Quick Start

Use Node.js 22 for release verification.

```bash
cd app
npm install
npm run dev
```

From the repository root:

```bash
npm run dev:app
```

On Windows PowerShell, use `npm.cmd` if script execution blocks `npm.ps1`:

```powershell
npm.cmd run dev:app
```

`npm run dev` launches the renderer dev server, waits for it to be ready, and opens the Electron window.

For MCP bridge testing, run the MCP watcher in a second terminal:

```powershell
npm.cmd run dev:mcp
```

## Production Build

```bash
npm run build
npm run dist
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Artifacts go to `release/${version}/`.

In production, the renderer is loaded through `file://` from `out/renderer/`, not through an HTTP dev server.

## Current Analysis Surfaces

| Analysis | Current status |
|---|---|
| Text | Active |
| Compare two texts | Active |
| Page by URL | Active |
| Site by URL | Active |
| Site comparison by URL | Active |
| Design and content by URL | In development |
| Image analysis | In development |

## Project Structure

```text
app/
|- electron.vite.config.ts
|- package.json
|- index.html
|- electron/
|  |- main.ts
|  |- preload.ts
|  `- bridge/
`- src/
   |- App.tsx
   |- main.tsx
   |- components/
   |- config/
   |- i18n/
   `- assets/
```

## Brand Assets

Mascot SVGs and logos live in `../branding/` as the single source of truth. The app imports them through the `@branding` alias:

```tsx
import neutralMascot from "@branding/mascots/tora-neutral.svg";
```

## Window Configuration

| Property | Value |
|---|---|
| Default size | 1400 x 900 |
| Minimum size | 800 x 600 |
| Frame | System title bar |
| Background color | `#FFF7F0` |
| Menu bar | Auto-hidden on Windows |

## Stack

- Electron 33
- electron-vite 2.3
- React 19
- TypeScript 5.7
- Vite 5.4
- Tailwind CSS 3
- lucide-react
- electron-builder

## License

Apache-2.0. See the repository [LICENSE](../LICENSE).
