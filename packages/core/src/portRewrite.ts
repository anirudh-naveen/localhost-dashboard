import type { Framework, PortStrategy } from "@ld/shared";

export interface PortRewrite {
  command: string;
  env: Record<string, string>;
  strategy: PortStrategy;
}

/** How each framework takes a port when the command doesn't already spell one out. */
const PORT_ARG: Partial<Record<Framework, (port: number) => string>> = {
  vite: (p) => `--port ${p}`,
  astro: (p) => `--port ${p}`,
  nuxt: (p) => `--port ${p}`,
  remix: (p) => `--port ${p}`,
  angular: (p) => `--port ${p}`,
  webpack: (p) => `--port ${p}`,
  hugo: (p) => `--port ${p}`,
  flask: (p) => `--port ${p}`,
  fastapi: (p) => `--port ${p}`,
  next: (p) => `-p ${p}`,
  storybook: (p) => `-p ${p}`,
  rails: (p) => `-p ${p}`,
  jupyter: (p) => `--port=${p}`,
  django: (p) => `${p}`,
  "http.server": (p) => `${p}`,
};

/**
 * The old port as a standalone value: after start/space/quote/`=`/`:` and before
 * end/space/quote/slash. Covers `--port 3000`, `--port=3000`, `-p 3000`,
 * `runserver 0.0.0.0:8000`, `http.server 8000`, `PORT=3000 npm start`.
 */
function portToken(port: number): RegExp {
  return new RegExp(`(^|[\\s=:'"])${port}(?=$|[\\s'"/])`, "g");
}

/** `npm run dev` needs `--` before args meant for the script; pnpm/yarn/bun forward them as-is. */
function appendArgs(command: string, args: string): string {
  if (/^npm\s+(run|run-script|start|test)\b/.test(command) && !/\s--(\s|$)/.test(command)) {
    return `${command} -- ${args}`;
  }
  return `${command} ${args}`;
}

/** Rewrite a profile's command/env to listen on `newPort` instead of `oldPort`. */
export function rewritePort(
  command: string,
  env: Record<string, string>,
  framework: Framework,
  oldPort: number | undefined,
  newPort: number,
): PortRewrite {
  if (framework === "docker") throw new Error("Docker-published ports can't be moved from here yet");

  const nextEnv = { ...env };
  let next = command;
  let replaced = false;

  if (oldPort !== undefined) {
    for (const [k, v] of Object.entries(nextEnv)) {
      if (v === String(oldPort)) {
        nextEnv[k] = String(newPort);
        replaced = true;
      }
    }
    const rewritten = next.replace(portToken(oldPort), `$1${newPort}`);
    if (rewritten !== next) {
      next = rewritten;
      replaced = true;
    }
  }
  if (replaced) return { command: next, env: nextEnv, strategy: "replace" };

  const arg = PORT_ARG[framework];
  if (arg) return { command: appendArgs(next, arg(newPort)), env: nextEnv, strategy: "flag" };

  // CRA, Express and most Node servers read PORT; it's the best guess for anything unrecognised.
  return { command: next, env: { ...nextEnv, PORT: String(newPort) }, strategy: "env" };
}
