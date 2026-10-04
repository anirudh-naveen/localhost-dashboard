import type { Server } from "@ld/shared";
import { run } from "../exec.js";
import { detectFramework, isHidden, isLocalBind } from "./classify.js";
import { parseLsofCwd, parseLsofListen, parsePs } from "./parse.js";
import { fetchTitle, pruneTitleCache } from "./title.js";

export interface ListOptions {
  /** Fetch page titles for visible servers. Default true. */
  titles?: boolean;
}

/** List TCP listeners reachable via localhost, enriched with process info. Uses lsof, so macOS and most Linux. */
export async function listServers({ titles = true }: ListOptions = {}): Promise<Server[]> {
  const listeners = parseLsofListen(await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcLn"]));

  // One entry per pid:port; v4 and v6 binds of the same socket collapse, preferring v4.
  const byKey = new Map<string, (typeof listeners)[number]>();
  for (const l of listeners) {
    if (!isLocalBind(l.address)) continue;
    const key = `${l.pid}:${l.port}`;
    const prev = byKey.get(key);
    if (!prev || (prev.address.startsWith("[") && !l.address.startsWith("["))) byKey.set(key, l);
  }
  if (byKey.size === 0) return [];

  const pids = [...new Set([...byKey.values()].map((l) => l.pid))].join(",");
  const [psOut, cwdOut] = await Promise.all([
    run("ps", ["-o", "pid=,ppid=,pgid=,lstart=,command=", "-p", pids]),
    run("lsof", ["-a", "-d", "cwd", "-p", pids, "-Fn"]),
  ]);
  const procs = parsePs(psOut);
  const cwds = parseLsofCwd(cwdOut);

  const servers: Server[] = [...byKey.values()].map((l) => {
    const proc = procs.get(l.pid);
    const cmdline = proc?.cmdline ?? l.command;
    const framework = detectFramework(`${l.command} ${cmdline}`);
    return {
      port: l.port,
      address: l.address,
      pid: l.pid,
      ppid: proc?.ppid ?? 0,
      pgid: proc?.pgid ?? 0,
      command: l.command,
      cmdline,
      cwd: cwds.get(l.pid),
      user: l.user,
      startedAt: proc?.startedAt,
      framework,
      hidden: isHidden(l.command, cmdline, l.port, framework),
    };
  });

  if (titles) {
    pruneTitleCache(new Set(servers.map((s) => `${s.pid}:${s.port}`)));
    await Promise.all(
      servers
        .filter((s) => !s.hidden)
        .map(async (s) => {
          s.title = await fetchTitle(s.pid, s.port, s.address);
        }),
    );
  }

  return servers.sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.port - b.port);
}
