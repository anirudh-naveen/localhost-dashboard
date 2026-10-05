import { useState } from "react";
import { MovePanel } from "../ui/MovePanel";
import { useNow } from "../ui/format";
import { InstallBanner } from "../ui/InstallBanner";
import { ModePill } from "../ui/ModePill";
import { ServerRow, StoppedRow } from "../ui/rows";
import { canControl, openDashboard, profileById, stoppedProfiles } from "../ui/select";
import { useBackground } from "../ui/useBackground";

const MAX_STOPPED = 5;

export function App() {
  const bg = useBackground();
  const { state, send, call } = bg;
  const [showHidden, setShowHidden] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const now = useNow();

  const visible = state.servers.filter((s) => !s.hidden);
  const hidden = state.servers.filter((s) => s.hidden);
  const rows = showHidden ? [...visible, ...hidden] : visible;
  const profiles = profileById(state);
  const stopped = stoppedProfiles(state);
  const controllable = canControl(state.mode);
  const movingProfile = moving ? profiles.get(moving) : undefined;
  const movingServer = state.servers.find((s) => moving && s.profileId === moving);

  return (
    <div className="app">
      <header>
        <h1>Localhost</h1>
        <ModePill mode={state.mode} />
        <button className="icon" title="Refresh" onClick={() => send({ type: "refresh" })}>
          ↻
        </button>
        <button className="icon" title="Open dashboard" onClick={() => void openDashboard()}>
          ⧉
        </button>
      </header>

      {state.mode === "probe" && <InstallBanner error={state.hostError} />}

      {movingProfile ? (
        // Inline rather than a modal: a short popup would clip a dialog.
        <div className="scroll">
          <MovePanel
            profile={movingProfile}
            server={movingServer}
            tabCount={movingServer ? (state.tabs[movingServer.port]?.length ?? 0) : 0}
            bg={bg}
            onDone={() => setMoving(null)}
            onCancel={() => setMoving(null)}
          />
        </div>
      ) : (
        <div className="scroll">
          {rows.length === 0 ? (
            <p className="empty">
              {state.mode === "connecting" ? "Looking for servers…" : "No servers running on localhost."}
            </p>
          ) : (
            <ul className="list">
              {rows.map((s) => (
                <ServerRow
                  key={`${s.pid}:${s.port}`}
                  server={s}
                  profile={s.profileId ? profiles.get(s.profileId) : undefined}
                  now={now}
                  tabCount={state.tabs[s.port]?.length ?? 0}
                  canControl={controllable}
                  onOpen={() => send({ type: "open", port: s.port })}
                  onStop={() => call("stop", { pid: s.pid, port: s.port, containerId: s.container?.id })}
                  onMove={s.profileId ? () => setMoving(s.profileId!) : undefined}
                />
              ))}
            </ul>
          )}

          {stopped.length > 0 && (
            <>
              <h2 className="section">Stopped</h2>
              <ul className="list">
                {stopped.slice(0, MAX_STOPPED).map((p) => (
                  <StoppedRow key={p.id} profile={p} now={now} onStart={() => call("start", { profileId: p.id })} />
                ))}
              </ul>
              {stopped.length > MAX_STOPPED && (
                <button className="link more" onClick={() => void openDashboard()}>
                  {stopped.length - MAX_STOPPED} more in the dashboard →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!movingProfile && hidden.length > 0 && (
        <footer>
          <button className="link" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? "Hide" : "Show"} {hidden.length} system/app listener{hidden.length === 1 ? "" : "s"}
          </button>
        </footer>
      )}
    </div>
  );
}
