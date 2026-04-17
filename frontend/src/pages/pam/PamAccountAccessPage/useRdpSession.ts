/**
 * useRdpSession
 *
 * Hooks up the vendored ironrdp-web WASM client to a canvas and the
 * backend's web-access WebSocket endpoint.
 *
 * ### Status
 *
 * - WASM vendored at `@app/lib/ironrdp-web` and initialized below.
 * - SessionBuilder wired up with credentials + proxy address + canvas.
 * - RDP input (keyboard/mouse/resize) is handled internally by the WASM
 *   client once `renderCanvas` is set. We don't wire events ourselves.
 *
 * ### Still TODO for a fully working browser session
 *
 * 1. The WASM client speaks **RDCleanPath** over the WebSocket (not raw
 *    RDP). Our backend's web-access WS endpoint currently forwards raw
 *    bytes from the gateway in either a JSON envelope (SSH/DB) or as
 *    opaque passthrough. Neither is RDCleanPath. The backend needs a
 *    RDCleanPath-speaking branch for Windows resources: receive the
 *    ASN.1-encoded RDCleanPathPdu request from the WASM, return a
 *    matching response with the target's cert chain, then pipe raw RDP
 *    bytes through in both directions.
 *
 *    Reference implementation: IronRDP's `ironrdp-rdcleanpath` crate.
 *
 * 2. Credentials are currently fetched out-of-band. The WASM client
 *    wants them passed directly into SessionBuilder. In our architecture
 *    the backend handles creds -- we never want the frontend to see
 *    them. For the POC we pass dummy placeholders matching what the
 *    acceptor-side capability negotiation expects (see gateway
 *    bridge.rs). The real injection happens on the gateway's connector
 *    side.
 *
 * 3. Error surface: the WASM throws `IronError` subclasses with specific
 *    `kind()` values we should map to user-friendly messages.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import wasmInit, { SessionBuilder, setup as wasmSetup } from "@app/lib/ironrdp-web/ironrdp_web";
import { apiRequest } from "@app/config/request";

type UseRdpSessionOptions = {
  accountId: string;
  projectId: string;
  orgId: string;
  resourceName: string;
  accountName: string;
  onSessionEnd?: () => void;
};

// Module-level guard so we only init the WASM once per page.
let wasmReady: Promise<void> | null = null;
const ensureWasm = () => {
  if (!wasmReady) {
    wasmReady = (async () => {
      await wasmInit();
      wasmSetup("info");
    })();
  }
  return wasmReady;
};

export const useRdpSession = ({
  accountId,
  projectId,
  onSessionEnd
}: UseRdpSessionOptions) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<unknown>(null);
  const [isConnected, setIsConnected] = useState(false);

  const disconnect = useCallback(() => {
    const session = sessionRef.current as { shutdown?: () => void; free?: () => void } | null;
    try {
      session?.shutdown?.();
    } catch {
      // Shutdown on an already-dead session is fine.
    }
    sessionRef.current = null;
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    try {
      await ensureWasm();
      if (!canvasRef.current) return;

      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { projectId }
      );

      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      // NOTE: the backend endpoint here must speak RDCleanPath for the
      // WASM client to work. Currently a scaffold; see module-doc TODOs.
      const proxyAddress = `${wsProtocol}://${window.location.host}/api/v1/pam/accounts/${accountId}/web-access`;

      const builder = new SessionBuilder();
      builder
        .username("infisical-placeholder")
        .password("infisical-placeholder")
        .destination("target:3389")
        .proxyAddress(proxyAddress)
        .authToken(data.ticket)
        .renderCanvas(canvasRef.current);

      const session = await builder.connect();
      sessionRef.current = session;
      setIsConnected(true);

      try {
        await session.run();
      } finally {
        setIsConnected(false);
        sessionRef.current = null;
        onSessionEnd?.();
      }
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
