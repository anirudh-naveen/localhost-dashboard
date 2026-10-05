import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray, type WebContents } from "electron";
import { invoke, MUTATING, snapshot, snapshotKey, type ActionMethod } from "@ld/core";
import type { BgToUi, State, UiToBg } from "@ld/shared";
import { startApi } from "./api.js";

/** Poll fast while a window is open (matches the companion), slowly for the tray count. */
const FAST_MS = 2000;
const SLOW_MS = 15_000;
const POPUP_WIDTH = 420;
const POPUP_MAX_HEIGHT = 600;

/** The app root (packages/desktop, or the packaged app.asar), wherever Electron was launched from. */
const root = fileURLToPath(new URL("..", import.meta.url));
/** The UI is the extension's own build (copied to ui/ by scripts/copy-ui.mjs), run over an IPC bridge. */
const page = (name: "popup" | "dashboard") => join(root, "ui", `${name}.html`);
const preload = join(root, "preload.cjs");

export interface DesktopApp {
  showPopup(): void;
  showDashboard(): BrowserWindow;
  popup: BrowserWindow;
  /** Resolves once the first snapshot has been taken. */
  ready: Promise<void>;
}

export async function start(): Promise<DesktopApp> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    throw new Error("already running");
  }
  await app.whenReady();
  // A menu-bar app: no Dock icon, and closing windows doesn't quit.
  app.dock?.hide();
  app.on("window-all-closed", () => {});

  let state: State = { mode: "connecting", servers: [], profiles: [], tabs: {} };
  let lastKey = "";
  const renderers = new Set<WebContents>();

  const send = (to: WebContents, msg: BgToUi) => {
    if (!to.isDestroyed()) to.send("ld:msg", msg);
  };
  const broadcast = () => renderers.forEach((r) => send(r, { type: "state", state }));

  // ── Tray ──────────────────────────────────────────────────────────────────
  const icon = nativeImage.createFromPath(join(root, "assets/trayTemplate.png"));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip("Localhost Dashboard");

  function updateTray() {
    const n = state.servers.filter((s) => !s.hidden).length;
    // macOS shows the title beside the icon, like the extension's badge.
    if (process.platform === "darwin") tray.setTitle(n ? String(n) : "", { fontType: "monospacedDigit" });
    tray.setToolTip(`Localhost Dashboard: ${n} server${n === 1 ? "" : "s"} running`);
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────
  let refreshing: Promise<void> | undefined;
  let refreshedAt = 0;
  function refresh(force = false): Promise<void> {
    refreshing ??= snapshot()
      .then((snap) => {
        const key = snapshotKey(snap);
        refreshedAt = Date.now();
        state = { mode: "desktop", ...snap, tabs: {} };
        updateTray();
        if (force || key !== lastKey) {
          lastKey = key;
          broadcast();
        }
      })
      .catch((e) => console.error("refresh failed:", e))
      .finally(() => (refreshing = undefined));
    return refreshing;
  }

  const anyVisible = () => BrowserWindow.getAllWindows().some((w) => w.isVisible());
  let lastPoll = 0;
  setInterval(() => {
    if (anyVisible() || Date.now() - lastPoll >= SLOW_MS) {
      lastPoll = Date.now();
      void refresh();
    }
  }, FAST_MS);

  // ── Windows ───────────────────────────────────────────────────────────────
  const popup = new BrowserWindow({
    width: POPUP_WIDTH,
    height: 360,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true },
  });
  popup.on("blur", () => {
    if (!popup.webContents.isDevToolsOpened()) popup.hide();
  });
  void popup.loadFile(page("popup"));

  /** Below the tray icon (macOS menu bar), or above it when the tray is at the bottom (Windows/Linux). */
  function placePopup() {
    const t = tray.getBounds();
    const { workArea } = screen.getDisplayNearestPoint({ x: t.x, y: t.y });
    const [w, h] = popup.getSize();
    const x = Math.round(Math.min(Math.max(t.x + t.width / 2 - w / 2, workArea.x), workArea.x + workArea.width - w));
    const below = t.y < workArea.y + workArea.height / 2;
    const y = below ? Math.max(t.y + t.height, workArea.y) : t.y - h;
    popup.setPosition(x, Math.round(y));
  }

  function showPopup() {
    placePopup();
    popup.show();
    popup.focus();
    void refresh(true);
  }

  let dashboard: BrowserWindow | undefined;
  function showDashboard(): BrowserWindow {
    popup.hide();
    if (dashboard && !dashboard.isDestroyed()) {
      dashboard.show();
      dashboard.focus();
      return dashboard;
    }
    dashboard = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 640,
      minHeight: 420,
      title: "Localhost Dashboard",
      webPreferences: { preload, sandbox: true, contextIsolation: true },
    });
    // Show in the Dock and app switcher while the dashboard is open.
    void app.dock?.show();
    dashboard.on("closed", () => {
      dashboard = undefined;
      app.dock?.hide();
    });
    void dashboard.loadFile(page("dashboard"));
    return dashboard;
  }

  // Keep the UI's links (e.g. "Open") in the user's browser rather than in our windows.
  app.on("web-contents-created", (_e, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (e) => e.preventDefault());
  });

  tray.on("click", () => (popup.isVisible() ? popup.hide() : showPopup()));
  tray.on("right-click", () => {
    tray.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Dashboard", click: () => showDashboard() },
        { label: "Refresh", click: () => void refresh(true) },
        { type: "separator" },
        {
          label: "Open at Login",
          type: "checkbox",
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
        },
        { type: "separator" },
        { label: "Quit Localhost Dashboard", role: "quit" },
      ]),
    );
  });

  // ── IPC from the UI pages (see preload.cjs) ───────────────────────────────
  ipcMain.on("ld:connect", (e) => {
    const wc = e.sender;
    renderers.add(wc);
    wc.once("destroyed", () => renderers.delete(wc));
    send(wc, { type: "state", state });
  });

  // The popup sizes itself to its content.
  ipcMain.on("ld:height", (e, height: number) => {
    if (e.sender !== popup.webContents) return;
    const h = Math.min(Math.max(Math.ceil(height), 120), POPUP_MAX_HEIGHT);
    if (popup.getSize()[1] !== h) {
      popup.setSize(POPUP_WIDTH, h);
      if (popup.isVisible()) placePopup();
    }
  });

  ipcMain.on("ld:open-dashboard", () => showDashboard());

  ipcMain.on("ld:send", async (e, msg: UiToBg) => {
    switch (msg.type) {
      case "refresh":
        return refresh(true);
      case "open":
        popup.hide();
        return shell.openExternal(`http://localhost:${msg.port}/`);
      case "host":
      case "move": {
        // No browser tabs to retarget from here, so a move is just the plain action.
        const [method, params] =
          msg.type === "move"
            ? (["move", (({ retargetTabs: _, ...p }) => p)(msg.params)] as const)
            : ([msg.method as ActionMethod, msg.params] as const);
        let reply: BgToUi;
        try {
          const result = await invoke(method, params as never);
          reply = { type: "result", reqId: msg.reqId, ok: true, result };
        } catch (err) {
          reply = { type: "result", reqId: msg.reqId, ok: false, error: (err as Error).message };
        }
        send(e.sender, reply);
        if (MUTATING.has(method)) void refresh(true);
      }
    }
  });

  app.on("second-instance", () => showPopup());

  // ── API for browser extensions (Safari's only way in; a fallback for the others) ──
  await startApi({
    async snapshot() {
      if (Date.now() - refreshedAt > 1000) await refresh();
      return { servers: state.servers, profiles: state.profiles };
    },
    async approve(origin) {
      const browser = origin.startsWith("safari")
        ? "Safari"
        : origin.startsWith("moz")
          ? "Firefox"
          : "Chrome (or another Chromium browser)";
      const { response } = await dialog.showMessageBox({
        type: "question",
        buttons: ["Allow", "Don't Allow"],
        defaultId: 0,
        cancelId: 1,
        message: `Allow the ${browser} extension to control your local servers?`,
        detail: `It will be able to list, start, stop and move servers through Localhost Dashboard.\n\n${origin}`,
      });
      return response === 0;
    },
    onMutate: () => void refresh(true),
  });

  const ready = refresh(true);
  return { showPopup, showDashboard, popup, ready };
}
