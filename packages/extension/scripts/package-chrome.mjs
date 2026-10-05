// Zip dist/ for the Chrome Web Store upload: release/localhost-dashboard-chrome-<version>.zip
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const stage = mkdtempSync(join(tmpdir(), "ld-chrome-"));
cpSync(join(root, "dist"), stage, { recursive: true });

const manifest = JSON.parse(readFileSync(join(stage, "manifest.json"), "utf8"));
// `key` only pins the ID of unpacked dev builds; the store assigns its own ID and key.
delete manifest.key;
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

mkdirSync(join(root, "release"), { recursive: true });
const zip = join(root, "release", `localhost-dashboard-chrome-${manifest.version}.zip`);
rmSync(zip, { force: true });
execFileSync("/usr/bin/zip", ["-qr", "-X", zip, "."], { cwd: stage });
rmSync(stage, { recursive: true });
console.log(zip);
