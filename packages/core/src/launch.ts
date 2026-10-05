import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, openSync, statSync, writeSync } from "node:fs";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { Profile, StartResult } from "@ld/shared";
import { listeningPids } from "./control.js";
import { logFile } from "./paths.js";
import { isPortFree } from "./ports.js";

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const TAIL_BYTES = 64 * 1024;
const LISTEN_TIMEOUT_MS = 30_000;

const shell = () => process.env.SHELL || "/bin/sh";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let pathPromise: Promise<string> | undefined;

/**
 * PATH from the user's interactive login shell. Browsers launch the companion
 * with a bare environment, so without this `npm`, nvm's node, etc. aren't found.
 */
export function loginPath(): Promise<string> {
  pathPromise ??= new Promise((resolve) => {
    const fallback = [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
      .filter(Boolean)
      .join(":");
    execFile(shell(), ["-ilc", 'printf "__LD__%s__LD__" "$PATH"'], { timeout: 5000 }, (_err, stdout) => {
      resolve(/__LD__(.*?)__LD__/s.exec(stdout ?? "")?.[1] || fallback);
    });
  });
  return pathPromise;
}

async function rotate(file: string): Promise<void> {
  if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) await rename(file, `${file}.1`);
}

/**
 * Start a profile detached from the companion (it survives the browser closing),
 * appending output to its log, and wait for its port to start listening.
 */
export async function startProfile(profile: Profile): Promise<StartResult> {
  if (!existsSync(profile.cwd)) throw new Error(`Directory not found: ${profile.cwd}`);
  if (profile.port && !(await isPortFree(profile.port))) {
    const pids = await listeningPids(profile.port);
    throw new Error(
      `:${profile.port} is already in use${pids.length ? ` by pid ${pids.join(", ")}` : " by another user's process"}`,
    );
  }

  const log = logFile(profile.id);
  await mkdir(dirname(log), { recursive: true });
  await rotate(log);
  const fd = openSync(log, "a");
  writeSync(fd, `\n=== ${new Date().toISOString()} $ ${profile.command}\n`);

  const child = spawn(shell(), ["-c", profile.command], {
    cwd: profile.cwd,
    env: { ...process.env, PATH: await loginPath(), ...profile.env },
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  child.unref();

  const pid = child.pid;
  if (pid === undefined) throw new Error("Failed to spawn");

  let exit: number | null | undefined;
  child.on("exit", (code, sig) => (exit = code ?? (sig ? 128 : 1)));

  const deadline = Date.now() + (profile.port ? LISTEN_TIMEOUT_MS : 1000);
  while (Date.now() < deadline) {
    await sleep(250);
    // A clean exit may just mean the command backgrounded itself (`… &`, `compose up -d`); keep waiting for the port.
    if (exit !== undefined && (exit !== 0 || !profile.port)) {
      if (exit === 0) return { pid, listening: false };
      const { text } = await tailLog(profile.id);
      // Only this run's output: everything after the last header line.
      const run = text.slice(text.lastIndexOf("\n=== ") + 1).split("\n").slice(1);
      const lastLines = run.join("\n").trim().split("\n").slice(-15).join("\n");
      throw new Error(`Exited with code ${exit}${lastLines ? `\n${lastLines}` : ""}`);
    }
    if (profile.port && (await listeningPids(profile.port)).length) return { pid, listening: true };
  }
  if (exit === 0) throw new Error(`Exited without anything listening on :${profile.port}`);
  return { pid, listening: false };
}

export async function tailLog(profileId: string): Promise<{ text: string; path: string }> {
  const path = logFile(profileId);
  let fh;
  try {
    fh = await open(path, "r");
  } catch {
    return { text: "", path };
  }
  try {
    const { size } = await fh.stat();
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    let text = buf.toString("utf8");
    // Drop the partial first line when we started mid-file.
    if (size > len) text = text.slice(text.indexOf("\n") + 1);
    return { text, path };
  } finally {
    await fh.close();
  }
}
