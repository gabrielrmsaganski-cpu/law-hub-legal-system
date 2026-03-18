import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0c1f31",
        law: {
          navy: "#14263a",
          steel: "#22384f",
          gold: "#d3ae21",
          brass: "#b89012",
          sand: "#efe6d2",
          cloud: "#f5f1ea",
          pearl: "#fbfaf7",
          fog: "#d9d5cd",
          slate: "#61748a"
        }
      },
      boxShadow: {
        panel: "0 24px 80px rgba(12, 21, 34, 0.12)",
        soft: "0 14px 36px rgba(10, 22, 36, 0.08)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.65)"
      },
      backgroundImage: {
        "law-grid":
          "linear-gradient(rgba(20,38,58,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(20,38,58,0.04) 1px, transparent 1px)",
        "law-glow":
          "radial-gradient(circle at top right, rgba(211,174,33,0.22), transparent 26%), radial-gradient(circle at left center, rgba(20,38,58,0.11), transparent 38%)"
      }
    }
  },
  plugins: []
};

export default config;
