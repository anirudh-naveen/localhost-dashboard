import type { HostMethods, Profile, Server } from "@ld/shared";

export type Mode = "connecting" | "host" | "probe";

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

export type UiToBg =
  | { type: "refresh" }
  | { type: "open"; port: number }
  | { type: "host"; reqId: number; method: UiMethod; params: object };

export type BgToUi =
  | { type: "state"; state: State }
  | { type: "result"; reqId: number; ok: true; result: unknown }
  | { type: "result"; reqId: number; ok: false; error: string };

export const UI_PORT = "ui";
