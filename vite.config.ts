import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // `docs/**` isn't part of the module graph (nothing imports a .md
      // file), so Vite falls back to a full page reload on every edit there
      // instead of a no-op — excluded so editing docs doesn't flicker the
      // Tauri window while `tauri dev` is running.
      ignored: ["**/src-tauri/**", "**/docs/**"],
    },
  },
}));
