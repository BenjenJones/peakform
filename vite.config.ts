import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Port of the API server during `npm run dev`, see dev.env. */
const API_PORT = 8098;

export default defineConfig({
  root: "web",
  // Relative asset URLs: HA ingress serves the app under /api/hassio_ingress/<token>/
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  // Same port as `npm run start`; the dev API server moves to API_PORT (set in dev.env).
  // Keep the browser's Host header: the server's same-origin check compares it with Origin, and
  // the string shorthand would rewrite it to the API port (changeOrigin), rejecting every POST.
  server: { port: 8099, strictPort: true, proxy: { "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: false } } },
});
