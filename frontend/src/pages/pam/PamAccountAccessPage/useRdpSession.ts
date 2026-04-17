/**
 * useRdpSession
 *
 * Phase 4 scaffold (browser-side RDP client). The shape mirrors
 * useWebAccessSession so PamAccountAccessPage can swap components based
 * on resource type without changing the surrounding chrome.
 *
 * STATE: skeleton only. Opens the WebSocket using the existing
 * web-access-ticket flow, but the actual RDP protocol handling requires
 * an IronRDP WASM client that isn't yet vendored. Points marked
 * TODO(phase4) are the remaining integration work.
 *
 * To fully wire this up someone needs to:
 *   1. Build ironrdp-web from source (cargo xtask web build inside the
 *      Devolutions/IronRDP repo) and vendor the .wasm + .js artifacts into
 *      frontend/public/ironrdp-web/ or publish an internal npm package.
 *   2. Replace the TODO(phase4) block below with construction of the
 *      WASM client, binding it to canvasRef, and piping WS messages into
 *      its input/output handlers.
 *   3. Adjust the backend web-access WebSocket bridge so RDP sessions
 *      carry raw bytes (not the SSH-style JSON message envelope). Today
 *      the server wraps everything in { type: "output", data }; for RDP
 *      the data should be raw binary or base64-encoded bytes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "@app/config/request";

type UseRdpSessionOptions = {
  accountId: string;
  projectId: string;
  orgId: string;
  resourceName: string;
  accountName: string;
  onSessionEnd?: () => void;
};

export const useRdpSession = ({
  accountId,
  projectId,
  onSessionEnd
}: UseRdpSessionOptions) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    try {
      // Reuse the existing web-access ticket endpoint. Backend gates
      // Windows access here; we removed the guard as part of Phase 3.
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { projectId }
      );

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(
        data.ticket
      )}`;

      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        // TODO(phase4): once the IronRDP WASM client is vendored, hand
        // it the WebSocket + canvas here. Until then the WS stays open
        // as a smoke test: we log messages but can't drive RDP.
        setIsConnected(true);
      });

      ws.addEventListener("message", (_event) => {
        // TODO(phase4): feed event.data into the IronRDP WASM client.
      });

      ws.addEventListener("close", () => {
        wsRef.current = null;
        setIsConnected(false);
        onSessionEnd?.();
      });

      ws.addEventListener("error", () => {
        setIsConnected(false);
      });
    } catch {
      setIsConnected(false);
      onSessionEnd?.();
    }
  }, [accountId, projectId, onSessionEnd]);

  const reconnect = useCallback(() => {
    disconnect();
    void connect();
  }, [disconnect, connect]);

  useEffect(() => {
    void connect();
    return () => {
      disconnect();
    };
    // connect/disconnect are stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { canvasRef, isConnected, disconnect, reconnect };
};
