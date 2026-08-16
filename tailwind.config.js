/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#05060c",
        panel: "#0f1220",
        electric: {
          DEFAULT: "#22d3ee",
          soft: "#67e8f9",
          deep: "#0891b2",
        },
        emeraldx: {
          DEFAULT: "#10b981",
          soft: "#34d399",
        },
        violetx: {
          DEFAULT: "#7c5cff",
          soft: "#9d85ff",
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
        glass: "0 1px 0 rgba(255,255,255,0.03) inset",
        "glow-blue": "0 0 20px rgba(34, 211, 238, 0.18)",
        "glow-emerald": "0 0 20px rgba(52, 211, 153, 0.18)",
        "glow-violet": "0 0 20px rgba(124, 92, 255, 0.18)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)",
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
