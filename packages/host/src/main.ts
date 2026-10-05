#!/usr/bin/env node
/** Native Messaging host: Chrome spawns this per connection and talks over stdio. */
import {
  deleteProfile,
  getProfile,
  listServers,
  startProfile,
  stopServer,
  syncProfiles,
  tailLog,
  upsertProfile,
} from "@ld/core";
import { PROTOCOL_VERSION, type HostEvent, type HostRequest, type HostResponse, type Snapshot } from "@ld/shared";
import { encode, FrameDecoder } from "./framing.js";

const POLL_MS = 2000;

function send(msg: HostResponse | HostEvent): void {
  process.stdout.write(encode(msg));
}

async function snapshot(): Promise<Snapshot> {
  const servers = await listServers();
  const profiles = await syncProfiles(servers);
  return { servers, profiles };
}

let subscribed = false;
let lastKey = "";

function key(s: Snapshot): string {
  return JSON.stringify([
    s.servers.map((x) => [x.pid, x.port, x.title, x.hidden, x.profileId]),
    s.profiles.map((p) => [p.id, p.name, p.command, p.cwd, p.port, p.pinned, p.autoCaptured, p.env]),
  ]);
}

/** Push a snapshot to a subscribed extension if it differs from the last one sent. */
async function push(force = false): Promise<void> {
  if (!subscribed) return;
  const snap = await snapshot();
  const k = key(snap);
  if (!force && k === lastKey) return;
  lastKey = k;
  send({ event: "snapshot", ...snap });
}

function startPolling(): void {
  if (subscribed) return;
  subscribed = true;
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await push();
    } catch (e) {
      console.error("poll failed:", e);
    } finally {
      busy = false;
    }
  }, POLL_MS);
}

async function handle(req: HostRequest): Promise<unknown> {
  switch (req.type) {
    case "ping":
      return { version: PROTOCOL_VERSION, platform: process.platform, node: process.version };
    case "list":
      return snapshot();
    case "subscribe": {
      startPolling();
      const snap = await snapshot();
      lastKey = key(snap);
      return snap;
    }
    case "stop":
      return stopServer(req.pid, req.port);
    case "start":
      return startProfile(await getProfile(req.profileId));
    case "profiles.upsert":
      return upsertProfile(req.profile);
    case "profiles.delete":
      await deleteProfile(req.profileId);
      return null;
    case "logs.tail":
      return tailLog(req.profileId);
    default:
      throw new Error(`unknown request type: ${(req as { type: string }).type}`);
  }
}

const MUTATING = new Set(["stop", "start", "profiles.upsert", "profiles.delete"]);

const decoder = new FrameDecoder();
process.stdin.on("data", (chunk: Buffer) => {
  for (const msg of decoder.push(chunk)) {
    const req = msg as HostRequest;
    handle(req)
      .then(
        (result) => send({ id: req.id, ok: true, result }),
        (e: unknown) => send({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }),
      )
      // Reflect changes immediately rather than on the next poll.
      .then(() => (MUTATING.has(req.type) ? push() : undefined))
      .catch((e) => console.error("push failed:", e));
  }
});
// Chrome closes stdin when the extension disconnects.
process.stdin.on("end", () => process.exit(0));
