import { useEffect, useState } from "react";
import { ext } from "../ext";
import { INSTALL_CMD } from "./format";

const LOCAL_ORIGINS = ["http://localhost/*", "http://127.0.0.1/*"];
const IS_SAFARI = !!ext?.runtime.getURL("").startsWith("safari-web-extension:");

/** Firefox MV3 treats host permissions as opt-in; without them detect-only probing finds nothing. */
function useHostAccess(): [boolean, () => void] {
  const [granted, setGranted] = useState(true);
  useEffect(() => {
    ext.permissions.contains({ origins: LOCAL_ORIGINS }).then(setGranted, () => {});
  }, []);
  const request = () => ext.permissions.request({ origins: LOCAL_ORIGINS }).then(setGranted, () => {});
  return [granted, request];
}

export function InstallBanner({ error }: { error?: string }) {
  const [copied, setCopied] = useState(false);
  const [hostAccess, requestHostAccess] = useHostAccess();
  return (
    <div className="banner">
      {!hostAccess && (
        <p>
          <button className="small primary" onClick={requestHostAccess}>
            Allow access to localhost
          </button>{" "}
          so common ports can be checked.
        </p>
      )}
      {IS_SAFARI ? (
        <p>
          Showing common ports only. Open the <strong>Localhost Dashboard</strong> app to see every server, stop and
          start them; Safari connects to it automatically (you'll be asked to allow it once).
        </p>
      ) : (
        <p>
          Showing common ports only. Open the <strong>Localhost Dashboard</strong> app, or install the companion to see
          every server, stop and start them. For the companion, in the repo run:
        </p>
      )}
      {!IS_SAFARI && (
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
      )}
      <p className="muted">Then click ↻. {error && <span title={error}>({error})</span>}</p>
    </div>
  );
}
