// Icon artwork shared by the extension and the desktop app, as shade functions for png().

const BG = [24, 28, 38];
const RING = [34, 197, 94];
const DOT = [134, 239, 172];
const BLACK = [0, 0, 0];

/** App icon: rounded dark square with a green ring and dot. */
export function appIcon(x, y, corner = 0.22) {
  const cx = Math.min(Math.max(x, corner), 1 - corner), cy = Math.min(Math.max(y, corner), 1 - corner);
  if (Math.hypot(x - cx, y - cy) > corner) return null;
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (d < 0.14) return DOT;
  if (d > 0.24 && d < 0.33) return RING;
  return BG;
}

/** macOS menu-bar "template" icon: black ring and dot, tinted by the system. */
export function trayIcon(x, y) {
  const d = Math.hypot(x - 0.5, y - 0.5);
  return d < 0.16 || (d > 0.3 && d < 0.42) ? BLACK : null;
}
