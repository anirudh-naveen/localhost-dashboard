import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SYSTEM_DIRS = ["/usr/sbin", "/usr/bin", "/sbin", "/bin"];
const resolved = new Map<string, string>();

/** System tools by absolute path, since browsers launch the companion with a minimal PATH (lsof is in /usr/sbin). */
function resolve(cmd: string): string {
  if (cmd.startsWith("/")) return cmd;
  let path = resolved.get(cmd);
  if (!path) {
    path = SYSTEM_DIRS.map((d) => join(d, cmd)).find(existsSync) ?? cmd;
    resolved.set(cmd, path);
  }
  return path;
}

/**
 * Run a command and return stdout. A non-zero exit still resolves with
 * whatever was printed, since lsof exits 1 when nothing matches.
 */
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((ok, fail) => {
    execFile(
      resolve(cmd),
      args,
      { env: { ...process.env, LC_ALL: "C" }, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") fail(err);
        else ok(stdout);
      },
    );
  });
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Like `run`, but reports the exit code and stderr instead of hiding failures. */
export function runResult(cmd: string, args: string[], timeoutMs = 30_000): Promise<RunResult> {
  return new Promise((ok, fail) => {
    execFile(resolve(cmd), args, { maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") return fail(err);
      ok({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr });
    });
  });
}
