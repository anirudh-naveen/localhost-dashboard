// Copy the extension's built pages into ui/, so the app ships its own copy of the UI.
import { cpSync, existsSync, rmSync } from "node:fs";

const src = new URL("../../extension/dist/", import.meta.url);
const out = new URL("../ui/", import.meta.url);
if (!existsSync(new URL("popup.html", src))) throw new Error("Build the extension first (npm run build -w @ld/extension)");
rmSync(out, { recursive: true, force: true });
cpSync(src, out, {
  recursive: true,
  // The extension's own files aren't needed here.
  filter: (p) => !/manifest\.json$|background\.js$/.test(p),
});
