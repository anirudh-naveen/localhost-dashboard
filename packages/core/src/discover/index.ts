import type { Server } from "@ld/shared";
import { stopTargets } from "../control.js";
import { containerCwd, containerLaunch, listContainers, toContainerInfo } from "../docker.js";
import { detectFramework, DOCKER_PROCESS, isHidden, isLocalBind } from "./classify.js";
import { platform } from "./platform.js";
import { fetchTitle, pruneTitleCache } from "./title.js";

export interface ListOptions {
  /** Fetch page titles for visible servers. Default true. */
  titles?: boolean;
}

/** List TCP listeners reachable via localhost, enriched with process info. */
export async function listServers({ titles = true }: ListOptions = {}): Promise<Server[]> {
  const os = platform();
  const [listeners, procs] = await Promise.all([os.listeners(), os.processes()]);

  // One entry per pid:port; v4 and v6 binds of the same socket collapse, preferring v4.
  const byKey = new Map<string, (typeof listeners)[number]>();
  for (const l of listeners) {
    if (!isLocalBind(l.address)) continue;
    const key = `${l.pid}:${l.port}`;
    const prev = byKey.get(key);
    if (!prev || (prev.address.startsWith("[") && !l.address.startsWith("["))) byKey.set(key, l);
  }
  // Forked workers inherit their parent's listening socket (nginx, gunicorn, …); show only the parent.
  for (const [key, l] of byKey) {
    for (let a = procs.get(l.pid)?.ppid; a && a > 1; a = procs.get(a)?.ppid) {
      if (byKey.has(`${a}:${l.port}`)) {
        byKey.delete(key);
        break;
      }
    }
  }
  if (byKey.size === 0) return [];

  const listenerPids = [...new Set(listeners.map((l) => l.pid))];
  const cwds = await os.cwds([...new Set([...byKey.values()].map((l) => l.pid))]);

  const servers: Server[] = [...byKey.values()].map((l) => {
    const proc = procs.get(l.pid);
    const cmdline = proc?.cmdline ?? l.command;
    const framework = detectFramework(`${l.command} ${cmdline}`);
    const top = procs.get(stopTargets(l.pid, procs, listenerPids).at(-1)!);
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
      launch: top?.cmdline ?? cmdline,
      daemon: (top?.ppid ?? 1) <= 1,
    };
  });

  // Docker Desktop (com.docker.backend) or docker-proxy owns published ports; on Linux with the
  // userland proxy disabled there's no listener at all, so always ask docker there.
  if (process.platform === "linux" || listeners.some((l) => DOCKER_PROCESS.test(l.command))) {
    await attachContainers(servers);
  }

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

/** Label servers with the container publishing their port, adding entries for ports with no host listener. */
async function attachContainers(servers: Server[]): Promise<void> {
  for (const c of await listContainers()) {
    for (const m of c.ports) {
      let s = servers.find((x) => x.port === m.hostPort);
      if (!s) {
        s = {
          port: m.hostPort,
          address: m.hostIp === "0.0.0.0" || m.hostIp === "::" ? "*" : m.hostIp,
          pid: 0,
          ppid: 0,
          pgid: 0,
          command: "docker",
          cmdline: c.image,
          user: "",
          framework: "docker",
          hidden: false,
          launch: "",
          daemon: false,
        };
        servers.push(s);
      }
      Object.assign(s, {
        container: toContainerInfo(c, m),
        framework: "docker",
        hidden: false,
        daemon: false,
        launch: containerLaunch(c),
        cwd: containerCwd(c),
      });
    }
  }
}
