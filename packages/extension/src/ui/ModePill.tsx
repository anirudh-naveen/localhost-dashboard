import type { Mode } from "@ld/shared";
import { desktop } from "../ext";

const LABEL: Record<Mode, string> = {
  // In the desktop app there's no companion: the app itself does the work.
  host: desktop ? "Desktop" : "Companion",
  probe: "Detect-only",
  connecting: "Connecting…",
};

export function ModePill({ mode }: { mode: Mode }) {
  return <span className={`pill pill-${mode}`}>{LABEL[mode]}</span>;
}
