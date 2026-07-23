import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        // Pull the charting stack (recharts + its d3-* constellation) into one
        // shared chunk. It is used by both the eager forecasting view and the
        // lazy map, so without this recharts is *duplicated* across both bundles.
        // As its own chunk it is downloaded once and stays cached across app
        // redeploys. React/react-dom is deliberately left to the default chunker
        // so that react-dom/server (used only by the map) stays in the lazy
        // chunk instead of being hoisted onto the initial load.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("recharts") ||
            id.includes("/d3-") ||
            id.includes("victory-vendor") ||
            id.includes("decimal.js")
          ) {
            return "charts";
          }
        },
      },
    },
  },
});
