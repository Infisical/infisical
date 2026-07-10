import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

import { WsMessageType } from "./web-access-types";

// Server -> client binary frame layout (see backend pam-webpage-frame-codec):
// [ts: u32 LE][w: u16 LE][h: u16 LE][...jpeg bytes]
const FRAME_HEADER_BYTES = 8;

// Throttle pointer-move messages so a fast mouse doesn't flood the socket /
// the server-side browser. The next full frame supersedes stale positions.
const MOUSE_MOVE_THROTTLE_MS = 30;

const MOUSE_BUTTONS: Record<number, "left" | "middle" | "right"> = {
  0: "left",
  1: "middle",
  2: "right"
};

type UseWebPageSessionOptions = {
  accountId: string;
  reason?: string;
  mfaSessionId?: string;
  onSessionEnd?: () => void;
};

export const useWebPageSession = ({
  accountId,
  reason,
  mfaSessionId,
  onSessionEnd
}: UseWebPageSessionOptions) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const generationRef = useRef(0);
  const lastFrameTsRef = useRef(0);
  const lastMoveSentRef = useRef(0);

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSessionEndRef = useRef(onSessionEnd);
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Map a DOM pointer event to the server browser's frame coordinate space.
  // The canvas is drawn at the frame's native size (eg 1280x720) but displayed
  // scaled, so we undo the CSS scale.
  const toFrameCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY)
    };
  }, []);

  const drawFrame = useCallback((buf: ArrayBuffer) => {
    const canvas = canvasRef.current;
    if (!canvas || buf.byteLength < FRAME_HEADER_BYTES) return;
    // Snapshot the connection generation: decode is async, so a frame from a
    // torn-down/reconnected socket must not draw onto the new session's canvas.
    const gen = generationRef.current;
    const view = new DataView(buf);
    const ts = view.getUint32(0, true);
    const w = view.getUint16(4, true);
    const h = view.getUint16(6, true);
    const jpegBytes = new Uint8Array(buf, FRAME_HEADER_BYTES);
    const blob = new Blob([jpegBytes], { type: "image/jpeg" });
    createImageBitmap(blob)
      .then((bitmap) => {
        // Drop a frame from a stale generation or one that decoded out of order
        // behind an already-drawn newer frame.
        if (gen !== generationRef.current || ts < lastFrameTsRef.current || !canvasRef.current) {
          bitmap.close();
          return;
        }
        lastFrameTsRef.current = ts;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          return;
        }
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
      })
      .catch(() => {
        /* malformed frame — skip */
      });
  }, []);

  const teardown = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
    setIsConnected(false);
  }, []);

  const handleConnectError = useCallback((err: unknown) => {
    let message = "Failed to start web page session";
    if (axios.isAxiosError(err)) {
      const apiMessage = (err.response?.data as { message?: string } | undefined)?.message;
      if (apiMessage) message = apiMessage;
    } else if (err instanceof Error && err.message) {
      message = err.message;
    }
    setError(message);
    createNotification({ type: "error", text: message });
    setIsConnected(false);
    onSessionEndRef.current?.();
  }, []);

  const connect = useCallback(async () => {
    if (!canvasRef.current) return;
    teardown();
    setError(null);
    lastFrameTsRef.current = 0;
    generationRef.current += 1;
    const gen = generationRef.current;
    const isCurrent = () => gen === generationRef.current;

    let ticket: string;
    try {
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { reason, mfaSessionId }
      );
      ticket = data.ticket;
    } catch (err) {
      handleConnectError(err);
      return;
    }
    if (!isCurrent()) return;

    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const url = `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(
      ticket
    )}`;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
      if (event.data instanceof ArrayBuffer) {
        setIsConnected(true);
        drawFrame(event.data);
        return;
      }
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data) as { type?: string; reason?: string };
          if (msg.type === WsMessageType.Ready) {
            setIsConnected(true);
          } else if (msg.type === WsMessageType.SessionEnd) {
            setIsConnected(false);
            onSessionEndRef.current?.();
            teardown();
          }
        } catch {
          /* ignore non-JSON text */
        }
      }
    };

    ws.onerror = () => {
      if (isCurrent()) setError("Connection error");
    };

    ws.onclose = () => {
      if (!isCurrent()) return;
      setIsConnected(false);
      onSessionEndRef.current?.();
    };
  }, [accountId, reason, mfaSessionId, teardown, drawFrame, handleConnectError]);

  // Attach input listeners to the canvas once it is mounted.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const sendMouse = (
      clientX: number,
      clientY: number,
      button: number,
      action: "move" | "down" | "up" | "click"
    ) => {
      const { x, y } = toFrameCoords(clientX, clientY);
      send({ type: "mouse", x, y, button: MOUSE_BUTTONS[button] ?? "left", action });
    };

    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastMoveSentRef.current < MOUSE_MOVE_THROTTLE_MS) return;
      lastMoveSentRef.current = now;
      sendMouse(e.clientX, e.clientY, e.button, "move");
    };
    const onMouseDown = (e: MouseEvent) => {
      // The server applies down/up at the current cursor position, so move first.
      sendMouse(e.clientX, e.clientY, e.button, "move");
      sendMouse(e.clientX, e.clientY, e.button, "down");
      canvas.focus();
    };
    const onMouseUp = (e: MouseEvent) => {
      sendMouse(e.clientX, e.clientY, e.button, "move");
      sendMouse(e.clientX, e.clientY, e.button, "up");
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = toFrameCoords(e.clientX, e.clientY);
      send({ type: "scroll", x, y, dx: e.deltaX, dy: e.deltaY });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      send({ type: "key", key: e.key, code: e.code, action: "down" });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      send({ type: "key", key: e.key, code: e.code, action: "up" });
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("keyup", onKeyUp);

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
    };
  }, [send, toFrameCoords]);

  useEffect(() => {
    connect().catch(handleConnectError);
    return () => {
      generationRef.current += 1;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = useCallback(() => {
    teardown();
    onSessionEndRef.current?.();
  }, [teardown]);

  const reconnect = useCallback(() => {
    connect().catch(handleConnectError);
  }, [connect, handleConnectError]);

  return {
    canvasRef,
    isConnected,
    error,
    disconnect,
    reconnect
  };
};
