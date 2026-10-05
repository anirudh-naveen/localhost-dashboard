import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linuxPlatform, parseProcNetTcp, parseStat } from "../src/discover/linux.js";
import { shellQuote } from "../src/shell.js";
import { setPlatform } from "../src/discover/platform.js";
import { listServers } from "../src/discover/index.js";

// Snapshot of /proc from a real aarch64 Ubuntu container (see the Linux section of the README for how it was made).
const FIX = fileURLToPath(new URL("./fixtures/linux-proc/", import.meta.url));

describe("linux parsers", () => {
  it("decodes /proc/net/tcp and tcp6 listeners", () => {
    const v4 = parseProcNetTcp(
      "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n" +
        "   0: 0100007F:2328 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 4242 1 0 100 0 0 10 0\n" +
        "   1: 00000000:1F40 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 4243 1 0 100 0 0 10 0\n" +
        "   2: 0100007F:2328 0100007F:C350 01 00000000:00000000 00:00000000 00000000  1000        0 0 1 0 100 0 0 10 0\n",
      false,
    );
    expect(v4).toEqual([
      { address: "127.0.0.1", port: 9000, uid: 1000, inode: 4242 },
      { address: "*", port: 8000, uid: 0, inode: 4243 },
    ]);
    const v6 = parseProcNetTcp(
      "header\n" +
        "   0: 00000000000000000000000001000000:1F90 00000000000000000000000000000000:0000 0A 0 0 0 0 0 0 7 0\n" +
        "   1: 00000000000000000000000000000000:0050 00000000000000000000000000000000:0000 0A 0 0 0 0 0 0 8 0\n" +
        "   2: 0000000000000000FFFF00000100007F:0051 00000000000000000000000000000000:0000 0A 0 0 0 0 0 0 9 0\n",
      true,
    );
    expect(v6.map((s) => `${s.address}:${s.port}`)).toEqual(["[::1]:8080", "[::]:80", "127.0.0.1:81"]);
  });

  it("parses stat with awkward comm names", () => {
    expect(parseStat("42 (my (weird) proc) S 7 42 42 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 12345 0")).toMatchObject({
      comm: "my (weird) proc",
      ppid: 7,
      pgid: 42,
      starttime: 12345,
    });
  });

  it("quotes argv back into a runnable command", () => {
    expect(shellQuote(["python3", "-m", "http.server", "--directory", "/srv/my site", "it's", ""])).toBe(
      `python3 -m http.server --directory '/srv/my site' 'it'\\''s' ''`,
    );
  });
});

describe("listServers on a real Linux /proc", () => {
  beforeAll(() => setPlatform(linuxPlatform(`${FIX}proc`, `${FIX}passwd`)));
  afterAll(() => setPlatform(undefined));

  it("finds every listener with process details", async () => {
    const servers = await listServers({ titles: false });
    const byPort = Object.fromEntries(servers.map((s) => [s.port, s]));
    expect(Object.keys(byPort).map(Number).sort()).toEqual([7000, 8000, 8080, 9000]);

    expect(byPort[8000]).toMatchObject({
      address: "*",
      command: "python3",
      cmdline: "python3 -m http.server 8000",
      cwd: "/srv/my site",
      user: "root",
      framework: "http.server",
      hidden: false,
      // `bash -c` with no package-manager wrapper above it isn't part of the launch command.
      launch: "python3 -m http.server 8000",
      daemon: false,
    });
    expect(byPort[8000].startedAt).toBeGreaterThan(Date.UTC(2020, 0));
    expect(byPort[8080].address).toBe("[::1]");
    // /proc keeps exact argv, so paths with spaces survive.
    expect(byPort[9000].cmdline).toBe("python3 -m http.server 9000 --bind 127.0.0.1 --directory '/srv/my site'");
  });

  it("collapses forked workers sharing a socket into their parent", async () => {
    const servers = await listServers({ titles: false });
    const onPort = servers.filter((s) => s.port === 7000);
    expect(onPort).toHaveLength(1);
    expect(onPort[0].cmdline).toBe("python3 -");
  });
});
