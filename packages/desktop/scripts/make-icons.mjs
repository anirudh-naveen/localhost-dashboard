// Generates the menu-bar template icon (assets/trayTemplate.png, @2x) and the app icon
// electron-builder turns into .icns (build/icon.png). Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { appIcon, trayIcon } from "../../../scripts/icons.mjs";
import { png } from "../../../scripts/png.mjs";

const out = (p) => new URL(`../${p}`, import.meta.url);
writeFileSync(out("assets/trayTemplate.png"), png(16, trayIcon));
writeFileSync(out("assets/trayTemplate@2x.png"), png(32, trayIcon));

// macOS icons sit inside an ~824px rounded square on a 1024 canvas.
const INSET = 100 / 1024;
mkdirSync(out("build"), { recursive: true });
writeFileSync(
  out("build/icon.png"),
  png(1024, (x, y) => {
    const u = (x - INSET) / (1 - 2 * INSET), v = (y - INSET) / (1 - 2 * INSET);
    return u < 0 || u > 1 || v < 0 || v > 1 ? null : appIcon(u, v);
  }),
);
