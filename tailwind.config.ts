import type { Config } from "tailwindcss"

// Track 2 · Industrial Console
// Sources: Vercel Geist (https://vercel.com/geist) + IBM Carbon (https://carbondesignsystem.com/) + Linear
// See workspace DESIGN.md for the full track spec.

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    fontFamily: {
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
        "Geist Mono",
        "SF Mono",
        "SFMono-Medium",
        "JetBrains Mono",
        "Menlo",
        "Consolas",
        "Roboto Mono",
        "monospace",
      ],
    },
    fontSize: {
      "100": ["12px", { lineHeight: "1.5" }],
      "200": ["14px", { lineHeight: "1.5" }],
      "300": ["15px", { lineHeight: "1.6" }],
      "400": ["18px", { lineHeight: "1.4" }],
      "500": ["24px", { lineHeight: "1.25" }],
      "600": ["32px", { lineHeight: "1.15" }],
    },
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    extend: {
      colors: {
        canvas: "#0A0A0A",
        surface: "#111111",
        "surface-2": "#1A1A1A",
        "surface-3": "#222222",
        hairline: "#2E2E2E",
        "hairline-strong": "#3D3D3D",
        ink: {
          primary: "#EDEDED",
          secondary: "#A1A1A1",
          tertiary: "#666666",
          inverse: "#0A0A0A",
        },
        signal: {
          blue: "#0070F3",
          "blue-soft": "#0F2540",
          "blue-bright": "#3291FF",
          green: "#00DC82",
          "green-soft": "#0B2820",
          amber: "#F5A623",
          "amber-soft": "#2A1F0A",
          red: "#FF4444",
          "red-soft": "#2A1010",
        },
      },
      borderRadius: {
        "0": "0px",
        "2": "2px",
        "4": "4px",
        "6": "6px",
        "8": "8px",
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
      transitionDuration: {
        "150": "150ms",
        "200": "200ms",
      },
      transitionTimingFunction: {
        console: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        scanline: {
          "0%": { backgroundPositionY: "0%" },
          "100%": { backgroundPositionY: "200%" },
        },
        blink: {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        scanline: "scanline 2s linear infinite",
        blink: "blink 1s steps(2, start) infinite",
        fadeIn: "fadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        pulseDot: "pulseDot 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [],
}
export default config
