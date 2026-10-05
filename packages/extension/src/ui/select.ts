import type { Profile } from "@ld/shared";
import type { State } from "../messages";

/** Profiles with no running server: pinned first, then most recently seen. */
export function stoppedProfiles(state: State): Profile[] {
  const running = new Set(state.servers.map((s) => s.profileId).filter(Boolean));
  return state.profiles
    .filter((p) => !running.has(p.id))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastSeen ?? b.createdAt) - (a.lastSeen ?? a.createdAt));
}

export function profileById(state: State): Map<string, Profile> {
  return new Map(state.profiles.map((p) => [p.id, p]));
}

/** Focus the dashboard if it's already open, otherwise open it. */
export async function openDashboard(): Promise<void> {
  const url = chrome.runtime.getURL("dashboard.html");
  // Match patterns can't express chrome-extension:// URLs, so filter by hand.
  const tab = (await chrome.tabs.query({})).find((t) => t.url?.startsWith(url));
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
}
