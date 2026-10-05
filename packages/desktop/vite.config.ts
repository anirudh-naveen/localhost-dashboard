import { defineConfig } from "vite";

/**
 * Bundle the main process together with @ld/core and @ld/shared, so the packaged app
 * needs no node_modules (workspace symlinks don't survive packaging). Only electron and
 * Node builtins stay external.
 */
export default defineConfig({
  build: {
    ssr: true,
    outDir: "dist",
    emptyOutDir: true,
    target: "node22",
    sourcemap: true,
    rollupOptions: {
      // `app` is its own entry so scripts/smoke.mjs can drive start() directly.
      input: { index: "src/index.ts", app: "src/app.ts" },
      external: ["electron"],
      output: { format: "es", entryFileNames: "[name].js" },
    },
  },
  ssr: { noExternal: true, target: "node" },
});
