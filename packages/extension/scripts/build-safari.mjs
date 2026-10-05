// Derive the Safari build (dist-safari/) from the Chrome build in dist/. Safari Web
// Extensions ship inside a macOS app: see scripts/safari-project.sh to wrap this in Xcode.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const src = new URL("../dist/", import.meta.url);
const out = new URL("../dist-safari/", import.meta.url);

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

const manifest = JSON.parse(readFileSync(new URL("manifest.json", out), "utf8"));
delete manifest.key;
// Safari's native messaging only reaches the extension's own sandboxed app, which can't
// inspect or stop processes; Safari talks to the desktop app's loopback API instead.
manifest.permissions = manifest.permissions.filter((p) => p !== "nativeMessaging");
manifest.browser_specific_settings = { safari: { strict_min_version: "17.0" } };
writeFileSync(new URL("manifest.json", out), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
