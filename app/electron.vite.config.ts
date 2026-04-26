import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: "electron/main.ts",
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: "electron/preload.ts",
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
