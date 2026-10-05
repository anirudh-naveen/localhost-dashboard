# Privacy Policy

_Last updated: October 4, 2026_

Localhost Dashboard (the browser extension, the desktop app and the companion) runs entirely on your own
computer.

**What it accesses.** To show your development servers it reads, locally: which TCP ports are listening,
the processes behind them (command line, working directory, start time), the title of the page each local
server returns, and the URLs of browser tabs pointing at `localhost` or `127.0.0.1`. Profiles you create or
that are remembered for you, and logs of servers started from the app, are stored in
`~/.localhost-dashboard/` on your computer.

**What it collects.** Nothing. None of this information is sent anywhere: there are no analytics, no
telemetry, no accounts, and no requests to the internet. The extension only communicates with servers on
`localhost`/`127.0.0.1` and with the desktop app or companion on the same machine.

**What it changes.** It only stops, starts or restarts processes, or updates tabs, when you click a control
asking it to.

**Sharing.** No data is sold, shared or transferred to anyone.

**Contact.** Questions: open an issue on the project's GitHub repository.
