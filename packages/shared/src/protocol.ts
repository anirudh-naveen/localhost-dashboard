/** Name the companion registers under in the browser's NativeMessagingHosts dir. */
export const HOST_NAME = "com.localhost_dashboard.host";

/** ID of the unpacked extension, pinned by the `key` in its manifest. */
export const EXTENSION_ID = "kgmeaiohbiopoacdedgpmchjbkbmdfig";

/** Add-on ID of the Firefox build (`browser_specific_settings.gecko.id`). */
export const FIREFOX_ID = "localhost-dashboard@extension";

export const PROTOCOL_VERSION = 1;

/**
 * Loopback port of the desktop app's API for browser extensions (Safari has no stdio
 * companions; Chrome/Firefox use it when the companion isn't installed).
 */
export const DESKTOP_API_PORT = 47823;

export type Framework =
  | "vite"
  | "next"
  | "nuxt"
  | "astro"
  | "remix"
  | "cra"
  | "webpack"
  | "storybook"
  | "angular"
  | "rails"
  | "django"
  | "flask"
  | "fastapi"
  | "http.server"
  | "php"
  | "jupyter"
  | "hugo"
  | "docker"
  | "unknown";

export interface Server {
  port: number;
  /** Bind address as reported by lsof, e.g. `127.0.0.1`, `[::1]`, `*`. */
  address: string;
  pid: number;
  ppid: number;
  pgid: number;
  /** Short process name (lsof `c` field). */
  command: string;
  /** Full command line from `ps`. */
  cmdline: string;
  cwd?: string;
  user: string;
  /** Epoch ms. */
  startedAt?: number;
  framework: Framework;
  /** `<title>` of `GET /`, when the server speaks HTML. */
  title?: string;
  /** System/app listeners (ControlCenter, Spotify, ephemeral ports) hidden by default. */
  hidden: boolean;
  /** Command line of the outermost launcher (`npm run dev` rather than `node …/vite`). */
  launch: string;
  /** Outermost launcher is parented by launchd/init: a managed service or an already-detached process. */
  daemon: boolean;
  /** Profile this server is running from, matched by cwd + port. */
  profileId?: string;
  /** Set when the port is published by a Docker container. */
  container?: ContainerInfo;
}

export interface ComposeInfo {
  project: string;
  service: string;
  workingDir: string;
  configFiles: string[];
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  /** Port inside the container that this host port maps to. */
  containerPort: number;
  /** Host address the port is published on (`0.0.0.0`, `127.0.0.1`, `::`). */
  hostIp: string;
  compose?: ComposeInfo;
}

/** A remembered way to start a server. */
export interface Profile {
  id: string;
  name: string;
  /** Shell command, run with the user's `$SHELL -c` in `cwd`. */
  command: string;
  cwd: string;
  env: Record<string, string>;
  /** Port the server is expected to listen on; Start waits for it. */
  port?: number;
  /** Last framework seen running from this profile; lets a stopped profile be moved with the right flag. */
  framework?: Framework;
  /** For container profiles: what's needed to re-publish on another port while stopped. */
  docker?: Omit<ContainerInfo, "id" | "image">;
  /** Captured from a running server and still owned by auto-capture (overwritten on re-capture, pruned when stale). */
  autoCaptured: boolean;
  /** Kept forever and listed first. */
  pinned: boolean;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms the server was last seen running. */
  lastSeen?: number;
}

export type ProfileInput = Omit<Profile, "id" | "autoCaptured" | "createdAt" | "lastSeen"> & { id?: string };

export interface Snapshot {
  servers: Server[];
  profiles: Profile[];
}

export interface HostInfo {
  version: number;
  platform: string;
  node: string;
}

export interface StopResult {
  /** True when SIGKILL was needed after SIGTERM timed out. */
  forced: boolean;
  /** PIDs that were signalled (the server plus wrapper parents like `npm run dev`). */
  pids: number[];
}

/** How a move changes the command: an existing port replaced, a flag appended, or `PORT` set. */
export type PortStrategy = "replace" | "flag" | "env" | "compose";

export interface MovePreview {
  /** Requested port, or the next free one after the current port. */
  port: number;
  free: boolean;
  command: string;
  env: Record<string, string>;
  strategy: PortStrategy;
  /** Whether the server is running and will be restarted. */
  running: boolean;
}

export interface MoveResult {
  profile: Profile;
  oldPort?: number;
  newPort: number;
  /** Set when a running server was restarted on the new port. */
  started?: StartResult;
}

export interface StartResult {
  pid: number;
  /** False when the profile has no port, or nothing listened before the timeout. */
  listening: boolean;
}

/** Request type → result type. */
export interface HostMethods {
  ping: { params: {}; result: HostInfo };
  list: { params: {}; result: Snapshot };
  /** Start pushing `snapshot` events on this connection. */
  subscribe: { params: {}; result: Snapshot };
  /** Stops the process, or the container when `containerId` is given. */
  stop: { params: { pid: number; port: number; containerId?: string }; result: StopResult };
  start: { params: { profileId: string }; result: StartResult };
  /** Proposed command/env for moving a profile to `port` (or a suggested free port). */
  "move.preview": { params: { profileId: string; port?: number }; result: MovePreview };
  /** Rewrite the profile for `port` and, if running, restart it there. Rolls back on failure. */
  move: {
    params: { profileId: string; port: number; command?: string; env?: Record<string, string> };
    result: MoveResult;
  };
  "profiles.upsert": { params: { profile: ProfileInput }; result: Profile };
  "profiles.delete": { params: { profileId: string }; result: null };
  /** Last ~64 KB of the profile's log file. */
  "logs.tail": { params: { profileId: string }; result: { text: string; path: string } };
}

export type HostMethod = keyof HostMethods;

export type HostRequest = {
  [M in HostMethod]: { id: number; type: M } & HostMethods[M]["params"];
}[HostMethod];

export type HostResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export type HostEvent = { event: "snapshot" } & Snapshot;

export type HostMessage = HostResponse | HostEvent;
