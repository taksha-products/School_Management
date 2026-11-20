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
          DEFAULT: "var(--brand-color, #F97316)",
          hover: "var(--brand-color-hover, #ea580c)",
          50: "var(--brand-color-50, #fff7ed)",
          100: "var(--brand-color-100, #ffedd5)",
          200: "var(--brand-color-200, #fed7aa)",
          300: "#fe9b30",
          400: "var(--brand-color, #F97316)",
          500: "var(--brand-color-hover, #ea580c)",
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
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-lg)",
        "2xl": "var(--radius-lg)"
      }
    }
  },
  plugins: []
};

export default config;
