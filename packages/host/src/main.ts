#!/usr/bin/env node
/** Native Messaging host: Chrome spawns this per connection and talks over stdio. */
import { invoke, MUTATING, snapshot, snapshotKey as key, type ActionMethod } from "@ld/core";
import { PROTOCOL_VERSION, type HostEvent, type HostRequest, type HostResponse } from "@ld/shared";
import { encode, FrameDecoder } from "./framing.js";

const POLL_MS = 2000;

function send(msg: HostResponse | HostEvent): void {
  process.stdout.write(encode(msg));
}

let subscribed = false;
let lastKey = "";

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
    default: {
      const { id: _, type, ...params } = req;
      return invoke(type as ActionMethod, params as never);
    }
  }
}

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
      .then(() => (MUTATING.has(req.type as ActionMethod) ? push() : undefined))
      .catch((e) => console.error("push failed:", e));
  }
});
// Chrome closes stdin when the extension disconnects.
process.stdin.on("end", () => process.exit(0));
