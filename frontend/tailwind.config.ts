import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./types/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#fd6d00",
          hover: "#e56200",
          50: "#fff7f0",
          100: "#fee3c7",
          200: "#febb71",
          300: "#fe9b30",
          400: "#fd6d00",
          500: "#e56200",
          600: "#c45300",
          700: "#9c4200"
        },
        gray: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827"
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)"
      },
      borderRadius: {
        lg: "12px",
        xl: "16px"
      }
    }
  },
  plugins: []
};

export default config;
