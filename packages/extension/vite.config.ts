import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the same pages load from chrome-extension:// and the desktop app's file://.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "popup.html"),
        dashboard: resolve(import.meta.dirname, "dashboard.html"),
        background: resolve(import.meta.dirname, "src/background.ts"),
      },
      output: {
        // The manifest references these by fixed name.
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
