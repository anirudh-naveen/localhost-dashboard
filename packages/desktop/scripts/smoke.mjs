// End-to-end check of the real app: `electron scripts/smoke.mjs [outDir]`.
// Starts a throwaway server, drives the popup and dashboard through their actual
// buttons, and writes screenshots. Uses a scratch state dir, not ~/.localhost-dashboard.
// No top-level await: Electron won't emit "ready" until the entry module has finished evaluating.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";

const out = process.argv.at(-1).endsWith(".mjs") ? mkdtempSync(join(tmpdir(), "ld-smoke-")) : process.argv.at(-1);
process.env.LD_STATE_DIR ??= join(out, "state");
const PORT = 8781;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[smoke]", ...a);

let failed = false;
const check = (ok, msg) => {
  log(ok ? "PASS" : "FAIL", msg);
  if (!ok) failed = true;
};

async function until(wc, expr, what, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    if (await wc.executeJavaScript(expr)) return;
  }
  throw new Error(`timed out waiting for ${what}`);
}

const text = (wc) => wc.executeJavaScript("document.body.innerText");

/** Click the button labelled `label` in the list/table row containing `rowText`. */
const click = (wc, rowText, label) =>
  wc.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll("li.row, tbody tr")].find((r) => r.innerText.includes(${JSON.stringify(rowText)}));
    const btn = row && [...row.querySelectorAll("button")].find((b) => b.innerText.trim() === ${JSON.stringify(label)});
    if (!btn) return false;
    btn.click();
    return true;
  })()`);

const listening = () =>
  new Promise((r) => {
    const sock = connect(PORT, "127.0.0.1");
    sock.on("connect", () => (sock.destroy(), r(true))).on("error", () => r(false));
  });

async function waitPort(want, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end && (await listening()) !== want; ) await sleep(200);
  return (await listening()) === want;
}

async function shot(win, name) {
  writeFileSync(join(out, name), (await win.webContents.capturePage()).toPNG());
  log("screenshot", join(out, name));
}

async function main() {
  const site = mkdtempSync(join(tmpdir(), "ld-site-"));
  writeFileSync(join(site, "index.html"), "<title>Smoke Site</title>");
  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: site, stdio: "ignore" });

  try {
    const { start } = await import("../dist/app.js");
    const desk = await start();
    await desk.ready;

    const pop = desk.popup.webContents;
    desk.showPopup();
    await until(pop, `document.body.innerText.includes(":${PORT}")`, "server in popup");
    await sleep(500);
    check(desk.popup.isVisible(), "popup shown under the tray icon");
    check((await text(pop)).includes("Smoke Site"), "popup lists the server with its page title");
    check((await text(pop)).includes("Desktop"), "mode pill says Desktop");
    check(desk.popup.getSize()[1] < 600, `popup sized to its content (${desk.popup.getSize().join("x")})`);
    await shot(desk.popup, "popup.png");

    check(await click(pop, `:${PORT}`, "Stop"), "Stop clicked");
    check(await click(pop, `:${PORT}`, "Confirm?"), "Confirm clicked");
    check(await waitPort(false), "server stopped from the popup");
    await until(pop, `document.body.innerText.toLowerCase().includes("stopped")`, "Stopped section");

    const dash = desk.showDashboard();
    await until(dash.webContents, `!!document.querySelector("tbody tr")`, "profile rows in dashboard");
    check(await click(dash.webContents, site.split("/").pop(), "Start"), "Start clicked in dashboard");
    check(await waitPort(true), "server restarted from the dashboard");
    await until(dash.webContents, `document.body.innerText.includes(":${PORT}")`, "running row in dashboard");
    await shot(dash, "dashboard.png");
  } catch (e) {
    log("FAIL", e.message);
    failed = true;
  } finally {
    server.kill();
    spawn("pkill", ["-f", `http.server ${PORT}`]);
    log(failed ? "FAILED" : "ALL PASSED", `(artifacts in ${out})`);
    app.exit(failed ? 1 : 0);
  }
}

main();
