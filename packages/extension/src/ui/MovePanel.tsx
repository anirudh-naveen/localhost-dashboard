import type { MovePreview, Profile, Server } from "@ld/shared";
import { useEffect, useState } from "react";
import { FRAMEWORK_LABEL } from "./format";
import { ErrorLine } from "./rows";
import type { Background } from "./useBackground";

interface Props {
  profile: Profile;
  server?: Server;
  tabCount: number;
  bg: Background;
  onDone: () => void;
  onCancel: () => void;
}

const PREVIEW_DEBOUNCE_MS = 250;

function strategyHint(p: MovePreview, profile: Profile, server?: Server): string {
  if (p.strategy === "replace") return `Replaced :${profile.port} in the command.`;
  const fw = server && server.framework !== "unknown" ? server.framework : profile.framework;
  if (p.strategy === "flag") return `Added ${(fw && FRAMEWORK_LABEL[fw]) || "the"} port flag.`;
  return "Sets PORT, which most Node servers (Express, CRA…) read. Edit the command if yours takes a flag instead.";
}

/** Pick a new port, review the rewritten command, then move (restarting if running). */
export function MovePanel({ profile, server, tabCount, bg, onDone, onCancel }: Props) {
  const [port, setPort] = useState("");
  const [preview, setPreview] = useState<MovePreview>();
  const [command, setCommand] = useState("");
  const [edited, setEdited] = useState(false);
  const [retarget, setRetarget] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Suggest the next free port on open, then re-preview as the user types.
  useEffect(() => {
    const requested = port ? Number(port) : undefined;
    let cancelled = false;
    const t = setTimeout(
      () =>
        bg.call("move.preview", { profileId: profile.id, port: requested }).then(
          (p) => {
            if (cancelled) return;
            setPreview(p);
            setError(undefined);
            if (!port) setPort(String(p.port));
            if (!edited) setCommand(p.command);
          },
          (e: Error) => !cancelled && setError(e.message),
        ),
      port ? PREVIEW_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // Re-preview only when the port changes.
  }, [port, profile.id]);

  const envChanges = preview ? Object.entries(preview.env).filter(([k, v]) => profile.env[k] !== v) : [];
  const ready = preview && String(preview.port) === port && preview.free;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setBusy(true);
    setError(undefined);
    try {
      await bg.move({
        profileId: profile.id,
        port: preview.port,
        command: edited ? command : undefined,
        env: preview.env,
        retargetTabs: retarget,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="move" onSubmit={submit}>
      <h2>Move {profile.name}</h2>
      <div className="move-ports">
        <span className="mono">:{profile.port ?? "?"}</span>
        <span className="muted">→</span>
        <input
          className="mono"
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
          inputMode="numeric"
          aria-label="New port"
          autoFocus
        />
        {preview && String(preview.port) === port && (
          <span className={preview.free ? "ok" : "error"}>{preview.free ? "free" : "in use"}</span>
        )}
      </div>

      <label>
        Command
        <textarea
          className="mono"
          rows={2}
          value={command}
          onChange={(e) => {
            setCommand(e.target.value);
            setEdited(true);
          }}
        />
        {preview && (
          <span className="hint">
            {edited ? "Using your edited command." : strategyHint(preview, profile, server)}
          </span>
        )}
      </label>
      {envChanges.length > 0 && (
        <div className="hint">
          Env: <code>{envChanges.map(([k, v]) => `${k}=${v}`).join(" ")}</code>
        </div>
      )}

      {preview?.running && (
        <p className="hint">
          Restarts the server in the background; its output will appear in Logs. If it fails to start on the new port,
          it's restarted on :{profile.port}.
        </p>
      )}
      {preview?.running && tabCount > 0 && (
        <label className="check">
          <input type="checkbox" checked={retarget} onChange={(e) => setRetarget(e.target.checked)} />
          Point {tabCount} open tab{tabCount === 1 ? "" : "s"} to the new port
        </label>
      )}

      <ErrorLine error={error} />
      <div className="move-actions">
        <button type="button" className="small" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="small primary" disabled={!ready || busy}>
          {busy ? (preview?.running ? "Restarting…" : "Saving…") : `Move to :${port || "…"}`}
        </button>
      </div>
    </form>
  );
}
