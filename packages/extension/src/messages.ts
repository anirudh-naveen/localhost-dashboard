import type { Server } from "@ld/shared";

export type Mode = "connecting" | "host" | "probe";

export interface State {
  mode: Mode;
  servers: Server[];
  /** Why the companion isn't available, when mode is "probe". */
  hostError?: string;
  /** port → ids of tabs showing it. */
  tabs: Record<number, number[]>;
}

export type PopupToBg =
  | { type: "refresh" }
  | { type: "open"; port: number }
  | { type: "stop"; reqId: number; pid: number; port: number };

export type BgToPopup =
  | { type: "state"; state: State }
  | { type: "result"; reqId: number; ok: boolean; error?: string };

export const POPUP_PORT = "popup";
