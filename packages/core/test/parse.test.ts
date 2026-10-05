import { describe, expect, it } from "vitest";
import { parseLsofCwd, parseLsofListen, parsePs, parsePsTree } from "../src/discover/parse.js";
import { detectFramework, isHidden, isLocalBind } from "../src/discover/classify.js";
import { stopTargets } from "../src/control.js";

const LSOF = `p689
cControlCenter
Ldev
f9
n*:7000
f11
n*:5000
p1284
cmongod
Ldev
f9
n127.0.0.1:27017
f10
n[::1]:27017
p4242
cnode
Ldev
f20
n[::1]:5173
p5151
cPython
Ldev
f3
n192.168.1.20:8000
`;

describe("parseLsofListen", () => {
  it("parses one entry per listening fd", () => {
    const l = parseLsofListen(LSOF);
    expect(l).toHaveLength(6);
    expect(l[0]).toEqual({ pid: 689, command: "ControlCenter", user: "dev", address: "*", port: 7000 });
    expect(l[3]).toMatchObject({ pid: 1284, address: "[::1]", port: 27017 });
    expect(l[4]).toMatchObject({ pid: 4242, command: "node", port: 5173 });
  });
});

describe("parsePs", () => {
  it("parses lstart and keeps full command line", () => {
    const m = parsePs(
      "  4242  4200  4200 Sun Oct  4 17:59:29 2026     node /proj/node_modules/.bin/vite --port 5173\n" +
        "1284 1 1284 Mon Sep 28 09:01:02 2026 /opt/homebrew/bin/mongod --config x.conf\n",
    );
    expect(m.get(4242)).toEqual({
      pid: 4242,
      ppid: 4200,
      pgid: 4200,
      startedAt: new Date(2026, 9, 4, 17, 59, 29).getTime(),
      cmdline: "node /proj/node_modules/.bin/vite --port 5173",
    });
    expect(m.get(1284)?.ppid).toBe(1);
  });
});

describe("parseLsofCwd", () => {
  it("maps pid to cwd", () => {
    const m = parseLsofCwd("p4242\nfcwd\nn/Users/dev/my app\np1284\nfcwd\nn/\n");
    expect(m.get(4242)).toBe("/Users/dev/my app");
    expect(m.get(1284)).toBe("/");
  });
});

describe("classify", () => {
  it.each([
    ["node /p/node_modules/.bin/vite", "vite"],
    ["next-server (v15.1.0)", "next"],
    ["node /p/node_modules/.bin/next dev -p 3001", "next"],
    ["node /p/node_modules/react-scripts/scripts/start.js", "cra"],
    ["python3 manage.py runserver 8000", "django"],
    ["/usr/bin/python3 -m http.server 8765", "http.server"],
    ["uvicorn app.main:app --reload", "fastapi"],
    ["puma 6.4.0 (tcp://localhost:3000) [app]", "rails"],
    ["php -S localhost:8080", "php"],
    ["/opt/homebrew/bin/mongod", "unknown"],
  ])("%s → %s", (cmd, fw) => expect(detectFramework(cmd)).toBe(fw));

  it("hides system apps and unknown ephemeral listeners", () => {
    expect(isHidden("ControlCenter", "", 5000, "unknown")).toBe(true);
    expect(isHidden("Spotify", "", 57621, "unknown")).toBe(true);
    expect(isHidden("MEGAsync", "/Applications/MEGAsync.app/Contents/MacOS/MEGAsync", 6341, "unknown")).toBe(true);
    expect(isHidden("myserver", "./myserver", 60000, "unknown")).toBe(true);
    expect(isHidden("myserver", "./myserver", 8080, "unknown")).toBe(false);
    expect(isHidden("mongod", "/opt/homebrew/bin/mongod", 27017, "unknown")).toBe(false);
    expect(isHidden("node", "node server.js", 61234, "unknown")).toBe(false);
    expect(isHidden("com.docker.backend", "/Applications/Docker.app/Contents/MacOS/com.docker.backend", 5432, "docker")).toBe(false);
  });

  it("only keeps localhost-reachable binds", () => {
    expect(isLocalBind("*")).toBe(true);
    expect(isLocalBind("[::1]")).toBe(true);
    expect(isLocalBind("192.168.1.20")).toBe(false);
  });
});

describe("stopTargets", () => {
  it("includes npm wrapper parents but stops at the shell", () => {
    const tree = parsePsTree(
      [
        "100 1 /bin/zsh -l",
        "200 100 npm run dev",
        "300 200 sh -c vite",
        "400 300 node /p/node_modules/.bin/vite",
      ].join("\n"),
    );
    expect(stopTargets(400, tree)).toEqual([400, 300, 200]);
    tree.set(200, { ppid: 100, cmdline: "node /usr/local/lib/node_modules/npm/bin/npm-cli.js run dev" });
    expect(stopTargets(400, tree)).toEqual([400, 300, 200]);
  });

  it("stops below a wrapper that also runs another server", () => {
    const tree = parsePsTree(
      [
        "100 1 /bin/zsh -l",
        "200 100 node /p/node_modules/.bin/concurrently npm:web npm:api",
        "300 200 npm run web",
        "400 300 node /p/node_modules/.bin/vite",
        "500 200 npm run api",
        "600 500 node api.js",
      ].join("\n"),
    );
    expect(stopTargets(400, tree, [400, 600])).toEqual([400, 300]);
    // With no sibling listening, the whole chain goes.
    expect(stopTargets(400, tree, [400])).toEqual([400, 300, 200]);
  });

  it("does not include a bare shell with no wrapper above it", () => {
    const tree = parsePsTree(["100 1 /bin/zsh -l", "300 100 sh -c ./server", "400 300 ./server"].join("\n"));
    expect(stopTargets(400, tree)).toEqual([400]);
  });
});
