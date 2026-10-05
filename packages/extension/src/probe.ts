import type { Server } from "@ld/shared";

/** Ports dev tools default to; checked when the companion isn't installed. */
export const COMMON_PORTS = [
  3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010, 4000, 4200, 4321, 5000, 5001, 5173, 5174, 5175,
  5500, 6006, 8000, 8001, 8080, 8081, 8888, 9000,
];

async function probe(port: number): Promise<Server | null> {
  try {
    const res = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(700),
      redirect: "manual",
      cache: "no-store",
    });
    let title: string | undefined;
    if ((res.headers.get("content-type") ?? "").includes("html")) {
      const m = /<title[^>]*>([^<]*)<\/title>/i.exec((await res.text()).slice(0, 64 * 1024));
      title = m?.[1].trim() || undefined;
    }
    // Detect-only: no process info is available without the companion.
    return {
      port,
      address: "localhost",
      pid: 0,
      ppid: 0,
      pgid: 0,
      command: "",
      cmdline: "",
      user: "",
      framework: "unknown",
      title,
      hidden: false,
      launch: "",
      daemon: false,
    };
  } catch {
    return null;
  }
}

export async function probeServers(ports = COMMON_PORTS): Promise<Server[]> {
  const found = await Promise.all(ports.map(probe));
  return found.filter((s): s is Server => s !== null);
}
