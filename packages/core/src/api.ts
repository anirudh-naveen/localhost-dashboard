import type { HostMethods, Snapshot } from "@ld/shared";
import { stopServer } from "./control.js";
import { listServers } from "./discover/index.js";
import { stopContainer } from "./docker.js";
import { startProfile, tailLog } from "./launch.js";
import { moveProfile, previewMove } from "./move.js";
import { deleteProfile, getProfile, syncProfiles, upsertProfile } from "./profiles.js";

/** Running servers linked to (freshly synced) profiles. */
export async function snapshot(): Promise<Snapshot> {
  const servers = await listServers();
  const profiles = await syncProfiles(servers);
  return { servers, profiles };
}

/** Cheap identity of a snapshot, for "did anything change?" checks before pushing to a UI. */
export function snapshotKey(s: Snapshot): string {
  return JSON.stringify([
    s.servers.map((x) => [x.pid, x.port, x.title, x.hidden, x.profileId, x.container?.id]),
    s.profiles.map((p) => [p.id, p.name, p.command, p.cwd, p.port, p.pinned, p.autoCaptured, p.env]),
  ]);
}

/** A profile plus its running server, if any. */
async function withServer(profileId: string) {
  const snap = await snapshot();
  const profile = snap.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error(`No profile ${profileId}`);
  return { profile, server: snap.servers.find((s) => s.profileId === profileId) };
}

/** Methods any front end (extension companion, desktop app) can invoke. */
export type ActionMethod = Exclude<keyof HostMethods, "ping" | "list" | "subscribe">;

/** Actions that change servers or profiles; front ends refresh after them. */
export const MUTATING: ReadonlySet<ActionMethod> = new Set(["stop", "start", "move", "profiles.upsert", "profiles.delete"]);

export async function invoke<M extends ActionMethod>(
  method: M,
  params: HostMethods[M]["params"],
): Promise<HostMethods[M]["result"]>;
export async function invoke(method: ActionMethod, params: any): Promise<unknown> {
  switch (method) {
    case "stop":
      if (params.containerId) {
        await stopContainer(params.containerId, params.port);
        return { forced: false, pids: [] };
      }
      return stopServer(params.pid, params.port);
    case "start":
      return startProfile(await getProfile(params.profileId));
    case "move.preview": {
      const { profile, server } = await withServer(params.profileId);
      return previewMove(profile, server, params.port);
    }
    case "move": {
      const { profile, server } = await withServer(params.profileId);
      return moveProfile(profile, server, params.port, { command: params.command, env: params.env });
    }
    case "profiles.upsert":
      return upsertProfile(params.profile);
    case "profiles.delete":
      await deleteProfile(params.profileId);
      return null;
    case "logs.tail":
      return tailLog(params.profileId);
    default:
      throw new Error(`unknown method: ${method as string}`);
  }
}
