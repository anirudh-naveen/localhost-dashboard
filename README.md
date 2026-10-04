# localhost-dashboard

Find, stop, start and re-port the dev servers running on `localhost`.

A Chrome extension (UI + tab integration) talks over Native Messaging to a small
companion process that does the OS work (listing listeners, signalling processes).
Without the companion the extension falls back to probing common ports, read-only.

## Packages

| Package | What |
| --- | --- |
| `packages/shared` | Protocol types shared by the extension and the companion |
| `packages/core` | Discovery (`lsof`/`ps`) and process control; reusable by a future desktop app |
| `packages/host` | Native Messaging companion + installer |
| `packages/extension` | MV3 extension: popup, badge, probe fallback |

## Develop

```bash
npm install
npm run build
npm test
```

## Load the extension

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick
   `packages/extension/dist`.

The manifest pins a public `key`, so the extension ID is always
`kgmeaiohbiopoacdedgpmchjbkbmdfig`, which is what the companion installer allows by default.
After rebuilding, click the reload icon on the extension card.

## Install the companion

```bash
npm run build
npm run install-host
```

This writes `com.localhost_dashboard.host.json` into each installed Chromium browser's
`NativeMessagingHosts` directory (Chrome, Brave, Edge, Arc, Vivaldi…) and a launcher at
`~/.localhost-dashboard/host.sh` that pins the current `node` binary. Pass
`-- --extension-id <id>` to allow a different extension ID; `npm run uninstall-host` removes it.
