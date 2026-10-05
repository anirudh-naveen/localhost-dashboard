import { useState } from "react";
import { INSTALL_CMD } from "./format";

export function InstallBanner({ error }: { error?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="banner">
      <p>Showing common ports only. Install the companion to see every server, stop and start them. In the repo, run:</p>
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
