import { readFile, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import { shellQuote } from "../shell.js";
import type { Listener, ProcInfo } from "./parse.js";
import type { Platform } from "./platform.js";

/** Linux USER_HZ; 100 on every mainstream architecture. */
const CLK_TCK = 100;
const LISTEN = "0A";

export interface ProcSocket {
  address: string;
  port: number;
  uid: number;
  inode: number;
}

function v4(hex: string): string {
  // /proc/net/tcp stores IPv4 in host byte order (little-endian on x86/arm).
  const b = hex.match(/../g)!.map((h) => parseInt(h, 16)).reverse();
  const ip = b.join(".");
  return ip === "0.0.0.0" ? "*" : ip;
}

function v6(hex: string): string {
  // Four 32-bit words, each in host byte order.
  const bytes = hex.match(/.{8}/g)!.flatMap((w) => w.match(/../g)!.map((h) => parseInt(h, 16)).reverse());
  if (bytes.every((x) => x === 0)) return "[::]";
  if (bytes.slice(0, 15).every((x) => x === 0) && bytes[15] === 1) return "[::1]";
  // IPv4-mapped (::ffff:a.b.c.d)
  if (bytes.slice(0, 10).every((x) => x === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    const ip = bytes.slice(12).join(".");
    return ip === "0.0.0.0" ? "*" : ip;
  }
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return `[${groups.join(":")}]`;
}

/** Listening sockets from /proc/net/tcp or tcp6. */
export function parseProcNetTcp(text: string, ipv6: boolean): ProcSocket[] {
  const out: ProcSocket[] = [];
  for (const line of text.split("\n").slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10 || f[3] !== LISTEN) continue;
    const [addr, port] = f[1].split(":");
    out.push({
      address: ipv6 ? v6(addr) : v4(addr),
      port: parseInt(port, 16),
      uid: Number(f[7]),
      inode: Number(f[9]),
    });
  }
  return out;
}

/** /proc/<pid>/stat. The comm field may contain spaces and parens, so split after the last ')'. */
export function parseStat(text: string): { comm: string; ppid: number; pgid: number; starttime: number } | undefined {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open < 0 || close < 0) return undefined;
  const f = text.slice(close + 2).split(" ");
  return { comm: text.slice(open + 1, close), ppid: Number(f[1]), pgid: Number(f[2]), starttime: Number(f[19]) };
}

export function parsePasswd(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of text.split("\n")) {
    const f = line.split(":");
    if (f.length > 2) out.set(Number(f[2]), f[0]);
  }
  return out;
}

const read = (p: string) => readFile(p, "utf8").catch(() => undefined);

async function pids(root: string): Promise<number[]> {
  return (await readdir(root)).filter((d) => /^\d+$/.test(d)).map(Number);
}

/** Linux via /proc only: no lsof/ss/ps needed (minimal images and containers lack them). */
export function linuxPlatform(root = "/proc", passwdPath = "/etc/passwd"): Platform {
  let users: Map<number, string> | undefined;
  let btime: number | undefined;

  async function bootTime(): Promise<number> {
    if (btime === undefined) btime = Number(/^btime (\d+)/m.exec((await read(join(root, "stat"))) ?? "")?.[1] ?? 0);
    return btime;
  }

  return {
    async listeners() {
      const sockets = [
        ...parseProcNetTcp((await read(join(root, "net/tcp"))) ?? "", false),
        ...parseProcNetTcp((await read(join(root, "net/tcp6"))) ?? "", true),
      ];
      if (sockets.length === 0) return [];
      users ??= parsePasswd((await read(passwdPath)) ?? "");
      const byInode = new Map(sockets.map((s) => [s.inode, s]));

      // Attribute sockets to processes via their fd symlinks (`socket:[inode]`). Other users'
      // processes are unreadable without root, just as lsof can't see them.
      const out: Listener[] = [];
      await Promise.all(
        (await pids(root)).map(async (pid) => {
          const fdDir = join(root, String(pid), "fd");
          const fds = await readdir(fdDir).catch(() => [] as string[]);
          let comm: string | undefined;
          for (const fd of fds) {
            const link = await readlink(join(fdDir, fd)).catch(() => "");
            const m = /^socket:\[(\d+)\]$/.exec(link);
            const s = m && byInode.get(Number(m[1]));
            if (!s) continue;
            comm ??= ((await read(join(root, String(pid), "comm"))) ?? "").trim();
            out.push({ pid, command: comm, user: users!.get(s.uid) ?? String(s.uid), address: s.address, port: s.port });
          }
        }),
      );
      return out;
    },

    async processes() {
      const boot = await bootTime();
      const out = new Map<number, ProcInfo>();
      await Promise.all(
        (await pids(root)).map(async (pid) => {
          const [statText, argv] = await Promise.all([
            read(join(root, String(pid), "stat")),
            read(join(root, String(pid), "cmdline")),
          ]);
          const stat = statText && parseStat(statText);
          if (!stat) return; // exited mid-scan
          const args = (argv ?? "").split("\0").filter((a, i, all) => a !== "" || i < all.length - 1);
          out.set(pid, {
            pid,
            ppid: stat.ppid,
            pgid: stat.pgid,
            startedAt: boot ? (boot + stat.starttime / CLK_TCK) * 1000 : undefined,
            // Rebuilt from exact argv (unlike `ps`), so paths with spaces stay runnable. Kernel threads have none.
            cmdline: args.length ? shellQuote(args) : `[${stat.comm}]`,
          });
        }),
      );
      return out;
    },

    async cwds(list) {
      const out = new Map<number, string>();
      await Promise.all(
        list.map(async (pid) => {
          const cwd = await readlink(join(root, String(pid), "cwd")).catch(() => undefined);
          if (cwd) out.set(pid, cwd);
        }),
      );
      return out;
    },
  };
}
