import type { Config } from "tailwindcss"

// Anthropic Claude design system (cream canvas, coral CTA, serif display, dark
// product-mockup surfaces for code/data panels). Tokens copied from
// ../DESIGN-anthropic.md, sourced from awesome-design-md (VoltAgent).
// See ./DESIGN.md for the full spec.

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    fontFamily: {
      // Display serif — system fallback chain that approximates Copernicus / Tiempos.
      // ui-serif on macOS gives "New York" which is very close.
      serif: [
        "ui-serif",
        "Source Serif 4",
        "Newsreader",
        "Crimson Pro",
        "Tiempos Headline",
        "Source Han Serif SC",
        "Noto Serif SC",
        "Georgia",
        "Times New Roman",
        "serif",
      ],
      // Body sans — Inter approximates StyreneB closely.
      sans: [
        "Inter",
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI Variable",
        "Segoe UI",
        "PingFang SC",
        "Hiragino Sans",
        "Roboto",
        "Helvetica Neue",
        "sans-serif",
      ],
      mono: [
        "JetBrains Mono",
        "ui-monospace",
        "SF Mono",
        "SFMono-Regular",
        "Menlo",
        "Consolas",
        "monospace",
      ],
    },
    fontSize: {
      // Map onto the Anthropic typography roles.
      "caption": ["12px", { lineHeight: "1.4", letterSpacing: "0.12em" }],
      "caption-sm": ["13px", { lineHeight: "1.4" }],
      "body-sm": ["14px", { lineHeight: "1.55" }],
      "body-md": ["16px", { lineHeight: "1.55" }],
      "title-sm": ["16px", { lineHeight: "1.4", letterSpacing: "0" }],
      "title-md": ["18px", { lineHeight: "1.4" }],
      "title-lg": ["22px", { lineHeight: "1.3" }],
      "display-sm": ["28px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      "display-md": ["36px", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
      "display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      "display-xl": ["64px", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
      // Compat tokens for components that still use numeric scale.
      "100": ["12px", { lineHeight: "1.5" }],
      "200": ["14px", { lineHeight: "1.55" }],
      "300": ["16px", { lineHeight: "1.55" }],
      "400": ["18px", { lineHeight: "1.4" }],
      "500": ["22px", { lineHeight: "1.3" }],
      "600": ["28px", { lineHeight: "1.2" }],
    },
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    extend: {
      colors: {
        // Warm canvas + cream surfaces.
        canvas: "#faf9f5",
        "surface-soft": "#f5f0e8",
        "surface-card": "#efe9de",
        "surface-cream-strong": "#e8e0d2",

        // Dark "product mockup" surfaces — code editors, agent timelines,
        // judge tables, anywhere data is the protagonist.
        "surface-dark": "#181715",
        "surface-dark-elevated": "#252320",
        "surface-dark-soft": "#1f1e1b",

        // Hairlines — barely there, just enough to declare a boundary.
        hairline: "#e6dfd8",
        "hairline-soft": "#ebe6df",
        "hairline-dark": "#2e2c28",

        // Ink scale — type and chrome on cream surfaces.
        // Both Anthropic names (DEFAULT/strong/body/muted) and compat aliases
        // (primary/secondary/tertiary) so existing className strings keep working.
        ink: {
          DEFAULT: "#141413",
          strong: "#252523",
          body: "#3d3d3a",
          muted: "#6c6a64",
          "muted-soft": "#8e8b82",
          inverse: "#faf9f5",
          primary: "#141413",      // alias of DEFAULT
          secondary: "#3d3d3a",    // alias of body
          tertiary: "#6c6a64",     // alias of muted
        },

        // Inverse type (when sitting on dark surfaces).
        "on-dark": "#faf9f5",
        "on-dark-soft": "#a09d96",

        // Coral — the single brand voltage. Used for CTA / active state / accent.
        coral: {
          DEFAULT: "#cc785c",
          active: "#a9583e",
          soft: "#f5e6df",
        },
        "on-coral": "#ffffff",

        // Accents and semantic colors.
        accent: {
          teal: "#5db8a6",
          amber: "#e8a55a",
        },
        success: { DEFAULT: "#5db872", soft: "#e2efe4" },
        warning: { DEFAULT: "#d4a017", soft: "#f5ead0" },
        error:   { DEFAULT: "#c64545", soft: "#f5dada" },

        // Compat: existing components reference these names. Map them onto the new palette.
        // Bare `surface` defaults to surface-soft so legacy "bg-surface" reads as a
        // gentle cream card. Data panels should explicitly use bg-surface-dark.
        surface: "#f5f0e8",
        "signal-blue": "#cc785c",
        "signal-blue-bright": "#a9583e",
        "signal-blue-soft": "#f5e6df",
        "signal-green": "#5db872",
        "signal-green-soft": "#e2efe4",
        "signal-amber": "#d4a017",
        "signal-amber-soft": "#f5ead0",
        "signal-red": "#c64545",
        "signal-red-soft": "#f5dada",
        "surface-2": "#f5f0e8",
        "surface-3": "#efe9de",
        "hairline-strong": "#d8d2c5",
      },
      borderRadius: {
        none: "0",
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        full: "9999px",
        DEFAULT: "8px",
        // Numeric compat tokens — keep the existing component classes working.
        "0": "0px",
        "2": "4px",
        "4": "8px",
        "6": "10px",
        "8": "12px",
      },
      spacing: {
        // Anthropic 4-px grid, exposed both as semantic names and numeric tokens.
        xxs: "4px",
        xs: "8px",
        sm: "12px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        xxl: "48px",
        section: "96px",
        // Numeric tokens — kept for the existing components.
        "100": "4px",   "200": "8px",   "300": "12px",  "400": "16px",
        "500": "20px",  "600": "24px",  "700": "28px",  "800": "32px",
        "900": "36px",  "1000": "40px", "1100": "44px", "1200": "48px",
        "1300": "52px", "1400": "56px", "1500": "60px", "1600": "64px",
      },
      transitionDuration: { "150": "150ms", "200": "200ms" },
      transitionTimingFunction: { console: "cubic-bezier(0.4, 0, 0.2, 1)" },
      boxShadow: {
        // Anthropic uses very soft drop shadows, never harsh.
        soft: "0 1px 2px rgba(20, 20, 19, 0.04), 0 4px 12px rgba(20, 20, 19, 0.05)",
        card: "0 1px 3px rgba(20, 20, 19, 0.05), 0 8px 24px rgba(20, 20, 19, 0.06)",
        "card-dark": "0 1px 3px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        fadeIn: "fadeIn 240ms cubic-bezier(0.4, 0, 0.2, 1)",
        pulseDot: "pulseDot 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
}
export default config
