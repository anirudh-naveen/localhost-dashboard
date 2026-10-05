// Feeds the real UI pages a fixed demo state (no real servers or paths) for store screenshots.
const { contextBridge } = require("electron");

const now = Date.now();
const min = 60_000;
const base = { address: "127.0.0.1", ppid: 1, pgid: 1, user: "dev", hidden: false, daemon: false };
const servers = [
  { ...base, port: 5173, pid: 41823, command: "node", cmdline: "node node_modules/.bin/vite", launch: "npm run dev",
    cwd: "/Users/dev/code/storefront", startedAt: now - 42 * min, framework: "vite", title: "Acme Storefront", profileId: "web" },
  { ...base, port: 4000, pid: 41790, command: "node", cmdline: "node src/server.js", launch: "npm run dev",
    cwd: "/Users/dev/code/storefront/api", startedAt: now - 43 * min, framework: "unknown", title: "Acme API", profileId: "api" },
  { ...base, port: 4321, pid: 40122, command: "node", cmdline: "node node_modules/.bin/astro dev", launch: "pnpm dev",
    cwd: "/Users/dev/code/docs", startedAt: now - 3 * 60 * min, framework: "astro", title: "Acme Docs", profileId: "docs" },
  { ...base, port: 5432, pid: 2210, command: "com.docker.backend", cmdline: "", launch: "docker compose -p storefront up -d db",
    cwd: "/Users/dev/code/storefront", framework: "docker", profileId: "db",
    container: { id: "c0ffee", name: "storefront-db-1", image: "postgres:16", containerPort: 5432, hostIp: "0.0.0.0",
      compose: { project: "storefront", service: "db", workingDir: "/Users/dev/code/storefront", configFiles: [] } } },
];
const profile = (id, name, command, cwd, port, extra = {}) => ({
  id, name, command, cwd, env: {}, port, autoCaptured: true, pinned: false, createdAt: now - 7 * 24 * 60 * min, lastSeen: now, ...extra,
});
const profiles = [
  profile("web", "storefront", "npm run dev", "/Users/dev/code/storefront", 5173, { pinned: true, autoCaptured: false, framework: "vite" }),
  profile("api", "api", "npm run dev", "/Users/dev/code/storefront/api", 4000),
  profile("docs", "docs", "pnpm dev", "/Users/dev/code/docs", 4321, { framework: "astro" }),
  profile("db", "db", "docker compose -p storefront up -d db", "/Users/dev/code/storefront", 5432),
  profile("sb", "storybook", "npm run storybook", "/Users/dev/code/storefront", 6006, { lastSeen: now - 26 * 60 * min, framework: "storybook" }),
  profile("admin", "admin", "python3 manage.py runserver 8000", "/Users/dev/code/admin", 8000, { lastSeen: now - 3 * 24 * 60 * min, framework: "django" }),
];
const state = { mode: "host", servers, profiles, tabs: { 5173: [1, 2], 4321: [3] } };

contextBridge.exposeInMainWorld("ldDesktop", {
  connect(onMessage) {
    setTimeout(() => onMessage({ type: "state", state }), 0);
    window.__demoReply = (msg) => onMessage(msg);
    return () => {};
  },
  send(msg) {
    // Answer the Move panel's preview so it renders a realistic suggestion.
    if (msg.type === "host" && msg.method === "move.preview") {
      setTimeout(() => window.__demoReply({ type: "result", reqId: msg.reqId, ok: true, result: {
        port: msg.params.port ?? 5174, free: true, command: `npm run dev -- --port ${msg.params.port ?? 5174}`,
        env: {}, strategy: "flag", running: true } }), 0);
    }
  },
  openDashboard() {},
});
