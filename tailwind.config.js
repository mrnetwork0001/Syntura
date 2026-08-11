/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#0b0f19",
        panel: "#1e293b",
        electric: {
          DEFAULT: "#3b82f6",
          soft: "#60a5fa",
          deep: "#1d4ed8",
        },
        emeraldx: {
          DEFAULT: "#10b981",
          soft: "#34d399",
        },
        violetx: {
          DEFAULT: "#8b5cf6",
          soft: "#a78bfa",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(2, 6, 23, 0.55)",
        "glow-blue": "0 0 24px rgba(59, 130, 246, 0.35)",
        "glow-emerald": "0 0 24px rgba(16, 185, 129, 0.35)",
        "glow-violet": "0 0 24px rgba(139, 92, 246, 0.35)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
