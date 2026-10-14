import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `langgraph dev` serves on :2024. The proxy avoids CORS setup in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.LANGGRAPH_URL ?? "http://localhost:2024",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      // The admin console talks to the registry service the same way.
      "/registry": {
        target: process.env.REGISTRY_URL ?? "http://127.0.0.1:8800",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/registry/, ""),
      },
    },
  },
});
