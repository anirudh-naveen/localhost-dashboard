import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { invoke, MUTATING, stateDir, type ActionMethod } from "@ld/core";
import { DESKTOP_API_PORT, type Snapshot } from "@ld/shared";

/**
 * Loopback API for browser extensions. Safari can't use a stdio companion, so its
 * extension talks to the desktop app here; Chrome/Firefox fall back to it too.
 *
 * Who may call it:
 * - Only browser-extension origins. Browsers set Origin and pages can't forge it, so a
 *   website fetching localhost is rejected. (Local processes could forge it, but they
 *   can already inspect and kill the user's processes directly.)
 * - Each extension origin is approved once by the user, then remembered.
 * - Host must be our loopback address, defeating DNS rebinding.
 */

const EXTENSION_ORIGIN = /^(safari-web-extension|chrome-extension|moz-extension):\/\/[\w.-]+$/;
const ALLOWED_HOSTS = new Set([`127.0.0.1:${DESKTOP_API_PORT}`, `localhost:${DESKTOP_API_PORT}`]);
const MAX_BODY = 1024 * 1024;
const ACTIONS = new Set<ActionMethod>(["stop", "start", "move.preview", "move", "profiles.upsert", "profiles.delete", "logs.tail"]);

export interface ApiOptions {
  /** Current snapshot (the app's cached one when fresh). */
  snapshot(): Promise<Snapshot>;
  /** Ask the user whether `origin` may control servers. */
  approve(origin: string): Promise<boolean>;
  /** Called after a mutating action so the app's own windows refresh. */
  onMutate(): void;
}

const clientsFile = () => join(stateDir(), "desktop-clients.json");

async function loadApproved(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse(await readFile(clientsFile(), "utf8")).approved);
  } catch {
    return new Set();
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function startApi(opts: ApiOptions): Promise<Server | undefined> {
  const approved = await loadApproved();
  const pending = new Map<string, Promise<boolean>>();

  async function isApproved(origin: string): Promise<boolean> {
    if (approved.has(origin)) return true;
    // One prompt per origin even if the extension fires several requests meanwhile.
    let p = pending.get(origin);
    if (!p) {
      p = opts.approve(origin).then(async (ok) => {
        pending.delete(origin);
        if (ok) {
          approved.add(origin);
          await mkdir(dirname(clientsFile()), { recursive: true });
          await writeFile(clientsFile(), JSON.stringify({ approved: [...approved] }, null, 2) + "\n");
        }
        return ok;
      });
      pending.set(origin, p);
    }
    return p;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin ?? "";
    const json = (status: number, body: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json",
        ...(EXTENSION_ORIGIN.test(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
      });
      res.end(JSON.stringify(body));
    };

    if (!ALLOWED_HOSTS.has(req.headers.host ?? "")) return json(421, { error: "wrong host" });
    if (!EXTENSION_ORIGIN.test(origin)) return json(403, { error: "only browser extensions may connect" });

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      return res.end();
    }

    if (!(await isApproved(origin))) return json(403, { error: "Not allowed in the Localhost Dashboard app" });

    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/v1/snapshot") return json(200, await opts.snapshot());

    if (req.method === "POST" && url.pathname === "/v1/invoke") {
      let call: { method: ActionMethod; params: unknown };
      try {
        call = JSON.parse(await readBody(req));
      } catch {
        return json(400, { error: "bad request" });
      }
      if (!ACTIONS.has(call.method)) return json(400, { error: `unknown method: ${String(call.method)}` });
      try {
        const result = await invoke(call.method, call.params as never);
        if (MUTATING.has(call.method)) opts.onMutate();
        return json(200, { result });
      } catch (e) {
        return json(200, { error: (e as Error).message });
      }
    }
    return json(404, { error: "not found" });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    });
  });
  return new Promise((resolve) => {
    server.once("error", (e) => {
      // Another instance (or something else) has the port: run without the API.
      console.warn(`extension API disabled: ${(e as Error).message}`);
      resolve(undefined);
    });
    server.listen(DESKTOP_API_PORT, "127.0.0.1", () => resolve(server));
  });
}
