import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 900: "#074606", 700: "#117006", 500: "#298B06", 400: "#4EA708", 300: "#86CB07", 50: "#F2F8EE", 100: "#E4F1DC" },
        ink: "#111111",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(17,17,17,.04), 0 8px 24px rgba(7,70,6,.06)" },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
export default config;
