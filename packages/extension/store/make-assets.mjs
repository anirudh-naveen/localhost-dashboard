// Render Chrome Web Store graphics from the real UI pages with demo data:
//   electron packages/extension/store/make-assets.mjs
// Writes screenshot-*.png (1280x800) and promo-small.png (440x280) next to this file.
// No top-level await: Electron won't emit "ready" until the entry module finishes evaluating.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = (p) => fileURLToPath(new URL(`../dist/${p}`, import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Windows are created and destroyed one at a time; don't quit when the last one closes.
app.on("window-all-closed", () => {});

/** Capture `w` at exactly width x height CSS pixels (Retina captures come out doubled). */
async function snap(w, width, height, rect) {
  return (await w.webContents.capturePage(rect)).resize({ width, height, quality: "best" }).toPNG();
}

const icon = `data:image/png;base64,${readFileSync(dist("icons/icon-128.png")).toString("base64")}`;

function window(width, height, dark) {
  return new BrowserWindow({
    width, height, show: false, frame: false, useContentSize: true,
    backgroundColor: dark ? "#15171c" : "#ffffff",
    webPreferences: { preload: here("demo-preload.cjs"), sandbox: true, contextIsolation: true },
  });
}

async function capturePage(page, width, height, { dark = false, before } = {}) {
  const { nativeTheme } = await import("electron");
  nativeTheme.themeSource = dark ? "dark" : "light";
  const w = window(width, height, dark);
  await w.loadFile(dist(page));
  await sleep(400);
  if (before) {
    await w.webContents.executeJavaScript(before);
    await sleep(500);
  }
  const h = Math.min(height, await w.webContents.executeJavaScript("document.body.scrollHeight"));
  const png = await snap(w, width, h, { x: 0, y: 0, width, height: h });
  w.destroy();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Place a captured popup on a branded 1280x800 canvas with a headline. */
async function compose(name, popupImg, headline, sub, dark) {
  const w = new BrowserWindow({ width: 1280, height: 800, show: false, frame: false, useContentSize: true });
  const bg = dark ? "#0e1014" : "#eef2f0";
  const fg = dark ? "#e5e7eb" : "#111827";
  const muted = dark ? "#9ca3af" : "#4b5563";
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:1280px;height:800px;background:${bg};color:${fg};font:16px system-ui,-apple-system,sans-serif;
      display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;overflow:hidden}
    .copy{flex:1} h1{font-size:44px;line-height:1.15;margin:0 0 18px;font-weight:700;letter-spacing:-.02em}
    p{font-size:20px;line-height:1.5;color:${muted};margin:0} .brand{display:flex;align-items:center;gap:12px;margin-bottom:28px;font-weight:600;font-size:18px}
    .brand img{width:40px;height:40px} .shot{border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.28),0 0 0 1px rgba(127,127,127,.18);overflow:hidden;display:flex}
  </style><div class="copy"><div class="brand"><img src="${icon}">Localhost Dashboard</div><h1>${headline}</h1><p>${sub}</p></div>
  <div class="shot"><img src="${popupImg}" width="420"></div>`;
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await sleep(300);
  writeFileSync(here(name), await snap(w, 1280, 800));
  w.destroy();
  console.log("wrote", name);
}

async function main() {
  // 1. The dashboard as-is.
  const dash = window(1280, 800, false);
  const { nativeTheme } = await import("electron");
  nativeTheme.themeSource = "light";
  await dash.loadFile(dist("dashboard.html"));
  await sleep(500);
  writeFileSync(here("screenshot-1-dashboard.png"), await snap(dash, 1280, 800));
  dash.destroy();
  console.log("wrote screenshot-1-dashboard.png");

  // 2. The popup, light.
  await compose(
    "screenshot-2-popup.png",
    await capturePage("popup.html", 420, 800),
    "Every dev server on localhost, one click away",
    "See what's running and on which port, jump to its tab, and stop it, even when it was started in a terminal you've lost.",
    false,
  );

  // 3. Move, dark: open the Move panel for the Vite server.
  await compose(
    "screenshot-3-move.png",
    await capturePage("popup.html", 420, 800, {
      dark: true,
      before: `[...document.querySelectorAll("li.row")].find(r => r.innerText.includes(":5173")).querySelector("button[title^='Restart']").click()`,
    }),
    "Move a server to another port",
    "The command is rewritten for you (Vite, Next, Django, Rails, Docker Compose…), the server restarts there, and your open tabs follow.",
    true,
  );

  // Small promo tile, 440x280.
  const tile = new BrowserWindow({ width: 440, height: 280, show: false, frame: false, useContentSize: true });
  await tile.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:440px;height:280px;background:linear-gradient(135deg,#181c26,#0f2a1c);color:#e5e7eb;
      font:16px system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 36px;box-sizing:border-box}
    img{width:64px;height:64px;margin-bottom:18px} h1{margin:0 0 8px;font-size:30px;letter-spacing:-.01em} p{margin:0;color:#86efac;font-size:16px}
  </style><img src="${icon}"><h1>Localhost Dashboard</h1><p>See, stop and move your dev servers</p>`)}`);
  await sleep(300);
  writeFileSync(here("promo-small.png"), await snap(tile, 440, 280));
  tile.destroy();
  console.log("wrote promo-small.png");
  app.exit(0);
}

app.whenReady().then(() => main().catch((e) => (console.error(e), app.exit(1))));
