import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ComposeInfo, ContainerInfo } from "@ld/shared";
import { runResult } from "./exec.js";
import { loginPath } from "./launch.js";
import { isPortFree } from "./ports.js";
import { shellQuote } from "./shell.js";

export interface PortMapping {
  hostIp: string;
  hostPort: number;
  containerPort: number;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  ports: PortMapping[];
  compose?: ComposeInfo;
}

const CACHE_MS = 1500;
/** After docker is missing or its daemon is down, don't retry on every poll. */
const BACKOFF_MS = 30_000;

/** Parse `docker ps` Ports, e.g. `0.0.0.0:5432->5432/tcp, :::5432->5432/tcp, 127.0.0.1:8000-8001->80-81/tcp, 6379/tcp`. */
export function parsePorts(text: string): PortMapping[] {
  const out = new Map<number, PortMapping>();
  for (const entry of text.split(/,\s*/)) {
    const m = /^(.*):(\d+)(?:-(\d+))?->(\d+)(?:-(\d+))?\/tcp$/.exec(entry.trim());
    if (!m) continue; // unpublished (`6379/tcp`) or udp
    const [, hostIp, hFrom, hTo, cFrom] = m;
    for (let i = 0; i <= Number(hTo ?? hFrom) - Number(hFrom); i++) {
      const hostPort = Number(hFrom) + i;
      // v4 and v6 entries for the same port are one mapping; keep the first (v4).
      if (!out.has(hostPort)) out.set(hostPort, { hostIp, hostPort, containerPort: Number(cFrom) + i });
    }
  }
  return [...out.values()];
}

const FORMAT = [
  "{{.ID}}",
  "{{.Names}}",
  "{{.Image}}",
  "{{.Ports}}",
  '{{.Label "com.docker.compose.project"}}',
  '{{.Label "com.docker.compose.service"}}',
  '{{.Label "com.docker.compose.project.working_dir"}}',
  '{{.Label "com.docker.compose.project.config_files"}}',
].join("\t");

export function parseDockerPs(text: string): Container[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name, image, ports, project, service, workingDir, configFiles] = line.split("\t");
      return {
        id,
        name,
        image,
        ports: parsePorts(ports ?? ""),
        compose:
          project && service
            ? { project, service, workingDir, configFiles: (configFiles ?? "").split(",").filter(Boolean) }
            : undefined,
      };
    });
}

let binPromise: Promise<string | undefined> | undefined;

/** Locate the docker CLI; the companion's own PATH usually lacks /usr/local/bin. */
export function dockerBin(): Promise<string | undefined> {
  binPromise ??= loginPath().then((path) =>
    [...path.split(":"), "/usr/local/bin", "/opt/homebrew/bin", join(homedir(), ".docker/bin"), "/usr/bin"]
      .map((d) => join(d, "docker"))
      .find(existsSync),
  );
  return binPromise;
}

let cache: { at: number; containers: Container[] } | undefined;
let unavailableUntil = 0;

/** Running containers with published TCP ports. Empty when docker isn't installed or running. */
export async function listContainers(): Promise<Container[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.containers;
  if (now < unavailableUntil) return [];
  const bin = await dockerBin();
  if (!bin) {
    unavailableUntil = now + BACKOFF_MS;
    return [];
  }
  const r = await runResult(bin, ["ps", "--no-trunc", "--format", FORMAT], 5000);
  if (r.code !== 0) {
    unavailableUntil = now + BACKOFF_MS;
    return [];
  }
  cache = { at: now, containers: parseDockerPs(r.stdout) };
  return cache.containers;
}

/** The command that brings this container back: `compose up -d` for a service, `docker start` otherwise. */
export function containerLaunch(c: { name: string; compose?: ComposeInfo }, overrideFile?: string): string {
  if (!c.compose) return shellQuote(["docker", "start", c.name]);
  const files = [...c.compose.configFiles, ...(overrideFile ? [overrideFile] : [])].flatMap((f) => ["-f", f]);
  return shellQuote(["docker", "compose", "-p", c.compose.project, ...files, "up", "-d", c.compose.service]);
}

/** Where a container profile runs its command from. */
export function containerCwd(c: { compose?: ComposeInfo }): string {
  return c.compose?.workingDir && existsSync(c.compose.workingDir) ? c.compose.workingDir : homedir();
}

export function toContainerInfo(c: Container, m: PortMapping): ContainerInfo {
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    containerPort: m.containerPort,
    hostIp: m.hostIp,
    compose: c.compose,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `docker stop` the container publishing `port`, then wait for the port to free up. */
export async function stopContainer(id: string, port: number): Promise<void> {
  const bin = await dockerBin();
  if (!bin) throw new Error("docker CLI not found");
  cache = undefined;
  const r = await runResult(bin, ["stop", id], 30_000);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `docker stop exited with ${r.code}`);
  for (let i = 0; i < 20 && !(await isPortFree(port)); i++) await sleep(250);
}

/** Compose override that re-publishes one service on `port` (`!override` needs Compose ≥ 2.24.4). */
export function composeOverride(service: string, hostIp: string, port: number, containerPort: number): string {
  const ip = hostIp && hostIp !== "0.0.0.0" && hostIp !== "::" ? `${hostIp}:` : "";
  return [
    `# Written by Localhost Dashboard to move ${service} to :${port}. Delete to restore the compose file's ports.`,
    "services:",
    `  ${JSON.stringify(service)}:`,
    "    ports: !override",
    `      - ${JSON.stringify(`${ip}${port}:${containerPort}`)}`,
    "",
  ].join("\n");
}

export function invalidateContainers(): void {
  cache = undefined;
}
