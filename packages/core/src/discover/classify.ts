import type { Framework } from "@ld/shared";

const FRAMEWORKS: [Framework, RegExp][] = [
  ["docker", /com\.docker|docker-proxy|vpnkit|rootlessport/],
  ["next", /next-server|\bnext(\.js)?\s+(dev|start)\b|next\/dist\/bin\/next/],
  ["nuxt", /\bnuxi?\b/],
  ["astro", /\bastro\b/],
  ["remix", /\bremix\b/],
  ["storybook", /storybook/],
  ["angular", /\bng\s+serve\b|@angular\/cli/],
  ["cra", /react-scripts/],
  ["vite", /\bvite\b/],
  ["webpack", /webpack(-dev-server|\s+serve)/],
  ["django", /manage\.py\s+runserver/],
  ["flask", /\bflask\b/],
  ["fastapi", /\buvicorn\b|\bfastapi\b/],
  ["http.server", /http\.server|SimpleHTTPServer/],
  ["rails", /\brails\b|\bpuma\b/],
  ["php", /\bphp\b.*\s-S\s/],
  ["jupyter", /jupyter/],
  ["hugo", /\bhugo\b/],
];

/** Processes that own ports published by Docker containers. */
export const DOCKER_PROCESS = /com\.docker|docker-proxy|vpnkit|rootlessport/;

export function detectFramework(cmdline: string): Framework {
  for (const [fw, re] of FRAMEWORKS) if (re.test(cmdline)) return fw;
  return "unknown";
}

/** Desktop apps and OS daemons that listen on TCP but aren't dev servers. */
const SYSTEM =
  /^(ControlCenter|rapportd|sharingd|AirPlay|launchd|Spotify|Dropbox|Slack|Discord|zoom|OneDrive|Google Chrome|Chrome Helper|Brave Browser|Microsoft|Code Helper|Cursor Helper|GitHub Desktop|figma_agent|Adobe|Creative Cloud|Raycast|Claude|Notion|1Password|Logi|Steam|Spotlight|identityservicesd|remoted)/i;

/** Runtimes that are almost always something the user started on purpose. */
const DEV_RUNTIME =
  /^(node|nodejs|bun|deno|python[\d.]*|Python|ruby|java|php|go|air|dotnet|uvicorn|gunicorn|hugo|jekyll|caddy|nginx|httpd|postgres|mongod|redis-server|mysqld|com\.docker|docker|beam\.smp|erl|cargo|esbuild|next-server)/;

export function isHidden(command: string, cmdline: string, port: number, framework: Framework): boolean {
  if (framework !== "unknown") return false;
  if (SYSTEM.test(command)) return true;
  if (DEV_RUNTIME.test(command)) return false;
  // Binaries inside a macOS app bundle are desktop apps, not dev servers.
  if (cmdline.includes(".app/Contents/")) return true;
  // Ephemeral/privileged ports from unknown binaries are usually app internals.
  return port < 1024 || port >= 49152;
}

/** Only addresses reachable as `localhost`. */
export function isLocalBind(address: string): boolean {
  return ["*", "127.0.0.1", "[::1]", "[::]", "0.0.0.0", "localhost"].includes(address);
}
