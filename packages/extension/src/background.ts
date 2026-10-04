import { HOST_NAME, type HostMessage, type HostMethods, type HostRequest, type HostResponse, type Server } from "@ld/shared";
import { POPUP_PORT, type BgToPopup, type PopupToBg, type State } from "./messages";
import { probeServers } from "./probe";

const PROBE_MS = 3000;
/** Keep the companion alive briefly after the popup closes, so reopening is instant. */
const LINGER_MS = 5000;
const BADGE_ALARM = "badge";

let state: State = { mode: "connecting", servers: [], tabs: {} };
const popups = new Set<chrome.runtime.Port>();

// ── State + broadcast ────────────────────────────────────────────────────────

async function tabsByPort(): Promise<Record<number, number[]>> {
  const tabs = await chrome.tabs.query({ url: ["http://localhost/*", "http://127.0.0.1/*"] });
  const out: Record<number, number[]> = {};
  for (const t of tabs) {
    if (!t.url || t.id === undefined) continue;
    const port = Number(new URL(t.url).port || 80);
    (out[port] ??= []).push(t.id);
  }
  return out;
}

function updateBadge(servers: Server[]): void {
  const n = servers.filter((s) => !s.hidden).length;
  chrome.action.setBadgeText({ text: n ? String(n) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
}

async function setState(patch: Partial<State>): Promise<void> {
  state = { ...state, ...patch };
  if (patch.servers) updateBadge(patch.servers);
  if (popups.size === 0) return;
  state.tabs = await tabsByPort();
  const msg: BgToPopup = { type: "state", state };
  for (const p of popups) p.postMessage(msg);
}

// ── Companion connection ─────────────────────────────────────────────────────

class HostConnection {
  private port: chrome.runtime.Port;
  private nextId = 1;
  private pending = new Map<number, (r: HostResponse) => void>();

  constructor(onServers: (s: Server[]) => void, onClose: (error?: string) => void) {
    this.port = chrome.runtime.connectNative(HOST_NAME);
    this.port.onMessage.addListener((msg: HostMessage) => {
      if ("event" in msg) onServers(msg.servers);
      else this.pending.get(msg.id)?.(msg);
    });
    this.port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      for (const resolve of this.pending.values()) resolve({ id: 0, ok: false, error: error ?? "companion disconnected" });
      this.pending.clear();
      onClose(error);
    });
  }

  request<M extends keyof HostMethods>(
    type: M,
    params: HostMethods[M]["params"] = {} as HostMethods[M]["params"],
  ): Promise<HostMethods[M]["result"]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => {
        this.pending.delete(id);
        if (r.ok) resolve(r.result as HostMethods[M]["result"]);
        else reject(new Error(r.error));
      });
      this.port.postMessage({ id, type, ...params } as HostRequest);
    });
  }

  close(): void {
    this.port.disconnect();
  }
}

let host: HostConnection | undefined;
let probeTimer: ReturnType<typeof setInterval> | undefined;
let lingerTimer: ReturnType<typeof setTimeout> | undefined;

function startProbing(hostError?: string): void {
  void setState({ mode: "probe", hostError });
  if (probeTimer) return;
  const tick = async () => setState({ servers: await probeServers() });
  void tick();
  probeTimer = setInterval(tick, PROBE_MS);
}

function stopProbing(): void {
  clearInterval(probeTimer);
  probeTimer = undefined;
}

function connect(): void {
  if (host || probeTimer) return;
  void setState({ mode: "connecting" });
  const conn = new HostConnection(
    (servers) => void setState({ servers }),
    (error) => {
      if (host !== conn) return;
      host = undefined;
      // Fall back only while someone is looking; otherwise the alarm handles the badge.
      if (popups.size) startProbing(error ?? "Companion exited");
    },
  );
  host = conn;
  conn.request("subscribe").then(
    (servers) => setState({ mode: "host", hostError: undefined, servers }),
    () => {
      /* onClose already switched to probe mode */
    },
  );
}

function disconnect(): void {
  host?.close();
  host = undefined;
  stopProbing();
}

// ── Popup protocol ───────────────────────────────────────────────────────────

async function open(port: number): Promise<void> {
  const [tabId] = state.tabs[port] ?? (await tabsByPort())[port] ?? [];
  if (tabId !== undefined) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: `http://localhost:${port}/` });
  }
}

async function onPopupMessage(p: chrome.runtime.Port, msg: PopupToBg): Promise<void> {
  switch (msg.type) {
    case "refresh":
      if (host) return setState({ servers: await host.request("list") });
      // Retry the companion in case it was installed since we fell back.
      stopProbing();
      return connect();
    case "open":
      return open(msg.port);
    case "stop": {
      let reply: BgToPopup;
      try {
        if (!host) throw new Error("Companion not connected");
        await host.request("stop", { pid: msg.pid, port: msg.port });
        reply = { type: "result", reqId: msg.reqId, ok: true };
        await setState({ servers: await host.request("list") });
      } catch (e) {
        reply = { type: "result", reqId: msg.reqId, ok: false, error: (e as Error).message };
      }
      p.postMessage(reply);
    }
  }
}

chrome.runtime.onConnect.addListener((p) => {
  if (p.name !== POPUP_PORT) return;
  popups.add(p);
  clearTimeout(lingerTimer);
  connect();
  void setState({});
  p.onMessage.addListener((msg: PopupToBg) => void onPopupMessage(p, msg));
  p.onDisconnect.addListener(() => {
    popups.delete(p);
    if (popups.size === 0) lingerTimer = setTimeout(disconnect, LINGER_MS);
  });
});

const refreshTabs = () => {
  if (popups.size) void setState({});
};
chrome.tabs.onUpdated.addListener((_id, info) => info.url && refreshTabs());
chrome.tabs.onRemoved.addListener(refreshTabs);

// ── Badge while the popup is closed ──────────────────────────────────────────

async function refreshBadge(): Promise<void> {
  if (host || probeTimer) return;
  try {
    const res = (await chrome.runtime.sendNativeMessage(HOST_NAME, { id: 0, type: "list" })) as HostResponse;
    if (res.ok) return updateBadge(res.result as Server[]);
  } catch {
    // Companion not installed.
  }
  updateBadge(await probeServers());
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
  void refreshBadge();
});
chrome.runtime.onStartup.addListener(() => void refreshBadge());
chrome.alarms.onAlarm.addListener((a) => a.name === BADGE_ALARM && void refreshBadge());
