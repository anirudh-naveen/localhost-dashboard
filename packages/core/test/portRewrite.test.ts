import { describe, expect, it } from "vitest";
import { rewritePort } from "../src/portRewrite.js";

describe("rewritePort", () => {
  it.each([
    ["vite --port 5173", "vite", "vite --port 5180"],
    ["vite --port=5173 --host", "vite", "vite --port=5180 --host"],
    ["next dev -p 5173", "next", "next dev -p 5180"],
    ["python3 manage.py runserver 5173", "django", "python3 manage.py runserver 5180"],
    ["python3 manage.py runserver 0.0.0.0:5173", "django", "python3 manage.py runserver 0.0.0.0:5180"],
    ["python3 -m http.server 5173", "http.server", "python3 -m http.server 5180"],
    ["php -S localhost:5173 -t public", "php", "php -S localhost:5180 -t public"],
    ["PORT=5173 node server.js", "unknown", "PORT=5180 node server.js"],
    ["npm run dev -- --port '5173'", "vite", "npm run dev -- --port '5180'"],
  ] as const)("replaces explicit port: %s", (cmd, fw, out) => {
    expect(rewritePort(cmd, {}, fw, 5173, 5180)).toEqual({ command: out, env: {}, strategy: "replace" });
  });

  it("doesn't touch numbers that merely contain the port", () => {
    expect(rewritePort("node app.js --workers 51730", {}, "unknown", 5173, 5180).command).toBe(
      "node app.js --workers 51730",
    );
  });

  it("replaces the port in env", () => {
    expect(rewritePort("npm start", { PORT: "3000", HOST: "x" }, "cra", 3000, 3001)).toEqual({
      command: "npm start",
      env: { PORT: "3001", HOST: "x" },
      strategy: "replace",
    });
  });

  it.each([
    ["npm run dev", "vite", "npm run dev -- --port 5180"],
    ["npm run dev -- --host", "vite", "npm run dev -- --host --port 5180"],
    ["pnpm dev", "vite", "pnpm dev --port 5180"],
    ["yarn dev", "next", "yarn dev -p 5180"],
    ["bin/rails server", "rails", "bin/rails server -p 5180"],
    ["python3 -m http.server", "http.server", "python3 -m http.server 5180"],
    ["npm run storybook", "storybook", "npm run storybook -- -p 5180"],
  ] as const)("appends the framework's flag: %s (%s)", (cmd, fw, out) => {
    expect(rewritePort(cmd, {}, fw, 5173, 5180)).toEqual({ command: out, env: {}, strategy: "flag" });
  });

  it("falls back to PORT for unknown servers", () => {
    expect(rewritePort("npm start", {}, "unknown", 3000, 3001)).toEqual({
      command: "npm start",
      env: { PORT: "3001" },
      strategy: "env",
    });
  });

  it("refuses docker", () => {
    expect(() => rewritePort("x", {}, "docker", 5432, 5433)).toThrow(/Docker/);
  });
});

describe("moving a stopped profile", () => {
  it("uses the remembered framework's flag", async () => {
    const { previewMove } = await import("../src/move.js");
    const profile = {
      id: "x",
      name: "web",
      command: "npm run dev",
      cwd: "/tmp",
      env: {},
      port: 5173,
      framework: "vite" as const,
      autoCaptured: false,
      pinned: false,
      createdAt: 0,
    };
    const p = await previewMove(profile, undefined, 41999);
    expect(p).toMatchObject({ command: "npm run dev -- --port 41999", strategy: "flag", running: false });
  });
});
