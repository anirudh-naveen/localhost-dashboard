import type { Profile } from "@ld/shared";
import { useEffect, useRef, useState } from "react";
import { stripAnsi } from "../ui/ansi";
import { tildify } from "../ui/format";
import type { Background } from "../ui/useBackground";

const POLL_MS = 1500;

interface Props {
  profile: Profile;
  running: boolean;
  call: Background["call"];
  onClose: () => void;
}

/** Tails the profile's log file. Only servers started from the dashboard write one. */
export function LogViewer({ profile, running, call, onClose }: Props) {
  const [text, setText] = useState<string>();
  const [path, setPath] = useState<string>();
  const [error, setError] = useState<string>();
  const preRef = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setText(undefined);
    const tick = async () => {
      try {
        const r = await call("logs.tail", { profileId: profile.id });
        if (cancelled) return;
        setText(stripAnsi(r.text));
        setPath(r.path);
        setError(undefined);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // `call` is recreated each render but behaves the same; only re-subscribe per profile.
  }, [profile.id]);

  // Follow the tail unless the user scrolled up.
  useEffect(() => {
    const el = preRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <aside className="logs">
      <div className="logs-head">
        <div>
          <strong>{profile.name}</strong> <span className="muted">logs</span>
          {path && (
            <div className="meta mono" title={path}>
              {tildify(path)}
            </div>
          )}
        </div>
        <button className="icon" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <pre
        ref={preRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {text === undefined
          ? "Loading…"
          : text ||
            (running
              ? "No output captured. Logs are only recorded for servers started from here; this one was started elsewhere."
              : "No output yet. Start the profile to capture its logs.")}
      </pre>
    </aside>
  );
}
