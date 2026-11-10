import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sage: { 50: "#f1f5f2", 100: "#dde8e0", 200: "#bcd0c2", 500: "#4f7a60", 600: "#3f6350", 700: "#325041", 900: "#1c2b23" },
        cream: "#f8f5ef",
        clay: { 400: "#d3a981", 500: "#c08f62" },
        ink: "#1f2a24",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
