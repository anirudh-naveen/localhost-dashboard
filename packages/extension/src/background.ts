import { HOST_NAME, type HostMessage, type HostMethods, type HostRequest, type HostResponse, type Server, type Snapshot } from "@ld/shared";
import { UI_PORT, type BgToUi, type UiToBg, type State } from "./messages";
import { probeServers } from "./probe";

const PROBE_MS = 3000;
/** Keep the companion alive briefly after the last UI page closes, so reopening is instant. */
const LINGER_MS = 5000;
const BADGE_ALARM = "badge";

let state: State = { mode: "connecting", servers: [], profiles: [], tabs: {} };
const uiPages = new Set<chrome.runtime.Port>();

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
  if (uiPages.size === 0) return;
  state.tabs = await tabsByPort();
  const msg: BgToUi = { type: "state", state };
  for (const p of uiPages) p.postMessage(msg);
}

// ── Companion connection ─────────────────────────────────────────────────────

class HostConnection {
  private port: chrome.runtime.Port;
  private nextId = 1;
  private pending = new Map<number, (r: HostResponse) => void>();

  constructor(onSnapshot: (s: Snapshot) => void, onClose: (error?: string) => void) {
    this.port = chrome.runtime.connectNative(HOST_NAME);
    this.port.onMessage.addListener((msg: HostMessage) => {
      if ("event" in msg) onSnapshot({ servers: msg.servers, profiles: msg.profiles });
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
  void setState({ mode: "probe", hostError, profiles: [] });
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
    (snap) => void setState(snap),
    (error) => {
      if (host !== conn) return;
      host = undefined;
      // Fall back only while someone is looking; otherwise the alarm handles the badge.
      if (uiPages.size) startProbing(error ?? "Companion exited");
    },
  );
  host = conn;
  conn.request("subscribe").then(
    (snap) => setState({ mode: "host", hostError: undefined, ...snap }),
    (e: Error) => {
      // Companion still connected but can't list (e.g. lsof failing): don't sit on "Connecting…".
      if (host !== conn) return; // onClose already fell back
      host = undefined;
      conn.close();
      if (uiPages.size) startProbing(`Companion error: ${e.message}`);
    },
  );
}

function disconnect(): void {
  host?.close();
  host = undefined;
  stopProbing();
}

// ── UI page protocol ───────────────────────────────────────────────────────────

async function open(port: number): Promise<void> {
  // Re-query rather than trusting state.tabs, which may name a tab closed since.
  const [tabId] = (await tabsByPort())[port] ?? [];
  if (tabId !== undefined) {
    try {
      const tab = await chrome.tabs.update(tabId, { active: true });
      if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      return;
    } catch {
      // Closed in the meantime; open a new one.
    }
  }
  await chrome.tabs.create({ url: `http://localhost:${port}/` });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Navigate tabs on localhost:`from` to the same path on :`to`. */
async function retargetTabs(from: number, to: number): Promise<number> {
  const ids = (await tabsByPort())[from] ?? [];
  for (const id of ids) {
    const tab = await chrome.tabs.get(id).catch(() => undefined);
    if (!tab?.url) continue;
    const url = new URL(tab.url);
    if (!LOCAL_HOSTS.has(url.hostname)) continue;
    url.port = String(to);
    await chrome.tabs.update(id, { url: url.toString() }).catch(() => {});
  }
  return ids.length;
}

async function relay(p: chrome.runtime.Port, reqId: number, fn: (h: HostConnection) => Promise<unknown>): Promise<void> {
  let reply: BgToUi;
  try {
    if (!host) throw new Error("Companion not connected");
    reply = { type: "result", reqId, ok: true, result: await fn(host) };
  } catch (e) {
    reply = { type: "result", reqId, ok: false, error: (e as Error).message };
  }
  p.postMessage(reply);
}

async function onUiMessage(p: chrome.runtime.Port, msg: UiToBg): Promise<void> {
  switch (msg.type) {
    case "refresh":
      if (host) {
        try {
          await setState(await host.request("list"));
        } catch (e) {
          console.warn("refresh failed:", e);
        }
        return;
      }
      // Retry the companion in case it was installed since we fell back.
      stopProbing();
      return connect();
    case "open":
      return open(msg.port);
    case "host":
      // The companion pushes a fresh snapshot after mutating requests.
      return relay(p, msg.reqId, (h) => h.request(msg.method, msg.params as never));
    case "move": {
      const { retargetTabs: retarget, ...params } = msg.params;
      return relay(p, msg.reqId, async (h) => {
        const result = await h.request("move", params);
        if (retarget && result.started?.listening && result.oldPort) {
          await retargetTabs(result.oldPort, result.newPort);
        }
        return result;
      });
    }
  }
}

chrome.runtime.onConnect.addListener((p) => {
  if (p.name !== UI_PORT) return;
  uiPages.add(p);
  clearTimeout(lingerTimer);
  connect();
  void setState({});
  p.onMessage.addListener((msg: UiToBg) => void onUiMessage(p, msg));
  p.onDisconnect.addListener(() => {
    uiPages.delete(p);
    if (uiPages.size === 0) lingerTimer = setTimeout(disconnect, LINGER_MS);
  });
});

const refreshTabs = () => {
  if (uiPages.size) void setState({});
};
chrome.tabs.onUpdated.addListener((_id, info) => info.url && refreshTabs());
chrome.tabs.onRemoved.addListener(refreshTabs);

// ── Badge while no UI page is open ──────────────────────────────────────────

async function refreshBadge(): Promise<void> {
  if (host || probeTimer) return;
  try {
    const res = (await chrome.runtime.sendNativeMessage(HOST_NAME, { id: 0, type: "list" })) as HostResponse;
    if (res.ok) return updateBadge((res.result as Snapshot).servers);
  } catch {
    // Companion not installed.
  }
  updateBadge(await probeServers());
}

// Alarms can be dropped across browser restarts, so make sure ours exists whenever the worker starts.
void chrome.alarms.get(BADGE_ALARM).then((a) => {
  if (!a) chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });
});
chrome.runtime.onInstalled.addListener(() => void refreshBadge());
chrome.runtime.onStartup.addListener(() => void refreshBadge());
chrome.alarms.onAlarm.addListener((a) => a.name === BADGE_ALARM && void refreshBadge());
