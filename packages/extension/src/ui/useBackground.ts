import type { HostMethods } from "@ld/shared";
import { useEffect, useRef, useState } from "react";
import { UI_PORT, type BgToUi, type State, type UiMethod, type UiToBg } from "../messages";

type Result = Extract<BgToUi, { type: "result" }>;

/** Connects a UI page to the background worker; holding the port open keeps the companion connected. */
export function useBackground() {
  const [state, setState] = useState<State>({ mode: "connecting", servers: [], profiles: [], tabs: {} });
  const portRef = useRef<chrome.runtime.Port>(undefined);
  const pending = useRef(new Map<number, (r: Result) => void>());
  const nextId = useRef(1);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: UI_PORT });
    portRef.current = port;
    port.onMessage.addListener((msg: BgToUi) => {
      if (msg.type === "state") setState(msg.state);
      else {
        pending.current.get(msg.reqId)?.(msg);
        pending.current.delete(msg.reqId);
      }
    });
    return () => port.disconnect();
  }, []);

  const send = (msg: UiToBg) => portRef.current?.postMessage(msg);

  /** Call a companion method; rejects with the companion's error message. */
  function call<M extends UiMethod>(method: M, params: HostMethods[M]["params"]): Promise<HostMethods[M]["result"]> {
    return new Promise((resolve, reject) => {
      const reqId = nextId.current++;
      pending.current.set(reqId, (r) => (r.ok ? resolve(r.result as HostMethods[M]["result"]) : reject(new Error(r.error))));
      send({ type: "host", reqId, method, params });
    });
  }

  return { state, send, call };
}

export type Background = ReturnType<typeof useBackground>;
