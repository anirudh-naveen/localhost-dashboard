import type { StopResult } from "@ld/shared";
import { run } from "./exec.js";
import { parsePsTree } from "./discover/parse.js";

/** Launchers that just wrap the real server; stopping only the child would leave them (or let them respawn it). */
const WRAPPER = /\b(npm|pnpm|yarn|npx|bunx|turbo|nodemon|concurrently)\b|npm-cli\.js|yarn\.c?js|pnpm\.c?js/;
/** `sh -c <script>` shims that package managers put between themselves and the server. */
const SHELL_SHIM = /^(\/bin\/)?(sh|bash|zsh) -c /;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function listeningPids(port: number): Promise<number[]> {
  const out = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return out.split("\n").filter(Boolean).map(Number);
}

/** The server pid plus any wrapper ancestors (`npm run dev` → `node vite`). */
export function stopTargets(pid: number, tree: Map<number, { ppid: number; cmdline: string }>): number[] {
  const targets = [pid];
  let shims: number[] = [];
  let cur = tree.get(pid)?.ppid;
  while (cur && cur > 1 && cur !== process.pid) {
    const node = tree.get(cur);
    if (!node) break;
    if (SHELL_SHIM.test(node.cmdline)) {
      // Only include a shim if a wrapper turns up above it.
      shims.push(cur);
    } else if (WRAPPER.test(node.cmdline)) {
      targets.push(...shims, cur);
      shims = [];
    } else break;
    cur = node.ppid;
  }
  return targets;
}

function signal(pids: number[], sig: NodeJS.Signals): void {
  for (const p of pids) {
    try {
      process.kill(p, sig);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
  }
}

/**
 * Stop the server listening on `port` with `pid`. Sends SIGTERM to it and its
 * wrapper parents, escalating to SIGKILL after `timeoutMs`.
 */
export async function stopServer(pid: number, port: number, timeoutMs = 3000): Promise<StopResult> {
  if (pid <= 1 || pid === process.pid) throw new Error(`Refusing to stop pid ${pid}`);
  // Guard against pid reuse: the pid must still own the port.
  if (!(await listeningPids(port)).includes(pid)) {
    throw new Error(`pid ${pid} is no longer listening on :${port}`);
  }

  const targets = stopTargets(pid, parsePsTree(await run("ps", ["-Ao", "pid=,ppid=,command="])));
  signal(targets, "SIGTERM");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return { forced: false, pids: targets };
    await sleep(100);
  }

  signal(targets.filter(isAlive), "SIGKILL");
  await sleep(200);
  if (isAlive(pid)) throw new Error(`pid ${pid} survived SIGKILL`);
  return { forced: true, pids: targets };
}
