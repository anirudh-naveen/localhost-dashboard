import { homedir } from "node:os";
import { join } from "node:path";

/** `LD_STATE_DIR` overrides the location (used by tests). */
export function stateDir(): string {
  return process.env.LD_STATE_DIR ?? join(homedir(), ".localhost-dashboard");
}

export function profilesFile(): string {
  return join(stateDir(), "profiles.json");
}

export function logFile(profileId: string): string {
  return join(stateDir(), "logs", `${profileId}.log`);
}
