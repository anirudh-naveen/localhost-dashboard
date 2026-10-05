/**
 * The WebExtension API: Firefox's promise-based `browser`, else Chrome's `chrome`
 * (whose MV3 APIs also return promises). Typed as Chrome's; the shapes we use match.
 */
export const ext: typeof chrome = (globalThis as { browser?: typeof chrome }).browser ?? chrome;
