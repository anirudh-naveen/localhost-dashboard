#!/usr/bin/env node
/**
 * Register the companion with Chromium-based browsers.
 *
 *   localhost-dashboard-host install [--extension-id <id>]...
 *   localhost-dashboard-host uninstall
 */
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTENSION_ID, FIREFOX_ID, HOST_NAME } from "@ld/shared";

const HOME = homedir();
const STATE_DIR = join(HOME, ".localhost-dashboard");
const LAUNCHER = join(STATE_DIR, "host.sh");

/** Firefox: [browser data dir that shows it's installed, where host manifests go]. */
function firefoxDirs(): [string, string] {
  if (platform() === "darwin") {
    const as = join(HOME, "Library", "Application Support");
    return [join(as, "Firefox"), join(as, "Mozilla", "NativeMessagingHosts")];
  }
  return [join(HOME, ".mozilla"), join(HOME, ".mozilla", "native-messaging-hosts")];
}

/** Chromium profile roots; the manifest goes in `<root>/NativeMessagingHosts`. */
function browserRoots(): string[] {
  if (platform() === "darwin") {
    const as = join(HOME, "Library", "Application Support");
    return [
      "Google/Chrome",
      "Google/Chrome Beta",
      "Google/Chrome Canary",
      "Chromium",
      "BraveSoftware/Brave-Browser",
      "Microsoft Edge",
      "Arc/User Data",
      "Vivaldi",
    ].map((p) => join(as, p));
  }
  if (platform() === "linux") {
    const cfg = process.env.XDG_CONFIG_HOME ?? join(HOME, ".config");
    return ["google-chrome", "google-chrome-beta", "chromium", "BraveSoftware/Brave-Browser", "microsoft-edge", "vivaldi"].map(
      (p) => join(cfg, p),
    );
  }
  throw new Error(`unsupported platform: ${platform()}`);
}

function parseIds(argv: string[]): string[] {
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--extension-id" && argv[i + 1]) ids.push(argv[++i]);
  }
  return ids.length ? ids : [EXTENSION_ID];
}

function install(ids: string[]): void {
  const main = join(dirname(fileURLToPath(import.meta.url)), "main.js");
  if (!existsSync(main)) throw new Error(`${main} not found; run \`npm run build\` first`);

  // Browsers launch hosts with a minimal PATH, so pin the absolute node binary.
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(LAUNCHER, `#!/bin/sh\nexec "${process.execPath}" "${main}" "$@"\n`);
  chmodSync(LAUNCHER, 0o755);

  const manifest = {
    name: HOST_NAME,
    description: "Localhost Dashboard companion",
    path: LAUNCHER,
    type: "stdio",
    allowed_origins: ids.map((id) => `chrome-extension://${id}/`),
  };

  const targets: [string, object][] = browserRoots()
    .filter((r) => existsSync(r))
    .map((r) => [join(r, "NativeMessagingHosts"), manifest]);
  const [firefox, firefoxHosts] = firefoxDirs();
  if (existsSync(firefox)) {
    // Firefox lists add-on IDs instead of extension origins.
    const { allowed_origins: _, ...rest } = manifest;
    targets.push([firefoxHosts, { ...rest, allowed_extensions: [FIREFOX_ID] }]);
  }
  if (targets.length === 0) {
    console.error("No supported browser profile directories found.");
    process.exit(1);
  }
  for (const [dir, content] of targets) {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${HOST_NAME}.json`);
    writeFileSync(file, JSON.stringify(content, null, 2) + "\n");
    console.log(`wrote ${file}`);
  }
  console.log(`launcher: ${LAUNCHER}\nallowed extensions: ${[...ids, FIREFOX_ID].join(", ")}`);
}

function uninstall(): void {
  for (const dir of [...browserRoots().map((r) => join(r, "NativeMessagingHosts")), firefoxDirs()[1]]) {
    const file = join(dir, `${HOST_NAME}.json`);
    if (existsSync(file)) {
      rmSync(file);
      console.log(`removed ${file}`);
    }
  }
  rmSync(LAUNCHER, { force: true });
}

const [cmd = "install", ...rest] = process.argv.slice(2);
if (cmd === "install") install(parseIds(rest));
else if (cmd === "uninstall") uninstall();
else {
  console.error("usage: localhost-dashboard-host [install [--extension-id <id>]... | uninstall]");
  process.exit(2);
}
