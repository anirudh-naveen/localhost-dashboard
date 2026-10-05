import { createServer } from "node:net";

/**
 * Whether `port` can be bound. A real bind catches listeners lsof can't see
 * (other users' and root processes) as well as our own.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    // No host: binds the IPv6 wildcard dual-stack, so it collides with v4 and v6 listeners.
    srv.listen({ port, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

/** First free port after `from`. */
export async function suggestPort(from: number): Promise<number> {
  for (let p = from + 1; p < Math.min(from + 100, 65536); p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free port near ${from}`);
}

export function validPort(port: unknown): port is number {
  return Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536;
}
