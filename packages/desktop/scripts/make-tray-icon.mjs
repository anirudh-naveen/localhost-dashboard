// Generates assets/trayTemplate.png (+@2x): a black ring and dot that macOS tints
// for light/dark menu bars ("Template" images must be black with alpha).
import { writeFileSync } from "node:fs";
import { png } from "../../../scripts/png.mjs";

const BLACK = [0, 0, 0];

function shade(x, y) {
  const d = Math.hypot(x - 0.5, y - 0.5);
  return d < 0.16 || (d > 0.3 && d < 0.42) ? BLACK : null;
}

writeFileSync(new URL("../assets/trayTemplate.png", import.meta.url), png(16, shade));
writeFileSync(new URL("../assets/trayTemplate@2x.png", import.meta.url), png(32, shade));
