import type { Framework } from "@ld/shared";
import { useEffect, useState } from "react";

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  vite: "Vite",
  next: "Next.js",
  nuxt: "Nuxt",
  astro: "Astro",
  remix: "Remix",
  cra: "Create React App",
  webpack: "webpack",
  storybook: "Storybook",
  angular: "Angular",
  rails: "Rails",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
  "http.server": "Python http.server",
  php: "PHP",
  jupyter: "Jupyter",
  hugo: "Hugo",
  docker: "Docker",
  unknown: "",
};

export const INSTALL_CMD = "npm run build && npm run install-host";

export function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function uptime(startedAt: number | undefined, now: number): string | undefined {
  return startedAt ? duration(now - startedAt) : undefined;
}

export function ago(at: number | undefined, now: number): string | undefined {
  return at ? `${duration(now - at)} ago` : undefined;
}

/** Last path segment, unless the cwd is uninformative. */
export function folder(cwd: string | undefined): string | undefined {
  if (!cwd || cwd === "/" || cwd.includes("/Library/")) return undefined;
  return cwd.split("/").filter(Boolean).pop();
}

/** `~`-abbreviated path for display. */
export function tildify(path: string): string {
  return path.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~");
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
