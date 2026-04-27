/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ToraSEO brand palette (from BRAND_BOOK / UIDesign §10)
        primary: {
          DEFAULT: "#FF6B35", // tora orange
          50: "#FFF1EC",
          100: "#FFDDD0",
          400: "#FF8E63",
          500: "#FF6B35",
          600: "#E5501A",
          700: "#B83C0E",
        },
        outline: {
          DEFAULT: "#1A0F08", // dark outline
          900: "#1A0F08",
          800: "#2B1D14",
        },
        // Surface — warm dark used for sidebars, panels, drawers,
        // and any large dark surface that should feel "in palette"
        // rather than pure black. Visually equivalent to the legacy
        // `bg-outline-900/85` over the cream main area, but defined
        // as a solid token so layout doesn't depend on background
        // showing through opacity.
        surface: {
          DEFAULT: "#352922",
          900: "#352922",
          800: "#42332A",
        },
        accent: {
          DEFAULT: "#FFB800", // gold (champion / highlights)
        },
        ear: "#FFB8A0",
        // Status palette (mascot states)
        status: {
          idle: "#9CA3AF",
          ready: "#FACC15",
          working: "#3B82F6",
          complete: "#22C55E",
          issues: "#F97316",
          champion: "#FFB800",
        },
      },
      fontFamily: {
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        body: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: ["SF Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
