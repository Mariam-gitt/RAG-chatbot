import type { Config } from "tailwindcss";

// Tailwind scans these paths for class names and generates only the CSS actually used.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#e8ecff",
          500: "#4f5bd5",
          600: "#3f49b0",
          700: "#333c8f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
