import { useState } from "react";
import { useNow } from "../ui/format";
import { InstallBanner } from "../ui/InstallBanner";
import { ServerRow, StoppedRow } from "../ui/rows";
import { openDashboard, profileById, stoppedProfiles } from "../ui/select";
import { useBackground } from "../ui/useBackground";

const MAX_STOPPED = 5;

export function App() {
  const { state, send, call } = useBackground();
  const [showHidden, setShowHidden] = useState(false);
  const now = useNow();

  const visible = state.servers.filter((s) => !s.hidden);
  const hidden = state.servers.filter((s) => s.hidden);
  const rows = showHidden ? [...visible, ...hidden] : visible;
  const profiles = profileById(state);
  const stopped = stoppedProfiles(state);
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
        <button className="icon" title="Open dashboard" onClick={() => void openDashboard()}>
          ⧉
        </button>
      </header>

      {state.mode === "probe" && <InstallBanner error={state.hostError} />}

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
                canControl={canControl}
                onOpen={() => send({ type: "open", port: s.port })}
                onStop={() => call("stop", { pid: s.pid, port: s.port })}
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
