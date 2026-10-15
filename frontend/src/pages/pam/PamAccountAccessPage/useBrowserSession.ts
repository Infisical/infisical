import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { apiRequest } from "@app/config/request";

import {
  BrowserControllerMessageType,
  BrowserEndReason,
  BrowserMessageType,
  clampViewport,
  createBrowserStreamDecoder,
  encodeDialogReply,
  encodeEnd,
  encodeResize,
  parseBrowserControllerMessage,
  TBrowserControllerMessage,
  TBrowserDialogMessage,
  TBrowserFrame,
  TBrowserStreamMessage,
  TBrowserViewport
} from "./browser-protocol";
import { WebSocketServerMessageSchema, WsMessageType } from "./web-access-types";

const RESIZE_DEBOUNCE_MS = 150;
// The controller answers `end` by closing the connection; this covers one that never does
const END_SESSION_CLOSE_TIMEOUT_MS = 5000;

// Keywords only: a url() cursor set by the remote page would make this tab fetch from that host
const CSS_CURSOR_KEYWORD = /^[a-z-]+$/;

const SESSION_START_FAILED_MESSAGE = "Failed to start the browser session.";
const CONNECTION_FAILED_MESSAGE =
  "Could not reach the remote browser. Check that the gateway is online, then reconnect.";
const PROTOCOL_ERROR_MESSAGE =
  "The gateway sent data this viewer could not read. Reconnect to start a new session.";

export enum BrowserSessionStatus {
  Connecting = "connecting",
  Connected = "connected",
  Ended = "ended",
  Error = "error"
}

// `reason` is the controller's end.reason; `message` is its detail or the backend's own notice
export type TBrowserSessionEnd = {
  reason?: string;
  message?: string;
};

export type TBrowserBlockedNavigation = {
  id: number;
  url: string;
};

type TBrowserPage = {
  url: string;
  title: string;
};

type UseBrowserSessionOptions = {
  accountId: string;
  reason?: string;
  mfaSessionId?: string;
};

const EMPTY_PAGE: TBrowserPage = { url: "", title: "" };

const buildWebAccessUrl = (accountId: string, ticket: string) => {
  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`;
};

const getStartErrorMessage = (err: unknown) => {
  if (axios.isAxiosError(err)) {
    const apiMessage = (err.response?.data as { message?: string } | undefined)?.message;
    if (apiMessage) return apiMessage;
  } else if (err instanceof Error && err.message) {
    return err.message;
  }
  return SESSION_START_FAILED_MESSAGE;
};

export const useBrowserSession = ({
  accountId,
  reason,
  mfaSessionId
}: UseBrowserSessionOptions) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // The viewport last sent in `resize`; input coordinates are expressed in it
  const viewportRef = useRef<TBrowserViewport | null>(null);
  const sentDprRef = useRef(0);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const pendingFrameRef = useRef<TBrowserFrame | null>(null);
  const isDecodingRef = useRef(false);
  const generationRef = useRef(0);
  const statusRef = useRef(BrowserSessionStatus.Connecting);
  const dialogRef = useRef<TBrowserDialogMessage | null>(null);
  const isEndRequestedRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockedCountRef = useRef(0);

  const [status, setStatus] = useState(BrowserSessionStatus.Connecting);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnd, setSessionEnd] = useState<TBrowserSessionEnd | null>(null);
  const [page, setPage] = useState<TBrowserPage>(EMPTY_PAGE);
  const [dialog, setDialog] = useState<TBrowserDialogMessage | null>(null);
  const [blockedNavigation, setBlockedNavigation] = useState<TBrowserBlockedNavigation | null>(
    null
  );
  const [isEnding, setIsEnding] = useState(false);

  const send = useCallback((message: Uint8Array) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(message);
  }, []);

  const updateStatus = useCallback((next: BrowserSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearDialog = useCallback(() => {
    dialogRef.current = null;
    setDialog(null);
  }, []);

  const finishSession = useCallback(
    (end: TBrowserSessionEnd) => {
      clearDialog();
      setIsEnding(false);
      setSessionEnd(end);
      updateStatus(BrowserSessionStatus.Ended);
    },
    [clearDialog, updateStatus]
  );

  const failSession = useCallback(
    (message: string) => {
      clearDialog();
      setIsEnding(false);
      setError(message);
      updateStatus(BrowserSessionStatus.Error);
    },
    [clearDialog, updateStatus]
  );

  const clearEndTimer = useCallback(() => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    clearEndTimer();
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
  }, [clearEndTimer]);

  const drawLatestFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    if (!canvas || !bitmap) return;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, []);

  const clearFrames = useCallback(() => {
    pendingFrameRef.current = null;
    isDecodingRef.current = false;
    bitmapRef.current?.close();
    bitmapRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const syncCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(container.clientWidth * dpr);
    const height = Math.round(container.clientHeight * dpr);
    if (canvas.width === width && canvas.height === height) return;
    // Resizing the backing store clears it
    canvas.width = width;
    canvas.height = height;
    drawLatestFrame();
  }, [drawLatestFrame]);

  const sendResize = useCallback(() => {
    const container = containerRef.current;
    const ws = wsRef.current;
    if (!container || ws?.readyState !== WebSocket.OPEN) return;
    const viewport = clampViewport(container.clientWidth, container.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const previous = viewportRef.current;
    if (
      previous?.width === viewport.width &&
      previous.height === viewport.height &&
      sentDprRef.current === dpr
    ) {
      return;
    }
    viewportRef.current = viewport;
    sentDprRef.current = dpr;
    ws.send(encodeResize({ ...viewport, dpr }));
  }, []);

  const connect = useCallback(async () => {
    generationRef.current += 1;
    const gen = generationRef.current;
    const isCurrent = () => gen === generationRef.current;

    teardown();
    clearFrames();
    viewportRef.current = null;
    isEndRequestedRef.current = false;
    clearDialog();
    setError(null);
    setSessionEnd(null);
    setPage(EMPTY_PAGE);
    setBlockedNavigation(null);
    setIsEnding(false);
    updateStatus(BrowserSessionStatus.Connecting);
    if (canvasRef.current) canvasRef.current.style.cursor = "";

    let ticket: string;
    try {
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { reason, mfaSessionId }
      );
      ticket = data.ticket;
    } catch (err) {
      if (isCurrent()) failSession(getStartErrorMessage(err));
      return;
    }
    if (!isCurrent()) return;

    const ws = new WebSocket(buildWebAccessUrl(accountId, ticket));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    const decoder = createBrowserStreamDecoder();
    let backendEndMessage: string | undefined;

    const isFinished = () =>
      statusRef.current === BrowserSessionStatus.Ended ||
      statusRef.current === BrowserSessionStatus.Error;

    // Decodes one frame at a time and keeps only the newest waiting one, so a slow decode drops
    // frames instead of queueing them
    const decodeNextFrame = () => {
      const frame = pendingFrameRef.current;
      pendingFrameRef.current = null;
      isDecodingRef.current = Boolean(frame);
      if (!frame) return;
      createImageBitmap(new Blob([frame.jpeg], { type: "image/jpeg" }))
        .then((bitmap) => {
          if (!isCurrent()) {
            bitmap.close();
            return;
          }
          bitmapRef.current?.close();
          bitmapRef.current = bitmap;
          drawLatestFrame();
        })
        .catch(() => {
          // Every frame is the full viewport, so the next one repaints over a frame that failed
        })
        .finally(() => {
          if (isCurrent()) decodeNextFrame();
        });
    };

    const handleFrame = (frame: TBrowserFrame) => {
      pendingFrameRef.current = frame;
      if (!isDecodingRef.current) decodeNextFrame();
    };

    const handleControllerMessage = (message: TBrowserControllerMessage) => {
      switch (message.type) {
        case BrowserControllerMessageType.Ready:
          setPage({ url: message.url, title: "" });
          updateStatus(BrowserSessionStatus.Connected);
          canvasRef.current?.focus({ preventScroll: true });
          break;
        case BrowserControllerMessageType.Url:
          setPage({ url: message.url, title: message.title });
          break;
        case BrowserControllerMessageType.Cursor:
          if (canvasRef.current) {
            canvasRef.current.style.cursor = CSS_CURSOR_KEYWORD.test(message.cursor)
              ? message.cursor
              : "default";
          }
          break;
        case BrowserControllerMessageType.Dialog:
          dialogRef.current = message;
          setDialog(message);
          break;
        case BrowserControllerMessageType.Blocked:
          blockedCountRef.current += 1;
          setBlockedNavigation({ id: blockedCountRef.current, url: message.url });
          break;
        case BrowserControllerMessageType.End:
          finishSession({ reason: message.reason, message: message.message });
          break;
        default:
          break;
      }
    };

    // The backend's own notices (session limit, setup failure, revoked access) arrive as text
    // messages outside the controller's byte stream, right before it closes the socket
    const handleBackendText = (raw: string) => {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      const parsed = WebSocketServerMessageSchema.safeParse(data);
      if (parsed.success && parsed.data.type === WsMessageType.SessionEnd) {
        backendEndMessage = parsed.data.reason;
      }
    };

    ws.onopen = () => {
      if (!isCurrent()) return;
      sendResize();
    };

    ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (!isCurrent() || isFinished()) return;
      if (typeof event.data === "string") {
        handleBackendText(event.data);
        return;
      }

      let messages: TBrowserStreamMessage[];
      try {
        messages = decoder.push(event.data);
      } catch {
        failSession(PROTOCOL_ERROR_MESSAGE);
        teardown();
        return;
      }

      messages.forEach((message) => {
        if (isFinished()) return;
        if (message.type === BrowserMessageType.Frame) {
          handleFrame(message.frame);
          return;
        }
        const controllerMessage = parseBrowserControllerMessage(message.data);
        if (controllerMessage) handleControllerMessage(controllerMessage);
      });
    };

    ws.onclose = () => {
      if (!isCurrent()) return;
      wsRef.current = null;
      clearEndTimer();
      if (isFinished()) return;

      const wasConnected = statusRef.current === BrowserSessionStatus.Connected;
      if (backendEndMessage) {
        if (wasConnected) finishSession({ message: backendEndMessage });
        else failSession(backendEndMessage);
      } else if (isEndRequestedRef.current) {
        finishSession({ reason: BrowserEndReason.UserQuit });
      } else if (wasConnected) {
        finishSession({});
      } else {
        failSession(CONNECTION_FAILED_MESSAGE);
      }
    };

    ws.onerror = () => {
      // no-op: onclose always fires after onerror
    };
  }, [
    accountId,
    reason,
    mfaSessionId,
    teardown,
    clearFrames,
    clearDialog,
    clearEndTimer,
    updateStatus,
    finishSession,
    failSession,
    drawLatestFrame,
    sendResize
  ]);

  const handleConnectError = useCallback(
    (err: unknown) => {
      failSession(getStartErrorMessage(err));
    },
    [failSession]
  );

  useEffect(() => {
    connect().catch(handleConnectError);
    return () => {
      // Lets the controller record a clean user_quit when the page is left mid-session
      send(encodeEnd());
      generationRef.current += 1;
      teardown();
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sendResize, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      clearTimeout(debounceTimer);
    };
  }, [syncCanvasSize, sendResize]);

  const endSession = useCallback(() => {
    const ws = wsRef.current;
    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      statusRef.current !== BrowserSessionStatus.Connected
    ) {
      return;
    }
    isEndRequestedRef.current = true;
    setIsEnding(true);
    ws.send(encodeEnd());
    clearEndTimer();
    endTimerRef.current = setTimeout(() => {
      if (wsRef.current === ws) ws.close();
    }, END_SESSION_CLOSE_TIMEOUT_MS);
  }, [clearEndTimer]);

  const replyToDialog = useCallback(
    (accept: boolean, promptText?: string) => {
      // Radix reports the close after the button's own click, so a dialog is answered only once
      const current = dialogRef.current;
      if (!current) return;
      clearDialog();
      send(encodeDialogReply({ id: current.id, accept, promptText }));
    },
    [clearDialog, send]
  );

  const dismissBlockedNavigation = useCallback(() => setBlockedNavigation(null), []);

  const reconnect = useCallback(() => {
    connect().catch(handleConnectError);
  }, [connect, handleConnectError]);

  return {
    containerRef,
    canvasRef,
    viewportRef,
    status,
    error,
    sessionEnd,
    page,
    dialog,
    blockedNavigation,
    isEnding,
    send,
    endSession,
    replyToDialog,
    dismissBlockedNavigation,
    reconnect
  };
};
