import type { Framework, MovePreview, MoveResult, Profile, Server } from "@ld/shared";
import { stopServer } from "./control.js";
import { startProfile } from "./launch.js";
import { isPortFree, suggestPort, validPort } from "./ports.js";
import { rewritePort } from "./portRewrite.js";
import { saveProfile } from "./profiles.js";

/** The running server knows best; a stopped profile falls back to what was last seen. */
function frameworkOf(profile: Profile, server: Server | undefined): Framework {
  return server && server.framework !== "unknown" ? server.framework : (profile.framework ?? "unknown");
}

/** Proposed rewrite for moving `profile` to `port` (default: next free port). `server` is its running instance, if any. */
export async function previewMove(profile: Profile, server: Server | undefined, port?: number): Promise<MovePreview> {
  const target = port ?? (await suggestPort(profile.port ?? server?.port ?? 3000));
  if (!validPort(target)) throw new Error("Port must be 1–65535");
  const rw = rewritePort(profile.command, profile.env, frameworkOf(profile, server), profile.port, target);
  return {
    port: target,
    free: target !== profile.port && (await isPortFree(target)),
    ...rw,
    running: !!server,
  };
}

/**
 * Point `profile` at `port`: rewrite its command/env (or use the caller's
 * override), and if `server` is running, restart it there. If the restart
 * fails, the old profile is restored and restarted.
 */
export async function moveProfile(
  profile: Profile,
  server: Server | undefined,
  port: number,
  override?: { command?: string; env?: Record<string, string> },
): Promise<MoveResult> {
  if (!validPort(port)) throw new Error("Port must be 1–65535");
  if (port === profile.port) throw new Error(`Already on :${port}`);
  if (!(await isPortFree(port))) throw new Error(`:${port} is already in use`);

  const rw = rewritePort(profile.command, profile.env, frameworkOf(profile, server), profile.port, port);
  const moved: Profile = {
    ...profile,
    command: override?.command?.trim() || rw.command,
    env: override?.env ?? rw.env,
    port,
    // A deliberate move makes the profile user-owned so auto-capture won't revert it.
    autoCaptured: false,
  };
  await saveProfile(moved);
  if (!server) return { profile: moved, oldPort: profile.port, newPort: port };

  await stopServer(server.pid, server.port);
  try {
    const started = await startProfile(moved);
    return { profile: moved, oldPort: profile.port, newPort: port, started };
  } catch (e) {
    const reason = (e as Error).message;
    await saveProfile(profile);
    try {
      await startProfile(profile);
    } catch (e2) {
      throw new Error(
        `Couldn't start on :${port} (${reason}); restarting on :${profile.port} also failed: ${(e2 as Error).message}`,
      );
    }
    throw new Error(`Couldn't start on :${port}, so it's back on :${profile.port}: ${reason}`);
  }
}
