import { execFile } from "node:child_process";

/**
 * Run a command and return stdout. A non-zero exit still resolves with
 * whatever was printed, since lsof exits 1 when nothing matches.
 */
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { env: { ...process.env, LC_ALL: "C" }, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") reject(err);
        else resolve(stdout);
      },
    );
  });
}
