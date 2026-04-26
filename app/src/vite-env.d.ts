/// <reference types="vite/client" />

// SVG imports return URL string by default in Vite.
declare module "*.svg" {
  const src: string;
  export default src;
}
