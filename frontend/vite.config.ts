import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Fail rather than silently moving to 5174: the API's CORS allowlist
    // (MARKET_TRADING_CORS_ORIGINS) names this exact origin, so a shifted
    // port turns every request into an opaque CORS error.
    strictPort: true,
  },
});
