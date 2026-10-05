import { start } from "./app.js";

start().catch((e) => {
  // A second launch just focuses the running instance.
  if ((e as Error).message !== "already running") console.error(e);
});
