import type { DesktopBridge } from "@ld/shared";

const g = globalThis as { browser?: typeof chrome; chrome?: typeof chrome; ldDesktop?: DesktopBridge };

/**
 * The WebExtension API: Firefox's promise-based `browser`, else Chrome's `chrome`
 * (whose MV3 APIs also return promises). Typed as Chrome's; the shapes we use match.
 * Undefined in the desktop app, where `desktop` is set instead.
 */
export const ext = (g.browser ?? g.chrome) as typeof chrome;

/** Set when the UI runs inside the desktop app rather than the extension. */
export const desktop: DesktopBridge | undefined = g.ldDesktop;
