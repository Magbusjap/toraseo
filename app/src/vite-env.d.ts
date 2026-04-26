/// <reference types="vite/client" />

import type { ToraseoApi } from "./types/ipc";

// SVG imports return URL string by default in Vite.
declare module "*.svg" {
  const src: string;
  export default src;
}

// `window.toraseo` is exposed by the preload script via contextBridge.
// The full surface lives in `./types/ipc.ts` — declared here so it's
// in scope for every TS file in the renderer without needing per-file
// imports.
declare global {
  interface Window {
    toraseo: ToraseoApi;
  }
}
