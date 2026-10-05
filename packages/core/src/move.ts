import type { Framework, MovePreview, MoveResult, Profile, Server } from "@ld/shared";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stopServer } from "./control.js";
import { composeFilesExist, composeOverride, containerLaunch } from "./docker.js";
import { startProfile } from "./launch.js";
import { stateDir } from "./paths.js";
import { isPortFree, suggestPort, validPort } from "./ports.js";
import { rewritePort, type PortRewrite } from "./portRewrite.js";
import { saveProfile } from "./profiles.js";

/** The running server knows best; a stopped profile falls back to what was last seen. */
function frameworkOf(profile: Profile, server: Server | undefined): Framework {
  return server && server.framework !== "unknown" ? server.framework : (profile.framework ?? "unknown");
}

const overridePath = (profile: Profile) => join(stateDir(), "compose", `${profile.id}.yaml`);

/** Docker profiles move by re-publishing via a compose override; plain `docker run` containers can't move safely. */
function dockerRewrite(profile: Profile): PortRewrite | undefined {
  const d = profile.docker;
  if (!d) return undefined;
  if (!d.compose) {
    throw new Error(
      `${d.name} was started with \`docker run\`; changing its port means recreating it. Re-run it with -p NEW:${d.containerPort}, or use Compose.`,
    );
  }
  if (!composeFilesExist(d.compose)) {
    throw new Error(
      `${d.compose.service}'s compose file (${d.compose.configFiles.join(", ")}) no longer exists, so the project was probably moved. Run \`docker compose up -d\` from its new location, then move it from here.`,
    );
  }
  return { command: containerLaunch(d, overridePath(profile)), env: profile.env, strategy: "compose" };
}

/** Proposed rewrite for moving `profile` to `port` (default: next free port). `server` is its running instance, if any. */
export async function previewMove(profile: Profile, server: Server | undefined, port?: number): Promise<MovePreview> {
  const target = port ?? (await suggestPort(profile.port ?? server?.port ?? 3000));
  if (!validPort(target)) throw new Error("Port must be 1–65535");
  const rw =
    dockerRewrite(profile) ??
    rewritePort(profile.command, profile.env, frameworkOf(profile, server), profile.port, target);
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

  const docker = dockerRewrite(profile);
  const rw = docker ?? rewritePort(profile.command, profile.env, frameworkOf(profile, server), profile.port, port);
  const restoreOverride = docker ? await writeOverride(profile, port) : async () => {};
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

  // `compose up -d` recreates the container itself; processes must be stopped first.
  if (!server.container) await stopServer(server.pid, server.port);
  try {
    const started = await startProfile(moved);
    return { profile: moved, oldPort: profile.port, newPort: port, started };
  } catch (e) {
    const reason = (e as Error).message;
    await restoreOverride();
    await saveProfile(profile);
    try {
      // A failed `compose up` may never have taken the old container down.
      if (!profile.port || (await isPortFree(profile.port))) await startProfile(profile);
    } catch (e2) {
      throw new Error(
        `Couldn't start on :${port} (${reason}); restarting on :${profile.port} also failed: ${(e2 as Error).message}`,
      );
    }
    throw new Error(`Couldn't start on :${port}, so it's back on :${profile.port}: ${reason}`);
  }
}

/** Write the compose override for `port`; returns a function that puts the previous one back. */
async function writeOverride(profile: Profile, port: number): Promise<() => Promise<void>> {
  const d = profile.docker!;
  const file = overridePath(profile);
  const previous = await readFile(file, "utf8").catch(() => undefined);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, composeOverride(d.compose!.service, d.hostIp, port, d.containerPort));
  return async () => {
    if (previous === undefined) await rm(file, { force: true });
    else await writeFile(file, previous);
  };
}
