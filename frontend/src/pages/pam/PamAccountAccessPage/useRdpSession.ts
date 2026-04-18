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
 * - Canvas receives server-rendered frames via `renderCanvas`; input is
 *   NOT auto-captured — we attach DOM handlers and forward keyboard /
 *   mouse events through `session.applyInputs(...)`.
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

import wasmInit, {
  DeviceEvent,
  InputTransaction,
  IronError,
  IronErrorKind,
  SessionBuilder,
  setup as wasmSetup
} from "@app/lib/ironrdp-web/ironrdp_web";
import { apiRequest } from "@app/config/request";

import { codeToScancode } from "./rdpScancodes";

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

type ApplyInputs = { applyInputs: (tx: InputTransaction) => void };

const attachInputHandlers = (canvas: HTMLCanvasElement | null, session: ApplyInputs) => {
  if (!canvas) return () => {};

  const apply = (ev: DeviceEvent) => {
    // applyInputs consumes the transaction internally (destroys the Rust
    // handle), so we must NOT call tx.free() afterwards -- that would
    // deref a null ptr and throw.
    const tx = new InputTransaction();
    try {
      tx.addEvent(ev);
      session.applyInputs(tx);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[rdp] applyInputs failed", err);
    }
  };

  const canvasCoords = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    // Canvas intrinsic size vs displayed size: scale back to intrinsic so
    // mouse coords match what the server rendered (1920x1080 buffer).
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY)
    };
  };

  // DOM e.button: 0=left, 1=middle, 2=right.
  // IronRDP's MouseButton (inferred from common RDP client conventions):
  // 0=left, 1=right, 2=middle. Swap the DOM values to match.
  const domToIronRdpButton = (b: number): number => {
    if (b === 1) return 2;
    if (b === 2) return 1;
    return b;
  };

  const onMouseDown = (e: MouseEvent) => {
    canvas.focus();
    const btn = domToIronRdpButton(e.button);
    const { x, y } = canvasCoords(e);
    // eslint-disable-next-line no-console
    console.log("[rdp] mousedown", { domBtn: e.button, ironBtn: btn, x, y });
    apply(DeviceEvent.mouseMove(x, y));
    apply(DeviceEvent.mouseButtonPressed(btn));
    e.preventDefault();
  };
  const onMouseUp = (e: MouseEvent) => {
    const btn = domToIronRdpButton(e.button);
    // eslint-disable-next-line no-console
    console.log("[rdp] mouseup", { domBtn: e.button, ironBtn: btn });
    apply(DeviceEvent.mouseButtonReleased(btn));
    e.preventDefault();
  };
  const onMouseMove = (e: MouseEvent) => {
    const { x, y } = canvasCoords(e);
    apply(DeviceEvent.mouseMove(x, y));
  };
  const onContextMenu = (e: Event) => {
    // Suppress the browser's right-click menu so it can reach Windows.
    e.preventDefault();
  };
  const onWheel = (e: WheelEvent) => {
    // RotationUnit values: 0 = WHEEL_DELTA (120 units/notch), 1 = PIXEL.
    // deltaY in pixels; forward as PIXEL and let the server translate.
    apply(DeviceEvent.wheelRotations(true, -Math.round(e.deltaY), 1));
    if (e.deltaX !== 0) {
      apply(DeviceEvent.wheelRotations(false, Math.round(e.deltaX), 1));
    }
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const scancode = codeToScancode(e.code);
    if (scancode !== undefined) {
      apply(DeviceEvent.keyPressed(scancode));
      e.preventDefault();
      return;
    }
    // Fallback: forward Unicode for unmapped printable keys.
    if (e.key.length === 1) {
      apply(DeviceEvent.unicodePressed(e.key));
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const scancode = codeToScancode(e.code);
    if (scancode !== undefined) {
      apply(DeviceEvent.keyReleased(scancode));
      e.preventDefault();
      return;
    }
    if (e.key.length === 1) {
      apply(DeviceEvent.unicodeReleased(e.key));
      e.preventDefault();
    }
  };

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);

  return () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKeyDown);
    canvas.removeEventListener("keyup", onKeyUp);
  };
};

export const useRdpSession = ({
  accountId,
  projectId,
  onSessionEnd
}: UseRdpSessionOptions) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<unknown>(null);
  // Guard against React StrictMode's double-invocation of effects in dev:
  // each connect() fetches a single-use web-access ticket, so running
  // twice burns the first ticket and the second run gets "Invalid token".
  const hasStartedRef = useRef(false);
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
      if (!canvasRef.current) {
        // eslint-disable-next-line no-console
        console.warn("[rdp] canvas ref not ready");
        return;
      }

      // eslint-disable-next-line no-console
      console.log("[rdp] fetching web-access ticket");
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { projectId }
      );

      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const proxyAddress = `${wsProtocol}://${window.location.host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(data.ticket)}`;

      // eslint-disable-next-line no-console
      console.log("[rdp] opening SessionBuilder against", proxyAddress);

      const builder = new SessionBuilder();
      builder
        .username("infisical")
        .password("infisical")
        .destination("target:3389")
        .proxyAddress(proxyAddress)
        .authToken(data.ticket)
        .renderCanvas(canvasRef.current)
        // Required callbacks. No-op implementations are fine for POC;
        // wire these to real behavior later.
        .setCursorStyleCallback(() => {})
        .setCursorStyleCallbackContext(null)
        .remoteClipboardChangedCallback(() => {})
        .forceClipboardUpdateCallback(() => {})
        .canvasResizedCallback(() => {});

      const session = await builder.connect();
      // eslint-disable-next-line no-console
      console.log("[rdp] session connected, entering run()");
      sessionRef.current = session;
      setIsConnected(true);

      const detachInput = attachInputHandlers(
        canvasRef.current,
        session as unknown as { applyInputs: (tx: InputTransaction) => void }
      );

      try {
        const info = await session.run();
        // eslint-disable-next-line no-console
        console.log("[rdp] session ended:", info.reason());
      } finally {
        detachInput();
        setIsConnected(false);
        sessionRef.current = null;
        onSessionEnd?.();
      }
    } catch (err) {
      if (err instanceof IronError) {
        const kindName = IronErrorKind[err.kind()] ?? String(err.kind());
        // eslint-disable-next-line no-console
        console.error(`[rdp] IronError kind=${kindName}`);
        try {
          // eslint-disable-next-line no-console
          console.error("[rdp] backtrace:\n" + err.backtrace());
        } catch {
          /* backtrace might throw if already freed */
        }
        try {
          const rdcp = err.rdcleanpathDetails();
          if (rdcp) {
            // eslint-disable-next-line no-console
            console.error("[rdp] rdcleanpath details:", {
              httpStatusCode: rdcp.httpStatusCode,
              wsaErrorCode: rdcp.wsaErrorCode,
              tlsAlertCode: rdcp.tlsAlertCode
            });
          }
        } catch {
          /* details might throw */
        }
      } else {
        // eslint-disable-next-line no-console
        console.error("[rdp] connect failed:", err);
      }
      setIsConnected(false);
      onSessionEnd?.();
    }
  }, [accountId, projectId, onSessionEnd]);

  const reconnect = useCallback(() => {
    disconnect();
    hasStartedRef.current = true;
    void connect();
  }, [disconnect, connect]);

  useEffect(() => {
    if (hasStartedRef.current) return undefined;
    hasStartedRef.current = true;
    void connect();
    return () => {
      disconnect();
    };
    // connect/disconnect are stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { canvasRef, isConnected, disconnect, reconnect };
};
