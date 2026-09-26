import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, /api and /files go to the Express server, so the browser sees one origin (no CORS).
const server = `http://localhost:${process.env.PORT ?? 8080}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { "/api": server, "/files": server } },
});
