import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const envFile = path.resolve(__dirname, "../.env");
const local = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
// Select browser settings explicitly so the backend NODE_ENV cannot change a Vite build.
for (const [key, value] of Object.entries(local)) {
  if (key.startsWith("VITE_") && process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(process.env.FRONTEND_PORT ?? local.FRONTEND_PORT ?? 5173),
    // Fail rather than silently moving to 5174: the API's CORS allowlist
    // (MARKET_TRADING_CORS_ORIGINS) names this exact origin, so a shifted
    // port turns every request into an opaque CORS error.
    strictPort: true,
  },
});
