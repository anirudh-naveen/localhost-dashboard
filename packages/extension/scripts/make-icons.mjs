// Generates public/icons/icon-{16,32,48,128}.png. Run: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { png } from "../../../scripts/png.mjs";

const BG = [24, 28, 38];
const RING = [34, 197, 94];
const DOT = [134, 239, 172];

/** Rounded dark square with a green ring and dot. */
function shade(x, y) {
  const r = 0.22; // corner radius
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  if (Math.hypot(x - cx, y - cy) > r) return null;
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (d < 0.14) return DOT;
  if (d > 0.24 && d < 0.33) return RING;
  return BG;
}

for (const s of [16, 32, 48, 128]) writeFileSync(new URL(`../public/icons/icon-${s}.png`, import.meta.url), png(s, shade));
