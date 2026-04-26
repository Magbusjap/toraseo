import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Node builtins that some libraries try to import dynamically
 * (e.g. undici 7+ probes for `node:sqlite`). Electron 33 ships Node
 * 20.x, where these don't exist yet — importing them throws
 * ERR_UNKNOWN_BUILTIN_MODULE at runtime.
 *
 * Listing them here as Rollup external prevents the bundler from
 * resolving them at all; the runtime then either has them (newer
 * Node) or throws a graceful require error that the calling library
 * is already prepared for (it falls back to a non-builtin polyfill).
 */
const NEW_NODE_BUILTINS = [
  "node:sqlite",
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: "electron/main.ts",
      },
      rollupOptions: {
        external: NEW_NODE_BUILTINS,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: "electron/preload.ts",
        // Sandbox preloads MUST be CommonJS — Electron's sandbox
        // loader uses Node's old require() pipeline and cannot
        // parse `import` statements. The default electron-vite
        // setting emits .mjs which throws "Cannot use import
        // statement outside a module" at preload-load time and
        // leaves window.toraseo undefined in the renderer.
        formats: ["cjs"],
        fileName: () => "preload.js",
      },
      rollupOptions: {
        output: {
          // Force .js extension and CJS output. The main process
          // points to `preload.js` (not .mjs) when wiring up
          // BrowserWindow webPreferences.preload.
          entryFileNames: "preload.js",
        },
      },
    },
  },
  renderer: {
    root: ".",
    publicDir: "public",
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "index.html"),
        },
      },
    },
    resolve: {
      alias: {
        // Allow importing brand assets directly from the sibling branding/
        // folder (logos, mascots, palettes). Single source of truth.
        "@branding": path.resolve(__dirname, "../branding"),
      },
    },
    server: {
      // Force IPv4 loopback. Vite's default 'localhost' may resolve to
      // IPv6 ::1 on Windows, which some VPN clients (Happ, Outline)
      // intercept even with LAN bypass enabled.
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
    },
    plugins: [react()],
  },
});
