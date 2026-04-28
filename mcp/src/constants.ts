/**
 * Bridge Mode protocol constants shared between App and MCP.
 *
 * IMPORTANT: This file MUST stay in sync with the App's
 * `app/electron/bridge/scanLifecycle.ts`. Both define the same
 * BRIDGE_PROTOCOL_TOKEN value. A mismatch means the handshake
 * fails for every user — coordinated releases of MCP/App/Skill
 * must update this token together.
 *
 * Future improvement: generate this constant at build time from
 * a single root-level source file so the two can never diverge
 * silently. For v0.0.7 we rely on code review during release.
 */

/**
 * Versioned token both App and MCP must agree on. Format:
 *   bridge-v{N}-{YYYY-MM-DD}
 * Where N is the protocol version (incremented on breaking
 * changes) and the date is informational.
 */
export const BRIDGE_PROTOCOL_TOKEN = "bridge-v1-2026-04-27";

/**
 * Current state-file schema version. Must match
 * STATE_FILE_SCHEMA_VERSION in App's stateFile.ts. Read attempts
 * with mismatched version are treated as "no active scan" — safe
 * fallback that lets MCP work in legacy mode.
 */
export const STATE_FILE_SCHEMA_VERSION = 1 as const;

/**
 * Product name used in the userData path. MUST match the App's
 * `productName` in app/package.json — Electron uses productName
 * (not the package "name") to derive the userData directory.
 *
 * On Windows: %APPDATA%\ToraSEO\
 * On macOS:   ~/Library/Application Support/ToraSEO/
 * On Linux:   ~/.config/ToraSEO/
 */
export const APP_PRODUCT_NAME = "ToraSEO";
