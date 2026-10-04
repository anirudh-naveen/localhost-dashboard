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
| `packages/host` | Native Messaging companion + installer *(in progress)* |
| `packages/extension` | MV3 extension *(in progress)* |

## Develop

```bash
npm install
npm run build
npm test
```
