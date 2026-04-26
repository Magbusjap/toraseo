# ToraSEO Desktop App

Visual desktop application for ToraSEO. Electron + React + TypeScript.

## Status

**Stage 4 MVP — in progress.** Initial state UI implemented, Active state pending.

See:
- [stage-4-mvp-scope](../wiki/toraseo/stage-4-mvp-scope.md) — full MVP scope
- [architecture-stack-decision](../wiki/toraseo/architecture-stack-decision.md) — why Electron

## Quick start

```bash
cd app
npm install
npm run dev
```

`npm run dev` will:
1. Launch Vite dev server (renderer) on `http://127.0.0.1:5173/`
2. Wait for the renderer to be ready
3. Launch the Electron main process, which opens a window pointing at the dev server

DevTools open automatically (detached). Hot reload works for both renderer (React) and main process (Electron).

## Production build

```bash
npm run build       # build all three (main, preload, renderer) into out/
npm run dist        # build + package via electron-builder for current OS
npm run dist:win    # specifically Windows installer (NSIS)
npm run dist:mac    # specifically macOS DMG
npm run dist:linux  # specifically Linux AppImage
```

Artifacts go to `release/${version}/`.

In production, the renderer is loaded via `file://` from `out/renderer/`, **not** through any HTTP server. VPN clients (Happ, etc.) cannot interfere with app startup.

## Stack

- **Electron 33** (current stable)
- **electron-vite 2.3** (build orchestration: main + preload + renderer in one config)
- **React 19** + **TypeScript 5.7**
- **Vite 5.4** (used internally by electron-vite for renderer)
- **Tailwind CSS 3** (consistent with OnFlaude frontend)
- **lucide-react** for iconography
- **electron-builder** for distribution packaging

## Project structure

```
app/
├── electron.vite.config.ts     ← electron-vite config (main + preload + renderer)
├── tsconfig.json               ← project references root
├── tsconfig.node.json          ← TS for main + preload (Node.js context)
├── tsconfig.web.json           ← TS for renderer (browser context)
├── tailwind.config.js
├── postcss.config.js
├── index.html                  ← renderer entry
├── package.json                ← deps + scripts + electron-builder config
├── electron/
│   ├── main.ts                 ← Electron main process: BrowserWindow setup
│   └── preload.ts              ← preload script (empty until IPC arrives)
└── src/
    ├── main.tsx                ← React entry point
    ├── index.css               ← Tailwind directives
    ├── vite-env.d.ts           ← SVG import types
    ├── App.tsx                 ← two-column layout + mode state
    └── components/
        ├── Sidebar/
        │   └── IdleSidebar.tsx     ← overlay state
        ├── MainArea/
        │   └── ModeSelection.tsx   ← Initial state main
        └── Mascot/
            └── SleepingMascot.tsx  ← imports tora-sleeping.svg via @branding alias
```

## Brand assets

Mascot SVGs and logos live in `../branding/` (sibling folder, single source of truth). Import via `@branding` alias:

```tsx
import sleepingMascot from "@branding/mascots/tora-sleeping.svg";
```

No file duplication — when designs in `branding/` change, the app picks them up automatically.

## Window configuration

| Property | Value | Source |
|---|---|---|
| Default size | 1100 × 800 | UIDesign §10 |
| Minimum size | 800 × 600 | UIDesign §10 |
| Frame | System (with title bar) | MVP — keep it simple |
| Background color | `#FFF7F0` | matches `bg-orange-50/30` in renderer |
| Menu bar | Auto-hidden (Alt to show on Windows) | desktop-app convention |

## Design tokens

Brand colors are defined in `tailwind.config.js`:

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#FF6B35` | Tora orange (brand) |
| `outline-900` | `#1A0F08` | Dark outline / text |
| `accent` | `#FFB800` | Gold (champion / highlights) |
| `status-idle` | `#9CA3AF` | Idle status dot |
| `status-ready` | `#FACC15` | Ready status |
| `status-working` | `#3B82F6` | Working status |
| `status-complete` | `#22C55E` | Complete status |
| `status-issues` | `#F97316` | Issues found status |
| `status-champion` | `#FFB800` | Champion status |

Source: `branding/BRAND_BOOK.md` and `private/UIDesign.md` §10.

## License

Apache-2.0. See repository LICENSE.
