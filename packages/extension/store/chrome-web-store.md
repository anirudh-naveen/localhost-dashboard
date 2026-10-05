# Chrome Web Store listing

Copy-paste source for the Developer Dashboard. Upload `release/localhost-dashboard-chrome-<version>.zip`
(`npm run package:chrome -w @ld/extension`). Graphics in this folder are regenerated with
`electron packages/extension/store/make-assets.mjs`.

## Store listing tab

**Name** (from the manifest): Localhost Dashboard

**Summary** (from the manifest, ≤132 chars): See, open and stop the dev servers running on localhost.

**Category:** Developer Tools  **Language:** English

**Description:**

```
Localhost Dashboard shows every development server running on your computer: which port it's on, what it is (Vite, Next.js, Django, Rails, Docker…), which project folder it came from, and whether you already have it open in a tab.

From the toolbar popup you can:
• Open a server, or jump to the tab that already has it open
• Stop a server, even one started in a terminal you've since lost (npm/pnpm/yarn wrappers are stopped too)
• Start it again later: servers you run are remembered as profiles automatically
• Move a server to another port: the command is rewritten for you (Vite, Next, Django, Rails, Python http.server, Docker Compose…), the server restarts there, and your open tabs follow

The dashboard page adds editable profiles (command, folder, port, environment), pinning, and live logs for servers started from it.

HOW IT WORKS
Browsers can't see or control other programs, so the extension has two modes:
• On its own, it checks common development ports and shows what's there (read-only).
• With the free Localhost Dashboard desktop app (macOS) or the open-source companion, it sees every server and can stop, start and move them.

PRIVACY
Everything stays on your computer. The extension only talks to localhost and to the desktop app or companion on your own machine. It collects no data, has no analytics, and makes no requests to the internet.
```

**Graphics**
- Store icon: `../public/icons/icon-128.png`
- Screenshots (1280×800): `screenshot-1-dashboard.png`, `screenshot-2-popup.png`, `screenshot-3-move.png`
- Small promo tile (440×280): `promo-small.png`

## Privacy practices tab

**Single purpose:**

```
Show the development servers running on the user's own computer (localhost) and let the user open, stop, start and re-port them.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `nativeMessaging` | Connects to the optional Localhost Dashboard companion that the user installs on their own computer. The companion lists listening TCP ports and, only when the user clicks Stop/Start/Move, stops or starts the corresponding local process. Nothing is sent off the device. |
| `tabs` | Reads the URLs of open tabs to show which local servers already have a tab, to switch to that tab instead of opening a duplicate, and to point those tabs at the new port after the user moves a server. Only localhost/127.0.0.1 URLs are acted on. |
| `alarms` | Refreshes the toolbar badge (number of running servers) once a minute. |
| Host permission `http://localhost/*`, `http://127.0.0.1/*` | Checks common development ports to detect running servers and read their page titles, and connects to the Localhost Dashboard desktop app's local API on 127.0.0.1. No other sites are accessed. |

**Remote code:** No, I am not using remote code. (All JavaScript is in the package; nothing is downloaded or evaluated at runtime.)

**Data usage:** tick none of the data types. Then certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL** (works once the repository is pushed and public):
`https://github.com/anirudh-naveen/localhost-dashboard/blob/main/PRIVACY.md`

## Distribution tab

- Visibility: **Unlisted** for a first release (installable by link, not searchable) or **Public**
- Regions: all
- Pricing: free

## After approval

The store assigns a new extension ID (and key). Update `EXTENSION_ID` in `packages/shared/src/protocol.ts`
and the manifest `key` (Package tab → "View public key") so unpacked dev builds share the store ID and the
companion installer allows it.
