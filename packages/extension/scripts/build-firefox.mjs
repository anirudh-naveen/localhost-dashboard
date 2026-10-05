// Derive the Firefox build (dist-firefox/) from the Chrome build in dist/.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const src = new URL("../dist/", import.meta.url);
const out = new URL("../dist-firefox/", import.meta.url);
const FIREFOX_ID = "localhost-dashboard@extension"; // keep in sync with @ld/shared FIREFOX_ID

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

const manifest = JSON.parse(readFileSync(new URL("manifest.json", out), "utf8"));
// `key` pins the Chrome extension ID; Firefox uses gecko.id instead.
delete manifest.key;
// Firefox MV3 runs background scripts as an event page rather than a service worker.
manifest.background = { scripts: [manifest.background.service_worker], type: "module" };
manifest.browser_specific_settings = {
  gecko: {
    id: FIREFOX_ID,
    strict_min_version: "140.0",
    data_collection_permissions: { required: ["none"] },
  },
};
writeFileSync(new URL("manifest.json", out), JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
