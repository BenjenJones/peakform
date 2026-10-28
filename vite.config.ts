import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // Relative asset URLs: HA ingress serves the app under /api/hassio_ingress/<token>/
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8099" } },
});
