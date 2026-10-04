/** Name the companion registers under in the browser's NativeMessagingHosts dir. */
export const HOST_NAME = "com.localhost_dashboard.host";

/** ID of the unpacked extension, pinned by the `key` in its manifest. */
export const EXTENSION_ID = "kgmeaiohbiopoacdedgpmchjbkbmdfig";

export const PROTOCOL_VERSION = 1;

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

/** Request type → result type. */
export interface HostMethods {
  ping: { params: {}; result: HostInfo };
  list: { params: {}; result: Server[] };
  /** Start pushing `servers.changed` events on this connection. */
  subscribe: { params: {}; result: Server[] };
  stop: { params: { pid: number; port: number }; result: StopResult };
}

export type HostMethod = keyof HostMethods;

export type HostRequest = {
  [M in HostMethod]: { id: number; type: M } & HostMethods[M]["params"];
}[HostMethod];

export type HostResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export type HostEvent = { event: "servers.changed"; servers: Server[] };

export type HostMessage = HostResponse | HostEvent;
