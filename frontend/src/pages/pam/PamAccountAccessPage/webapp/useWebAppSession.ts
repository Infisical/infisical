import { useCallback, useEffect, useRef, useState } from "react";

import { createWebAppAttachTicket } from "@app/hooks/api/pam/web-app-sessions/mutations";

import {
  encodeWebAppMessage,
  isCurrentWebAppFrame,
  parseWebAppFrame,
  remoteCoordinates
} from "./web-app-protocol";

export type TRemoteSurface = { surfaceSeq: number; url: string; title: string };
export type TRemoteDialog = {
  surfaceSeq: number;
  dialogSeq: number;
  type: string;
  message: string;
  defaultPrompt?: string;
};
const modifiers = (event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}) =>
  Number(event.altKey) +
  Number(event.ctrlKey) * 2 +
  Number(event.metaKey) * 4 +
  Number(event.shiftKey) * 8;
export const useWebAppSession = (sessionId: string | undefined, live: boolean) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keyboardRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const endButtonRef = useRef<HTMLButtonElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sequence = useRef(0);
  const current = useRef({ surfaceSeq: 1, viewportGen: -1, controllerGen: -1 });
  const viewport = useRef({ width: 1280, height: 720 });
  const pendingViewport = useRef(0);
  const readyRef = useRef(false);
  const latestFrame = useRef(0);
  const lastRendered = useRef<
    { surfaceSeq: number; viewportGen: number; controllerGen: number } | undefined
  >(undefined);
  const decodeGeneration = useRef(0);
  const recordingFailed = useRef(false);
  const lastMove = useRef(0);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState("preparing-browser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<string>();
  const [surfaces, setSurfaces] = useState<TRemoteSurface[]>([]);
  const [activeSurface, setActiveSurface] = useState(1);
  const [dialog, setDialog] = useState<TRemoteDialog>();
  const [blocked, setBlocked] = useState<string[]>([]);
  const [recordingHealth, setRecordingHealth] = useState<{ ok: boolean; at: number }>();
  const [lastFrameAt, setLastFrameAt] = useState<number>();
  const [attempt, setAttempt] = useState({ id: 0, takeControl: false });
  const gate = useCallback((value: boolean) => {
    readyRef.current = value;
    setReady(value);
  }, []);
  const sendControl = useCallback((t: string, details: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return 0;
    sequence.current += 1;
    const seq = sequence.current;
    socket.send(
      encodeWebAppMessage("control", { t, ...(t !== "ping" ? { seq } : {}), ...details })
    );
    return seq;
  }, []);
  const resize = useCallback(() => {
    const container = containerRef.current;
    if (!container || !socketRef.current || current.current.controllerGen < 0) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(320, Math.min(3840, Math.floor(rect.width)));
    const height = Math.max(240, Math.min(2400, Math.floor(rect.height)));
    gate(false);
    viewport.current = { width, height };
    pendingViewport.current = sendControl("viewport", {
      width,
      height,
      dpr: Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    });
  }, [gate, sendControl]);
  useEffect(() => {
    if (!sessionId || !live) return undefined;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let socket: WebSocket | undefined;
    let fatal = false;
    const connect = async (takeControl: boolean) => {
      gate(false);
      current.current.controllerGen = -1;
      current.current.viewportGen = -1;
      setError(undefined);
      setErrorCode(undefined);
      setBusy(false);
      try {
        const ticket = await createWebAppAttachTicket(sessionId, takeControl);
        if (disposed) return;
        const url = new URL(
          `/api/v1/pam/web-app-sessions/${sessionId}/attach`,
          window.location.origin
        );
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.searchParams.set("ticket", ticket);
        socket = new WebSocket(url);
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;
        sequence.current = 0;
        socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          if (disposed) return;
          try {
            const message = parseWebAppFrame(event.data);
            if (message.type === "frame") {
              decodeGeneration.current += 1;
              const generation = decodeGeneration.current;
              if (
                message.surfaceSeq !== current.current.surfaceSeq ||
                message.controllerGen !== current.current.controllerGen
              )
                return;
              createImageBitmap(new Blob([message.jpeg], { type: "image/jpeg" }))
                .then((bitmap) => {
                  if (disposed || generation !== decodeGeneration.current || !canvasRef.current) {
                    bitmap.close();
                    return;
                  }
                  if (bitmap.width !== message.width || bitmap.height !== message.height) {
                    bitmap.close();
                    throw new Error("Invalid browser image dimensions");
                  }
                  const canvas = canvasRef.current;
                  canvas.width = message.width;
                  canvas.height = message.height;
                  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
                  bitmap.close();
                  lastRendered.current = message;
                  const now = Date.now();
                  latestFrame.current = now;
                  setLastFrameAt(now);
                  if (
                    !recordingFailed.current &&
                    !pendingViewport.current &&
                    isCurrentWebAppFrame(message, current.current)
                  )
                    gate(true);
                })
                .catch(() => {
                  setError("The browser image could not be displayed.");
                  gate(false);
                });
              return;
            }
            const { data } = message;
            if (data.t === "attached") {
              current.current.controllerGen = Number(data.controllerGen);
              setConnected(true);
              setBusy(false);
              recordingFailed.current = false;
              resize();
            } else if (data.t === "phase") {
              setPhase(String(data.phase));
              if (data.phase === "opening-app" || data.phase === "ready") resize();
            } else if (data.t === "surfaces") {
              const active = Number(data.active);
              if (active !== current.current.surfaceSeq) {
                gate(false);
                current.current.surfaceSeq = active;
                resize();
              }
              setActiveSurface(active);
              setSurfaces(data.list as TRemoteSurface[]);
            } else if (data.t === "nav")
              setSurfaces((list) =>
                list.map((surface) =>
                  surface.surfaceSeq === data.surfaceSeq
                    ? { ...surface, url: String(data.url) }
                    : surface
                )
              );
            else if (data.t === "viewport_ack" && data.seq === pendingViewport.current) {
              current.current.viewportGen = Number(data.viewportGen);
              pendingViewport.current = 0;
              if (
                lastRendered.current &&
                !recordingFailed.current &&
                Date.now() - latestFrame.current < 15_000 &&
                lastRendered.current.surfaceSeq === current.current.surfaceSeq &&
                lastRendered.current.viewportGen === current.current.viewportGen &&
                lastRendered.current.controllerGen === current.current.controllerGen
              )
                gate(true);
            } else if (data.t === "controller_busy") {
              setBusy(true);
              gate(false);
            } else if (data.t === "controller_lost") {
              fatal = true;
              setBusy(true);
              gate(false);
            } else if (data.t === "dialog") {
              setDialog(data as unknown as TRemoteDialog);
              gate(false);
            } else if (data.t === "policy_denied")
              setBlocked((list) =>
                [
                  ...new Set([
                    ...list,
                    `${String(data.kind)}: ${data.host ? String(data.host) : "destination"}${data.port ? `:${String(data.port)}` : ""} — ${String(data.detail)}`
                  ])
                ].slice(-100)
              );
            else if (data.t === "health") {
              recordingFailed.current = data.recording === "failed" || data.egress === "failed";
              setRecordingHealth({ ok: !recordingFailed.current, at: Date.now() });
              if (recordingFailed.current) {
                gate(false);
                setError("Recording failed. Stopping the browser…");
              }
            } else if (data.t === "ending" || data.t === "ended") {
              fatal = true;
              gate(false);
              setPhase("ending");
            } else if (data.t === "error") {
              fatal = true;
              gate(false);
              setErrorCode(String(data.code));
              setError(
                data.code === "capacity"
                  ? "All browsers are in use. Try again shortly."
                  : String(data.message)
              );
            }
          } catch {
            fatal = true;
            setError("The browser connection sent an invalid message.");
            socket?.close();
          }
        };
        socket.onclose = () => {
          setConnected(false);
          gate(false);
          decodeGeneration.current += 1;
          if (!disposed && !fatal)
            reconnectTimer = setTimeout(() => {
              connect(false);
            }, 2000);
        };
        socket.onerror = () => {
          gate(false);
        };
      } catch (cause) {
        if (!disposed) {
          setError(
            (cause as { response?: { data?: { message?: string } } }).response?.data?.message ??
              "The browser connection could not be restored."
          );
          setConnected(false);
        }
      }
    };
    connect(attempt.takeControl);
    const staleTimer = setInterval(() => {
      if (latestFrame.current && Date.now() - latestFrame.current > 15_000) gate(false);
    }, 1000);
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(staleTimer);
      socket?.close();
      socketRef.current = null;
      gate(false);
    };
  }, [sessionId, live, attempt, gate, resize]);
  useEffect(() => {
    if (!containerRef.current || !connected) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      gate(false);
      clearTimeout(timer);
      timer = setTimeout(resize, 150);
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [connected, gate, resize]);
  const input = useCallback((details: Record<string, unknown>) => {
    if (!readyRef.current || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(
      encodeWebAppMessage("input", {
        seq: (sequence.current += 1),
        surfaceSeq: current.current.surfaceSeq,
        viewportGen: current.current.viewportGen,
        ...details
      })
    );
  }, []);
  const pointer = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, action: "move" | "down" | "up") => {
      if (action === "move") {
        if (performance.now() - lastMove.current < 1000 / 60) return;
        lastMove.current = performance.now();
      }
      if (action === "down") {
        event.preventDefault();
        keyboardRef.current?.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      const coordinates = remoteCoordinates(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        viewport.current
      );
      input({
        kind: "mouse",
        action,
        ...coordinates,
        button: action === "move" ? "none" : (["left", "middle", "right"][event.button] ?? "none"),
        buttons: event.buttons,
        modifiers: modifiers(event),
        clickCount: action === "move" ? 0 : Math.max(1, Math.min(3, event.detail))
      });
    },
    [input]
  );
  const key = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>, action: "down" | "up") => {
      if (event.ctrlKey && event.altKey && event.key === "Escape") {
        event.preventDefault();
        endButtonRef.current?.focus();
        return;
      }
      if (event.key === "Tab") return;
      if (event.nativeEvent.isComposing || event.key === "Process") return;
      event.preventDefault();
      input({
        kind: "key",
        action,
        key: event.key,
        code: event.code,
        modifiers: modifiers(event),
        ...(action === "down" && event.key.length === 1 && !event.ctrlKey && !event.metaKey
          ? { text: event.key }
          : {})
      });
    },
    [input]
  );
  const control = useCallback(
    (t: string, details: Record<string, unknown> = {}) => {
      if (t === "surface" || t === "viewport") gate(false);
      return sendControl(t, { surfaceSeq: current.current.surfaceSeq, ...details });
    },
    [gate, sendControl]
  );
  const answerDialog = (accept: boolean, promptText?: string) => {
    if (dialog) {
      control("dialog", {
        surfaceSeq: dialog.surfaceSeq,
        dialogSeq: dialog.dialogSeq,
        accept,
        ...(promptText !== undefined ? { promptText } : {})
      });
      setDialog(undefined);
    }
  };
  return {
    canvasRef,
    keyboardRef,
    containerRef,
    endButtonRef,
    connected,
    ready,
    phase,
    busy,
    error,
    errorCode,
    surfaces,
    activeSurface,
    dialog,
    blocked,
    recordingHealth,
    lastFrameAt,
    control,
    answerDialog,
    reconnect: () => setAttempt((previous) => ({ id: previous.id + 1, takeControl: false })),
    takeControl: () => setAttempt((previous) => ({ id: previous.id + 1, takeControl: true })),
    canvasHandlers: {
      onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => pointer(event, "move"),
      onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => pointer(event, "down"),
      onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => pointer(event, "up"),
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
      onWheel: (event: React.WheelEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        input({
          kind: "wheel",
          ...remoteCoordinates(
            event.clientX,
            event.clientY,
            event.currentTarget.getBoundingClientRect(),
            viewport.current
          ),
          deltaX: Math.round(event.deltaX),
          deltaY: Math.round(event.deltaY),
          modifiers: modifiers(event)
        });
      }
    },
    keyboardHandlers: {
      onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => key(event, "down"),
      onKeyUp: (event: React.KeyboardEvent<HTMLTextAreaElement>) => key(event, "up"),
      onCompositionEnd: (event: React.CompositionEvent<HTMLTextAreaElement>) => {
        input({ kind: "text", text: event.data, source: "ime" });
        const target = event.currentTarget;
        target.value = "";
      },
      onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => event.preventDefault(),
      onDrop: (event: React.DragEvent<HTMLTextAreaElement>) => event.preventDefault()
    }
  };
};
