// Sandboxed preload (must be CommonJS): exposes the UI bridge the extension pages use
// in place of a runtime port. See DesktopBridge in @ld/shared.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ldDesktop", {
  connect(onMessage) {
    const handler = (_event, msg) => onMessage(msg);
    ipcRenderer.on("ld:msg", handler);
    ipcRenderer.send("ld:connect");
    return () => ipcRenderer.removeListener("ld:msg", handler);
  },
  send(msg) {
    ipcRenderer.send("ld:send", msg);
  },
  openDashboard() {
    ipcRenderer.send("ld:open-dashboard");
  },
});

// Report content height so the frameless popup can fit it.
window.addEventListener("DOMContentLoaded", () => {
  new ResizeObserver(() => ipcRenderer.send("ld:height", document.body.scrollHeight)).observe(document.body);
});
