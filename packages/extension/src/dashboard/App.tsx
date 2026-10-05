import type { Profile, ProfileInput, Server } from "@ld/shared";
import { useState } from "react";
import { ago, tildify, useNow } from "../ui/format";
import { InstallBanner } from "../ui/InstallBanner";
import { ConfirmButton, ErrorLine, ServerRow, useAction } from "../ui/rows";
import { profileById } from "../ui/select";
import { useBackground, type Background } from "../ui/useBackground";
import { LogViewer } from "./LogViewer";
import { ProfileEditor } from "./ProfileEditor";

export function App() {
  const bg = useBackground();
  const { state, send, call } = bg;
  const now = useNow();
  const [editing, setEditing] = useState<ProfileInput | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const canControl = state.mode === "host";
  const profiles = profileById(state);
  const serverFor = new Map(state.servers.filter((s) => s.profileId).map((s) => [s.profileId!, s]));
  const visible = state.servers.filter((s) => showHidden || !s.hidden);
  const hiddenCount = state.servers.filter((s) => s.hidden).length;
  const sorted = [...state.profiles].sort(
    (a, b) =>
      Number(serverFor.has(b.id)) - Number(serverFor.has(a.id)) ||
      Number(b.pinned) - Number(a.pinned) ||
      a.name.localeCompare(b.name),
  );
  const logsProfile = logsFor ? profiles.get(logsFor) : undefined;

  return (
    <div className={`page ${logsProfile ? "with-logs" : ""}`}>
      <main>
        <header>
          <h1>Localhost Dashboard</h1>
          <span className={`pill pill-${state.mode}`}>
            {state.mode === "host" ? "Companion" : state.mode === "probe" ? "Detect-only" : "Connecting…"}
          </span>
          <button className="icon" title="Refresh" onClick={() => send({ type: "refresh" })}>
            ↻
          </button>
        </header>

        {state.mode === "probe" && <InstallBanner error={state.hostError} />}

        <section>
          <div className="section-head">
            <h2>Running</h2>
            {hiddenCount > 0 && (
              <button className="link" onClick={() => setShowHidden(!showHidden)}>
                {showHidden ? "Hide" : "Show"} {hiddenCount} system/app listener{hiddenCount === 1 ? "" : "s"}
              </button>
            )}
          </div>
          {visible.length === 0 ? (
            <p className="empty">No servers running on localhost.</p>
          ) : (
            <ul className="list card">
              {visible.map((s) => (
                <ServerRow
                  key={`${s.pid}:${s.port}`}
                  server={s}
                  profile={s.profileId ? profiles.get(s.profileId) : undefined}
                  now={now}
                  tabCount={state.tabs[s.port]?.length ?? 0}
                  canControl={canControl}
                  onOpen={() => send({ type: "open", port: s.port })}
                  onStop={() => call("stop", { pid: s.pid, port: s.port })}
                  extra={
                    s.profileId && (
                      <button className="small" onClick={() => setLogsFor(s.profileId!)}>
                        Logs
                      </button>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {canControl && (
          <section>
            <div className="section-head">
              <h2>Profiles</h2>
              <button
                className="small"
                onClick={() => setEditing({ name: "", command: "", cwd: "", env: {}, pinned: true })}
              >
                + New profile
              </button>
            </div>
            <p className="hint">
              Servers you run are remembered automatically. Edit or pin one to keep it for good; unpinned
              auto-captured profiles are forgotten after 14 days unseen.
            </p>
            {sorted.length === 0 ? (
              <p className="empty">No profiles yet. Start a dev server and it will show up here.</p>
            ) : (
              <table className="profiles card">
                <thead>
                  <tr>
                    <th />
                    <th>Name</th>
                    <th>Command</th>
                    <th>Port</th>
                    <th>Last seen</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <ProfileRow
                      key={p.id}
                      profile={p}
                      server={serverFor.get(p.id)}
                      now={now}
                      bg={bg}
                      onEdit={() => setEditing(p)}
                      onLogs={() => setLogsFor(p.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>

      {logsProfile && (
        <LogViewer
          profile={logsProfile}
          running={serverFor.has(logsProfile.id)}
          call={call}
          onClose={() => setLogsFor(null)}
        />
      )}

      {editing && (
        <ProfileEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await call("profiles.upsert", { profile: input });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface ProfileRowProps {
  profile: Profile;
  server?: Server;
  now: number;
  bg: Background;
  onEdit: () => void;
  onLogs: () => void;
}

function ProfileRow({ profile: p, server, now, bg, onEdit, onLogs }: ProfileRowProps) {
  const action = useAction();
  const del = useAction();
  const running = !!server;

  return (
    <tr>
      <td>
        <span className={`dot ${running ? "dot-on" : ""}`} title={running ? "Running" : "Stopped"} />
      </td>
      <td>
        <div className="name">
          {p.name}
          {p.pinned && <span className="badge">pinned</span>}
          {p.autoCaptured && <span className="badge badge-muted">auto</span>}
        </div>
        <div className="meta" title={p.cwd}>
          {tildify(p.cwd)}
        </div>
        <ErrorLine error={action.error ?? del.error} />
      </td>
      <td>
        <code className="command" title={p.command}>
          {p.command}
        </code>
        {Object.keys(p.env).length > 0 && (
          <div className="meta">
            {Object.entries(p.env)
              .map(([k, v]) => `${k}=${v}`)
              .join(" ")}
          </div>
        )}
      </td>
      <td className="mono">{p.port ?? "—"}</td>
      <td className="meta">{running ? "now" : (ago(p.lastSeen, now) ?? "never")}</td>
      <td>
        <div className="actions">
          {running ? (
            <ConfirmButton
              busy={action.busy}
              busyLabel="Stopping…"
              onConfirm={() => action.run(() => bg.call("stop", { pid: server.pid, port: server.port }))}
            >
              Stop
            </ConfirmButton>
          ) : (
            <button
              className="small primary"
              disabled={action.busy}
              onClick={() => action.run(() => bg.call("start", { profileId: p.id }))}
            >
              {action.busy ? "Starting…" : "Start"}
            </button>
          )}
          <button className="small" onClick={onLogs}>
            Logs
          </button>
          <button
            className="small"
            title={p.pinned ? "Unpin" : "Pin: keep this profile and stop auto-updating its command"}
            onClick={() => action.run(() => bg.call("profiles.upsert", { profile: { ...p, pinned: !p.pinned } }))}
          >
            {p.pinned ? "Unpin" : "Pin"}
          </button>
          <button className="small" onClick={onEdit}>
            Edit
          </button>
          <ConfirmButton
            busy={del.busy}
            busyLabel="Deleting…"
            disabled={running}
            title={running ? "Stop the server first; otherwise it's captured again on the next scan" : undefined}
            onConfirm={() => del.run(() => bg.call("profiles.delete", { profileId: p.id }))}
          >
            Delete
          </ConfirmButton>
        </div>
      </td>
    </tr>
  );
}
