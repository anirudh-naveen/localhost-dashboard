/**
 * Protocol between the UI pages (popup, dashboard) and whatever backs them:
 * the extension's background worker or the desktop app's main process.
 */
import type { HostMethods, Profile, Server } from "./protocol.js";

/** host: via the stdio companion; desktop: via the desktop app's API (or inside it); probe: detect-only. */
export type Mode = "connecting" | "host" | "desktop" | "probe";

export interface State {
  mode: Mode;
  servers: Server[];
  /** Empty in probe mode: profiles live with the companion. */
  profiles: Profile[];
  /** Why the companion isn't available, when mode is "probe". */
  hostError?: string;
  /** port → ids of tabs showing it. */
  tabs: Record<number, number[]>;
}

/** Companion methods UI pages may call through the background. */
export type UiMethod = Exclude<keyof HostMethods, "ping" | "list" | "subscribe">;

export type MoveParams = HostMethods["move"]["params"] & {
  /** Point tabs on the old port at the new one once it's listening. */
  retargetTabs: boolean;
};

export type UiToBg =
  | { type: "refresh" }
  | { type: "open"; port: number }
  | { type: "host"; reqId: number; method: UiMethod; params: object }
  | { type: "move"; reqId: number; params: MoveParams };

export type BgToUi =
  | { type: "state"; state: State }
  | { type: "result"; reqId: number; ok: true; result: unknown }
  | { type: "result"; reqId: number; ok: false; error: string };

/** Bridge the desktop app's preload exposes as `window.ldDesktop`. */
export interface DesktopBridge {
  /** Subscribe to backend messages; returns an unsubscribe function. */
  connect(onMessage: (msg: BgToUi) => void): () => void;
  send(msg: UiToBg): void;
  openDashboard(): void;
}
