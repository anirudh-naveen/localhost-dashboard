import { run } from "../exec.js";
import { parseLsofCwd, parseLsofListen, parsePs } from "./parse.js";
import type { Platform } from "./platform.js";

/** macOS (and BSDs): lsof + ps. Works on Linux too where lsof is installed, but /proc is preferred there. */
export function darwinPlatform(): Platform {
  return {
    async listeners() {
      return parseLsofListen(await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcLn"]));
    },
    async processes() {
      return parsePs(await run("ps", ["-Ao", "pid=,ppid=,pgid=,lstart=,command="]));
    },
    async cwds(pids) {
      if (pids.length === 0) return new Map();
      return parseLsofCwd(await run("lsof", ["-a", "-d", "cwd", "-p", pids.join(","), "-Fn"]));
    },
  };
}
