export interface Listener {
  pid: number;
  command: string;
  user: string;
  address: string;
  port: number;
}

/** Parse `lsof -nP -iTCP -sTCP:LISTEN -F pcLn`. */
export function parseLsofListen(text: string): Listener[] {
  const out: Listener[] = [];
  let pid = 0;
  let command = "";
  let user = "";
  for (const line of text.split("\n")) {
    const tag = line[0];
    const val = line.slice(1);
    if (tag === "p") pid = Number(val);
    else if (tag === "c") command = val;
    else if (tag === "L") user = val;
    else if (tag === "n") {
      const i = val.lastIndexOf(":");
      if (i < 0) continue;
      const port = Number(val.slice(i + 1));
      if (!Number.isInteger(port)) continue;
      out.push({ pid, command, user, address: val.slice(0, i), port });
    }
  }
  return out;
}

export interface ProcInfo {
  pid: number;
  ppid: number;
  pgid: number;
  startedAt?: number;
  cmdline: string;
}

/** Parse `ps -o pid=,ppid=,pgid=,lstart=,command=` (lstart is 5 tokens, e.g. `Sun Oct  4 17:59:29 2026`). */
export function parsePs(text: string): Map<number, ProcInfo> {
  const out = new Map<number, ProcInfo>();
  const re = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/;
  for (const line of text.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    const startedAt = Date.parse(m[4]);
    out.set(Number(m[1]), {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      startedAt: Number.isNaN(startedAt) ? undefined : startedAt,
      cmdline: m[5].trim(),
    });
  }
  return out;
}

/** Parse `lsof -a -d cwd -p <pids> -Fn` into pid → cwd. */
export function parseLsofCwd(text: string): Map<number, string> {
  const out = new Map<number, string>();
  let pid = 0;
  for (const line of text.split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n" && pid) out.set(pid, line.slice(1));
  }
  return out;
}

/** Parse `ps -Ao pid=,ppid=,command=`. */
export function parsePsTree(text: string): Map<number, { ppid: number; cmdline: string }> {
  const out = new Map<number, { ppid: number; cmdline: string }>();
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) out.set(Number(m[1]), { ppid: Number(m[2]), cmdline: m[3] });
  }
  return out;
}
