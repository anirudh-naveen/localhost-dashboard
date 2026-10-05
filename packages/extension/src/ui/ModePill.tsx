import type { Mode } from "@ld/shared";
import { desktop } from "../ext";

const LABEL: Record<Mode, string> = {
  host: "Companion",
  // Inside the desktop app it's just "Desktop"; in a browser, connected to the app.
  desktop: desktop ? "Desktop" : "Desktop app",
  probe: "Detect-only",
  connecting: "Connecting…",
};

export function ModePill({ mode }: { mode: Mode }) {
  return <span className={`pill pill-${mode}`}>{LABEL[mode]}</span>;
}
