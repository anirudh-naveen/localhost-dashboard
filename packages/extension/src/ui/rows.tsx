import type { Profile, Server } from "@ld/shared";
import { useEffect, useState, type ReactNode } from "react";
import { ago, folder, FRAMEWORK_LABEL, uptime } from "./format";

/** Run an async action, tracking busy state and its error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, clearError: () => setError(undefined) };
}

/** Two-click button for destructive actions; an unanswered confirm reverts after 3s. */
export function ConfirmButton({
  onConfirm,
  busy,
  busyLabel,
  disabled,
  title,
  children,
}: {
  onConfirm: () => void;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`small ${armed ? "danger" : ""}`}
      disabled={disabled || busy}
      title={title}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {busy ? busyLabel : armed ? "Confirm?" : children}
    </button>
  );
}

/** One-line error; full text in the tooltip. Start errors carry log output, whose last line is usually the cause. */
export function ErrorLine({ error }: { error?: string }) {
  if (!error) return null;
  const lines = error.trim().split("\n");
  return (
    <div className="error" title={error}>
      {lines.length > 1 ? `${lines[0]}: ${lines.at(-1)}` : lines[0]}
    </div>
  );
}

interface ServerRowProps {
  server: Server;
  profile?: Profile;
  now: number;
  tabCount: number;
  canControl: boolean;
  onOpen: () => void;
  onStop: () => Promise<unknown>;
  /** Extra buttons (e.g. Logs on the dashboard). */
  extra?: ReactNode;
}

export function ServerRow({ server: s, profile, now, tabCount, canControl, onOpen, onStop, extra }: ServerRowProps) {
  const stop = useAction();
  const name = s.title || profile?.name || FRAMEWORK_LABEL[s.framework] || s.command || "HTTP server";
  const meta = [
    s.title && FRAMEWORK_LABEL[s.framework],
    profile && profile.name !== name ? profile.name : folder(s.cwd),
    uptime(s.startedAt, now),
    s.pid ? `pid ${s.pid}` : undefined,
  ].filter(Boolean);

  const stopBlocked =
    s.framework === "docker"
      ? "Published by Docker; stop the container instead"
      : s.hidden
        ? "System/app listener"
        : undefined;

  return (
    <li className={`row ${s.hidden ? "row-hidden" : ""}`}>
      <span className="dot dot-on" />
      <div className="port">:{s.port}</div>
      <div className="info">
        <div className="name" title={s.launch || undefined}>
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
        <ErrorLine error={stop.error} />
      </div>
      <div className="actions">
        {extra}
        <button className="small" onClick={onOpen}>
          {tabCount > 0 ? "Go to tab" : "Open"}
        </button>
        {canControl && (
          <ConfirmButton
            onConfirm={() => stop.run(onStop)}
            busy={stop.busy}
            busyLabel="Stopping…"
            disabled={!!stopBlocked}
            title={stopBlocked}
          >
            Stop
          </ConfirmButton>
        )}
      </div>
    </li>
  );
}

interface StoppedRowProps {
  profile: Profile;
  now: number;
  onStart: () => Promise<unknown>;
  extra?: ReactNode;
}

export function StoppedRow({ profile: p, now, onStart, extra }: StoppedRowProps) {
  const start = useAction();
  const meta = [p.pinned ? "★ pinned" : undefined, ago(p.lastSeen, now) && `seen ${ago(p.lastSeen, now)}`].filter(Boolean);
  return (
    <li className="row">
      <span className="dot" />
      <div className="port muted-port">{p.port ? `:${p.port}` : "—"}</div>
      <div className="info">
        <div className="name" title={`${p.command}\n${p.cwd}`}>
          {p.name}
        </div>
        <div className="meta">{meta.length ? meta.join(" · ") : p.command}</div>
        <ErrorLine error={start.error} />
      </div>
      <div className="actions">
        {extra}
        <button className="small primary" disabled={start.busy} onClick={() => start.run(onStart)}>
          {start.busy ? "Starting…" : "Start"}
        </button>
      </div>
    </li>
  );
}
