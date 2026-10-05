import type { Profile, Server } from "@ld/shared";
import { describe, expect, it } from "vitest";
import { reconcile } from "../src/profiles.js";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function server(over: Partial<Server> = {}): Server {
  return {
    port: 5173,
    address: "127.0.0.1",
    pid: 100,
    ppid: 50,
    pgid: 50,
    command: "node",
    cmdline: "node /app/node_modules/.bin/vite",
    cwd: "/Users/dev/app",
    user: "dev",
    framework: "vite",
    hidden: false,
    launch: "npm run dev",
    daemon: false,
    ...over,
  };
}

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    name: "app",
    command: "npm run dev",
    cwd: "/Users/dev/app",
    env: {},
    port: 5173,
    autoCaptured: true,
    pinned: false,
    createdAt: NOW - DAY,
    lastSeen: NOW - DAY,
    ...over,
  };
}

describe("reconcile", () => {
  it("captures a new server as an auto profile and links it", () => {
    const s = server();
    const { profiles, changed } = reconcile([], [s], NOW);
    expect(changed).toBe(true);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      name: "app",
      command: "npm run dev",
      cwd: "/Users/dev/app",
      port: 5173,
      autoCaptured: true,
      lastSeen: NOW,
    });
    expect(s.profileId).toBe(profiles[0].id);
  });

  it("disambiguates names for a second server in the same folder", () => {
    const { profiles } = reconcile([profile()], [server(), server({ port: 5174, pid: 101 })], NOW);
    expect(profiles.map((p) => p.name)).toEqual(["app", "app :5174"]);
  });

  it("skips hidden, docker, daemon and cwd-less servers", () => {
    const servers = [
      server({ hidden: true }),
      server({ framework: "docker", port: 5432 }),
      server({ daemon: true, port: 27017 }),
      server({ cwd: undefined, port: 8000 }),
      server({ cwd: "/", port: 8001 }),
    ];
    expect(reconcile([], servers, NOW).profiles).toEqual([]);
  });

  it("still links a daemonized server to an existing profile (e.g. one we started)", () => {
    const s = server({ daemon: true, launch: "/bin/zsh -c npm run dev" });
    const { profiles } = reconcile([profile()], [s], NOW);
    expect(s.profileId).toBe("p1");
    // A detached launcher's cmdline isn't what the user typed; keep the original.
    expect(profiles[0].command).toBe("npm run dev");
  });

  it("refreshes auto-captured commands but never user-owned ones", () => {
    const s = server({ launch: "pnpm dev" });
    expect(reconcile([profile()], [s], NOW).profiles[0].command).toBe("pnpm dev");
    expect(reconcile([profile({ autoCaptured: false })], [s], NOW).profiles[0].command).toBe("npm run dev");
  });

  it("only bumps lastSeen once a minute", () => {
    const { changed } = reconcile([profile({ lastSeen: NOW - 10_000 })], [server()], NOW);
    expect(changed).toBe(false);
  });

  it("prunes stale unpinned auto profiles only", () => {
    const old = NOW - 30 * DAY;
    const { profiles, changed } = reconcile(
      [
        profile({ id: "stale", lastSeen: old }),
        profile({ id: "pinned", lastSeen: old, pinned: true, port: 1 }),
        profile({ id: "mine", lastSeen: old, autoCaptured: false, port: 2 }),
      ],
      [],
      NOW,
    );
    expect(changed).toBe(true);
    expect(profiles.map((p) => p.id)).toEqual(["pinned", "mine"]);
  });
});
