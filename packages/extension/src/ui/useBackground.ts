import type { HostMethods } from "@ld/shared";
import { useEffect, useRef, useState } from "react";
import { UI_PORT, type BgToUi, type MoveParams, type State, type UiMethod, type UiToBg } from "../messages";
import { desktop, ext } from "../ext";

type Result = Extract<BgToUi, { type: "result" }>;

/**
 * Connects a UI page to its backend: the extension's background worker (holding the
 * port open keeps the companion connected) or, in the desktop app, the main process.
 */
export function useBackground() {
  const [state, setState] = useState<State>({ mode: "connecting", servers: [], profiles: [], tabs: {} });
  const portRef = useRef<{ postMessage(msg: UiToBg): void }>(undefined);
  const pending = useRef(new Map<number, (r: Result) => void>());
  const nextId = useRef(1);

  useEffect(() => {
    const onMessage = (msg: BgToUi) => {
      if (msg.type === "state") setState(msg.state);
      else {
        pending.current.get(msg.reqId)?.(msg);
        pending.current.delete(msg.reqId);
      }
    };
    if (desktop) {
      const bridge = desktop;
      portRef.current = { postMessage: (msg) => bridge.send(msg) };
      return bridge.connect(onMessage);
    }
    const port = ext.runtime.connect({ name: UI_PORT });
    portRef.current = port;
    port.onMessage.addListener(onMessage);
    return () => port.disconnect();
  }, []);

  const send = (msg: UiToBg) => portRef.current?.postMessage(msg);

  function request<T>(build: (reqId: number) => UiToBg): Promise<T> {
    return new Promise((resolve, reject) => {
      const reqId = nextId.current++;
      pending.current.set(reqId, (r) => (r.ok ? resolve(r.result as T) : reject(new Error(r.error))));
      send(build(reqId));
    });
  }

  /** Call a companion method; rejects with the companion's error message. */
  const call = <M extends UiMethod>(method: M, params: HostMethods[M]["params"]) =>
    request<HostMethods[M]["result"]>((reqId) => ({ type: "host", reqId, method, params }));

  /** Move a profile to a new port, optionally retargeting open tabs. */
  const move = (params: MoveParams) =>
    request<HostMethods["move"]["result"]>((reqId) => ({ type: "move", reqId, params }));

  return { state, send, call, move };
}

export type Background = ReturnType<typeof useBackground>;
