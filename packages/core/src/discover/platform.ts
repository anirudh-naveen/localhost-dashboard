import type { Listener, ProcInfo } from "./parse.js";
import { darwinPlatform } from "./darwin.js";
import { linuxPlatform } from "./linux.js";

/** OS-specific process and socket inspection. */
export interface Platform {
  /** Every listening TCP socket we can attribute to a process. */
  listeners(): Promise<Listener[]>;
  /** All processes, for walking parent chains. */
  processes(): Promise<Map<number, ProcInfo>>;
  cwds(pids: number[]): Promise<Map<number, string>>;
}

let current: Platform | undefined;

export function platform(): Platform {
  current ??= process.platform === "linux" ? linuxPlatform() : darwinPlatform();
  return current;
}

/** Swap the implementation (tests run Linux discovery against a captured /proc). */
export function setPlatform(p: Platform | undefined): void {
  current = p;
}
