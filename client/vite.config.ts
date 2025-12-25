import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared/src")
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: path.resolve(__dirname, "./src/setupTests.ts")
  },
  server: {
    port: 5173,
    allowedHosts: [".ngrok-free.app"],
    proxy: {
      // Combat endpoints go to Cloudflare Worker with Durable Objects
      "/api/campaigns/.*/combat": {
        target: "http://localhost:8787",
        changeOrigin: true,
        ws: true,  // Enable WebSocket proxy
      },
      // All other API requests go to Express server
      "/api": "http://localhost:4000"
    }
  }
});

