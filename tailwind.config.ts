import type { Config } from "tailwindcss"

// Tokens adapted from Pinterest Gestalt design system
// https://github.com/pinterest/gestalt
// Spacing & rounding follow strict 4px grid; typography limited to 6 sizes; colors map to Gestalt's named palettes.

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    fontFamily: {
      sans: [
        "-apple-system",
        "BlinkMacSystemFont",
        "PingFang SC",
        "Hiragino Kaku Gothic Pro",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ],
      display: [
        "ui-serif",
        "'New York'",
        "'Iowan Old Style'",
        "Georgia",
        "'Times New Roman'",
        "serif",
      ],
      mono: [
        "SFMono-Medium",
        "SF Mono",
        "Segoe UI Mono",
        "Roboto Mono",
        "Menlo",
        "Consolas",
        "monospace",
      ],
    },
    fontSize: {
      "100": ["12px", { lineHeight: "1.5" }],
      "200": ["14px", { lineHeight: "1.5" }],
      "300": ["16px", { lineHeight: "1.6" }],
      "400": ["20px", { lineHeight: "1.4" }],
      "500": ["28px", { lineHeight: "1.25" }],
      "600": ["36px", { lineHeight: "1.15" }],
    },
    fontWeight: {
      normal: "400",
      semibold: "600",
      bold: "700",
    },
    extend: {
      colors: {
        pushpin: {
          0: "#FFF7F7",
          50: "#FFEBEB",
          100: "#FFE0E0",
          200: "#FCBBBB",
          300: "#F47171",
          400: "#EB4242",
          450: "#E60023",
          500: "#CC0000",
          600: "#B60000",
          700: "#9B0000",
          800: "#800000",
          900: "#660000",
        },
        roboflow: {
          50: "#F9F9F9",
          100: "#F1F1F1",
          200: "#E9E9E9",
          300: "#CDCDCD",
          400: "#A5A5A5",
          500: "#767676",
          550: "#5F5F5F",
          600: "#4A4A4A",
          700: "#2B2B2B",
          800: "#191919",
        },
        cosmicore: "#111111",
        mochimalist: "#FFFFFF",
      },
      borderRadius: {
        "0": "0px",
        "100": "4px",
        "200": "8px",
        "300": "12px",
        "400": "16px",
        "500": "20px",
        "600": "24px",
        "700": "28px",
        "800": "32px",
        pill: "999px",
      },
      spacing: {
        "100": "4px",
        "200": "8px",
        "300": "12px",
        "400": "16px",
        "500": "20px",
        "600": "24px",
        "700": "28px",
        "800": "32px",
        "900": "36px",
        "1000": "40px",
        "1100": "44px",
        "1200": "48px",
        "1300": "52px",
        "1400": "56px",
        "1500": "60px",
        "1600": "64px",
      },
      boxShadow: {
        floating: "0 1px 2px rgba(17,17,17,0.04), 0 8px 24px rgba(17,17,17,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
        raised: "0 2px 4px rgba(17,17,17,0.06), 0 12px 32px rgba(17,17,17,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
        lift: "0 4px 8px rgba(17,17,17,0.08), 0 24px 48px rgba(17,17,17,0.10), inset 0 1px 0 rgba(255,255,255,0.7)",
        glass: "0 8px 32px rgba(17,17,17,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        floatA: {
          "0%, 100%": { transform: "rotate(-3deg) translateY(0)" },
          "50%": { transform: "rotate(-3deg) translateY(-6px)" },
        },
        floatB: {
          "0%, 100%": { transform: "rotate(2deg) translateY(0)" },
          "50%": { transform: "rotate(2deg) translateY(-8px)" },
        },
        floatC: {
          "0%, 100%": { transform: "rotate(-2deg) translateY(0)" },
          "50%": { transform: "rotate(-2deg) translateY(-5px)" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(230,0,35,0.45)" },
          "70%": { boxShadow: "0 0 0 12px rgba(230,0,35,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(230,0,35,0)" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        floatA: "floatA 6s ease-in-out infinite",
        floatB: "floatB 7s ease-in-out infinite",
        floatC: "floatC 8s ease-in-out infinite",
        pulseRing: "pulseRing 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite",
      },
    },
  },
  plugins: [],
}
export default config
