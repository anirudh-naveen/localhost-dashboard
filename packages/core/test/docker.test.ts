import type { Server } from "@ld/shared";
import { describe, expect, it } from "vitest";
import { composeOverride, containerLaunch, parseDockerPs, parsePorts } from "../src/docker.js";
import { reconcile } from "../src/profiles.js";

describe("docker", () => {
  it("parses published ports, merging v4/v6 and expanding ranges", () => {
    expect(parsePorts("0.0.0.0:5432->5432/tcp, :::5432->5432/tcp, 6379/tcp, 127.0.0.1:8000-8001->80-81/tcp, 0.0.0.0:53->53/udp")).toEqual([
      { hostIp: "0.0.0.0", hostPort: 5432, containerPort: 5432 },
      { hostIp: "127.0.0.1", hostPort: 8000, containerPort: 80 },
      { hostIp: "127.0.0.1", hostPort: 8001, containerPort: 81 },
    ]);
  });

  it("parses docker ps rows with compose labels (config files may be comma-separated)", () => {
    const [c] = parseDockerPs(
      "abc123\tanilounge-pg\tpostgres:16\t0.0.0.0:5432->5432/tcp\tfind-animation\tpostgres\t/w/app\t/w/app/compose.yml,/w/app/compose.dev.yml\n",
    );
    expect(c).toEqual({
      id: "abc123",
      name: "anilounge-pg",
      image: "postgres:16",
      ports: [{ hostIp: "0.0.0.0", hostPort: 5432, containerPort: 5432 }],
      compose: {
        project: "find-animation",
        service: "postgres",
        workingDir: "/w/app",
        configFiles: ["/w/app/compose.yml", "/w/app/compose.dev.yml"],
      },
    });
    expect(parseDockerPs("x\tweb\tnginx\t0.0.0.0:8080->80/tcp\t\t\t\t\n")[0].compose).toBeUndefined();
  });

  it("builds launch commands", () => {
    expect(containerLaunch({ name: "my web" })).toBe("docker start 'my web'");
    expect(
      containerLaunch(
        { name: "pg", compose: { project: "p", service: "db", workingDir: "/w", configFiles: ["/w/a b.yml"] } },
        "/s/o.yaml",
      ),
    ).toBe("docker compose -p p -f '/w/a b.yml' -f /s/o.yaml up -d db");
  });

  it("writes a compose override that replaces the service's ports", () => {
    expect(composeOverride("db", "0.0.0.0", 55433, 5432)).toContain('ports: !override\n      - "55433:5432"');
    expect(composeOverride("db", "127.0.0.1", 55433, 5432)).toContain('- "127.0.0.1:55433:5432"');
  });

  it("captures containers as profiles named after the compose service", () => {
    const s: Server = {
      port: 5432,
      address: "*",
      pid: 41670,
      ppid: 1,
      pgid: 1,
      command: "com.docker.backend",
      cmdline: "",
      cwd: "/w/app",
      user: "dev",
      framework: "docker",
      hidden: false,
      launch: "docker compose -p p -f /w/app/compose.yml up -d db",
      daemon: false,
      container: {
        id: "abc",
        name: "p-db-1",
        image: "postgres:16",
        containerPort: 5432,
        hostIp: "0.0.0.0",
        compose: { project: "p", service: "db", workingDir: "/w/app", configFiles: ["/w/app/compose.yml"] },
      },
    };
    const { profiles } = reconcile([], [s], 1);
    expect(profiles[0]).toMatchObject({
      name: "db",
      command: "docker compose -p p -f /w/app/compose.yml up -d db",
      docker: { name: "p-db-1", containerPort: 5432, hostIp: "0.0.0.0" },
    });
    expect(profiles[0].docker).not.toHaveProperty("id");
  });
});
