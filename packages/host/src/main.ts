#!/usr/bin/env node
/** Native Messaging host: Chrome spawns this per connection and talks over stdio. */
import { listServers, stopServer } from "@ld/core";
import { PROTOCOL_VERSION, type HostEvent, type HostRequest, type HostResponse, type Server } from "@ld/shared";
import { encode, FrameDecoder } from "./framing.js";

const POLL_MS = 2000;

function send(msg: HostResponse | HostEvent): void {
  process.stdout.write(encode(msg));
}

async function handle(req: HostRequest): Promise<unknown> {
  switch (req.type) {
    case "ping":
      return { version: PROTOCOL_VERSION, platform: process.platform, node: process.version };
    case "list":
      return listServers();
    case "subscribe":
      startPolling();
      return listServers();
    case "stop":
      return stopServer(req.pid, req.port);
    default:
      throw new Error(`unknown request type: ${(req as { type: string }).type}`);
  }
}

let polling: NodeJS.Timeout | undefined;
let lastSnapshot = "";

function snapshot(servers: Server[]): string {
  return JSON.stringify(servers.map((s) => [s.pid, s.port, s.title, s.hidden]));
}

function startPolling(): void {
  if (polling) return;
  let busy = false;
  polling = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const servers = await listServers();
      const snap = snapshot(servers);
      if (snap !== lastSnapshot) {
        lastSnapshot = snap;
        send({ event: "servers.changed", servers });
      }
    } catch (e) {
      console.error("poll failed:", e);
    } finally {
      busy = false;
    }
  }, POLL_MS);
}

const decoder = new FrameDecoder();
process.stdin.on("data", (chunk: Buffer) => {
  for (const msg of decoder.push(chunk)) {
    const req = msg as HostRequest;
    handle(req).then(
      (result) => {
        if (req.type === "subscribe") lastSnapshot = snapshot(result as Server[]);
        send({ id: req.id, ok: true, result });
      },
      (e: unknown) => send({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
  }
});
// Chrome closes stdin when the extension disconnects.
process.stdin.on("end", () => process.exit(0));
