import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@ld/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProfiles, syncProfiles, upsertProfile } from "../src/profiles.js";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ld-store-"));
  process.env.LD_STATE_DIR = dir;
});
afterAll(() => {
  delete process.env.LD_STATE_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const server = (port: number, cwd: string): Server => ({
  port,
  address: "127.0.0.1",
  pid: 1000 + port,
  ppid: 50,
  pgid: 50,
  command: "node",
  cmdline: "node server.js",
  cwd,
  user: "dev",
  framework: "unknown",
  hidden: false,
  launch: "npm start",
  daemon: false,
});

describe("profile store", () => {
  it("doesn't lose an edit made while a poll is syncing", async () => {
    const [mine] = await Promise.all([
      upsertProfile({ name: "mine", command: "make serve", cwd: "/srv/mine", env: {}, port: 9000, pinned: true }),
      syncProfiles([server(3000, "/srv/app")]),
      syncProfiles([server(3001, "/srv/other")]),
    ]);
    const names = (await loadProfiles()).map((p) => p.name).sort();
    expect(names).toEqual(["app", "mine", "other"]);
    expect(mine.autoCaptured).toBe(false);
  });

  it("links a running server to a port-less profile with the same folder and command", async () => {
    const p = await upsertProfile({ name: "portless", command: "npm start", cwd: "/srv/pl", env: {}, pinned: false });
    const s = server(4000, "/srv/pl");
    const profiles = await syncProfiles([s]);
    expect(s.profileId).toBe(p.id);
    expect(profiles.filter((x) => x.cwd === "/srv/pl")).toHaveLength(1);
  });
});
