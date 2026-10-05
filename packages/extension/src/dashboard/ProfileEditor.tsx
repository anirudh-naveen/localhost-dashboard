import type { ProfileInput } from "@ld/shared";
import { useEffect, useRef, useState } from "react";
import { ErrorLine } from "../ui/rows";

interface Props {
  initial: ProfileInput;
  onCancel: () => void;
  onSave: (p: ProfileInput) => Promise<void>;
}

function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function textToEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) throw new Error(`Bad env line: ${t}`);
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

export function ProfileEditor({ initial, onCancel, onSave }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial.name);
  const [command, setCommand] = useState(initial.command);
  const [cwd, setCwd] = useState(initial.cwd);
  const [port, setPort] = useState(initial.port?.toString() ?? "");
  const [env, setEnv] = useState(envToText(initial.env));
  const [pinned, setPinned] = useState(initial.pinned);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => dialogRef.current?.showModal(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSaving(true);
    try {
      await onSave({
        id: initial.id,
        name,
        command,
        cwd: cwd.trim(),
        port: port.trim() ? Number(port) : undefined,
        env: textToEnv(env),
        pinned,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="editor" onCancel={onCancel}>
      <form onSubmit={submit}>
        <h2>{initial.id ? "Edit profile" : "New profile"}</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          Command
          <input
            className="mono"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="npm run dev"
            required
          />
          <span className="hint">Runs with your login shell, so aliases from your PATH work.</span>
        </label>
        <label>
          Working directory
          <input
            className="mono"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="/Users/you/projects/app"
            required
          />
        </label>
        <label>
          Port
          <input
            className="mono"
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
            placeholder="3000"
            inputMode="numeric"
          />
          <span className="hint">Start waits for this port to listen, and the running server is matched by it.</span>
        </label>
        <label>
          Environment
          <textarea
            className="mono"
            rows={3}
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            placeholder={"NODE_ENV=development\nAPI_URL=http://localhost:5001"}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pinned
        </label>
        <ErrorLine error={error} />
        <div className="editor-actions">
          <button type="button" className="small" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="small primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
