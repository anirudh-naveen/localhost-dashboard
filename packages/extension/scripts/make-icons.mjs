// Generates public/icons/icon-{16,32,48,128}.png. Run: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { appIcon } from "../../../scripts/icons.mjs";
import { png } from "../../../scripts/png.mjs";

for (const s of [16, 32, 48, 128]) writeFileSync(new URL(`../public/icons/icon-${s}.png`, import.meta.url), png(s, appIcon));
