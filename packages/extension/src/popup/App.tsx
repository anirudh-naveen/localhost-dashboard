import type { Framework, Server } from "@ld/shared";
import { useEffect, useRef, useState } from "react";
import { POPUP_PORT, type BgToPopup, type PopupToBg, type State } from "../messages";

const FRAMEWORK_LABEL: Record<Framework, string> = {
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

const INSTALL_CMD = "npm run build && npm run install-host";

function uptime(startedAt: number | undefined, now: number): string | undefined {
  if (!startedAt) return undefined;
  const m = Math.max(0, Math.floor((now - startedAt) / 60000));
  if (m < 1) return "just started";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Last path segment, unless the cwd is uninformative. */
function folder(cwd: string | undefined): string | undefined {
  if (!cwd || cwd === "/" || cwd.includes("/Library/")) return undefined;
  return cwd.split("/").filter(Boolean).pop();
}

function useBackground() {
  const [state, setState] = useState<State>({ mode: "connecting", servers: [], tabs: {} });
  const portRef = useRef<chrome.runtime.Port>(undefined);
  const pending = useRef(new Map<number, (r: { ok: boolean; error?: string }) => void>());
  const nextId = useRef(1);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: POPUP_PORT });
    portRef.current = port;
    port.onMessage.addListener((msg: BgToPopup) => {
      if (msg.type === "state") setState(msg.state);
      else {
        pending.current.get(msg.reqId)?.(msg);
        pending.current.delete(msg.reqId);
      }
    });
    return () => port.disconnect();
  }, []);

  const send = (msg: PopupToBg) => portRef.current?.postMessage(msg);
  const stop = (pid: number, port: number) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const reqId = nextId.current++;
      pending.current.set(reqId, resolve);
      send({ type: "stop", reqId, pid, port });
    });

  return { state, send, stop };
}

export function App() {
  const { state, send, stop } = useBackground();
  const [showHidden, setShowHidden] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const visible = state.servers.filter((s) => !s.hidden);
  const hidden = state.servers.filter((s) => s.hidden);
  const rows = showHidden ? [...visible, ...hidden] : visible;
  const canControl = state.mode === "host";

  return (
    <div className="app">
      <header>
        <h1>Localhost</h1>
        <span className={`pill pill-${state.mode}`}>
          {state.mode === "host" ? "Companion" : state.mode === "probe" ? "Detect-only" : "Connecting…"}
        </span>
        <button className="icon" title="Refresh" onClick={() => send({ type: "refresh" })}>
          ↻
        </button>
      </header>

      {state.mode === "probe" && <InstallBanner error={state.hostError} />}

      {rows.length === 0 ? (
        <p className="empty">
          {state.mode === "connecting" ? "Looking for servers…" : "No servers running on localhost."}
        </p>
      ) : (
        <ul className="list">
          {rows.map((s) => (
            <Row
              key={`${s.pid}:${s.port}`}
              server={s}
              now={now}
              tabCount={state.tabs[s.port]?.length ?? 0}
              canControl={canControl}
              onOpen={() => send({ type: "open", port: s.port })}
              onStop={() => stop(s.pid, s.port)}
            />
          ))}
        </ul>
      )}

      {hidden.length > 0 && (
        <footer>
          <button className="link" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? "Hide" : "Show"} {hidden.length} system/app listener{hidden.length === 1 ? "" : "s"}
          </button>
        </footer>
      )}
    </div>
  );
}

function InstallBanner({ error }: { error?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="banner">
      <p>
        Showing common ports only. Install the companion to see every server and stop them. In the repo, run:
      </p>
      <div className="cmd">
        <code>{INSTALL_CMD}</code>
        <button
          className="small"
          onClick={async () => {
            await navigator.clipboard.writeText(INSTALL_CMD);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="muted">Then click ↻. {error && <span title={error}>({error})</span>}</p>
    </div>
  );
}

interface RowProps {
  server: Server;
  now: number;
  tabCount: number;
  canControl: boolean;
  onOpen: () => void;
  onStop: () => Promise<{ ok: boolean; error?: string }>;
}

function Row({ server: s, now, tabCount, canControl, onOpen, onStop }: RowProps) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "stopping">("idle");
  const [error, setError] = useState<string>();

  // Revert an unanswered "Confirm?" so a stray later click can't stop the server.
  useEffect(() => {
    if (phase !== "confirm") return;
    const t = setTimeout(() => setPhase("idle"), 3000);
    return () => clearTimeout(t);
  }, [phase]);

  const name = s.title || FRAMEWORK_LABEL[s.framework] || s.command || "HTTP server";
  const meta = [
    s.title && FRAMEWORK_LABEL[s.framework],
    folder(s.cwd),
    uptime(s.startedAt, now),
    s.pid ? `pid ${s.pid}` : undefined,
  ].filter(Boolean);

  const stopBlocked =
    s.framework === "docker" ? "Published by Docker; stop the container instead" : s.hidden ? "System/app listener" : undefined;

  async function handleStop() {
    if (phase === "idle") return setPhase("confirm");
    setPhase("stopping");
    setError(undefined);
    const r = await onStop();
    if (!r.ok) {
      setError(r.error);
      setPhase("idle");
    }
  }

  return (
    <li className={`row ${s.hidden ? "row-hidden" : ""}`}>
      <div className="port">:{s.port}</div>
      <div className="info">
        <div className="name" title={s.cmdline || undefined}>
          {name}
          {tabCount > 0 && (
            <span className="tabs" title={`Open in ${tabCount} tab${tabCount === 1 ? "" : "s"}`}>
              ● {tabCount}
            </span>
          )}
        </div>
        {meta.length > 0 && (
          <div className="meta" title={s.cwd}>
            {meta.join(" · ")}
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </div>
      <div className="actions">
        <button className="small" onClick={onOpen}>
          {tabCount > 0 ? "Go to tab" : "Open"}
        </button>
        {canControl && (
          <button
            className={`small ${phase === "confirm" ? "danger" : ""}`}
            disabled={!!stopBlocked || phase === "stopping"}
            title={stopBlocked}
            onClick={handleStop}
          >
            {phase === "confirm" ? "Confirm?" : phase === "stopping" ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>
    </li>
  );
}
