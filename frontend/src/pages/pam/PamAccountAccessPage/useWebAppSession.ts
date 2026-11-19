import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { getAccessErrorMessage } from "@app/pages/pam/access-error";
import { extractMfaSessionId, useMfaChallenge } from "@app/pages/pam/components/useMfaChallenge";

import { WebSocketServerMessageSchema, WsMessageType } from "./web-access-types";
import {
  createWebAppFrameParser,
  decodeServerMessage,
  encodeClientMessage,
  TWebAppClientMessage,
  WebAppFrameType,
  WebAppProtocolError
} from "./web-app-protocol";

const MIN_VIEWPORT = 200;
const MAX_VIEWPORT = 3840;
const RESIZE_DEBOUNCE_MS = 150;

export type TWebAppPageState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type TWebAppSessionStatus = "connecting" | "connected" | "ended" | "error";

type UseWebAppSessionOptions = {
  accountId: string;
  reason?: string;
  mfaSessionId?: string;
};

const clampViewport = (value: number) =>
  Math.min(Math.max(Math.round(value), MIN_VIEWPORT), MAX_VIEWPORT);

export const useWebAppSession = ({ accountId, reason, mfaSessionId }: UseWebAppSessionOptions) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const generationRef = useRef(0);
  const mfaSessionIdRef = useRef(mfaSessionId);
  const runMfaChallenge = useMfaChallenge();

  const [status, setStatus] = useState<TWebAppSessionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [pageState, setPageState] = useState<TWebAppPageState | null>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);

  const send = useCallback((message: TWebAppClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(encodeClientMessage(message));
  }, []);

  const sendViewportSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    send({ type: "resize", width: clampViewport(width), height: clampViewport(height) });
  }, [send]);

  const closeSocket = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  }, []);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      setStatus("error");
      createNotification({ type: "error", text: message });
      closeSocket();
    },
    [closeSocket]
  );

  const openSocket = useCallback(
    (ticket: string, isCurrent: () => boolean) => {
      const { protocol, host } = window.location;
      const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`
      );
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      const parser = createWebAppFrameParser();
      let decodedSeq = 0;
      let paintedSeq = 0;

      const paint = (jpeg: Uint8Array<ArrayBuffer>) => {
        decodedSeq += 1;
        const seq = decodedSeq;
        createImageBitmap(new Blob([jpeg], { type: "image/jpeg" }))
          .then((bitmap) => {
            const canvas = canvasRef.current;
            if (!isCurrent() || !canvas || seq < paintedSeq) {
              bitmap.close();
              return;
            }
            paintedSeq = seq;
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              setFrameSize({ width: bitmap.width, height: bitmap.height });
            }
            canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
            bitmap.close();
          })
          .catch(() => {});
      };

      ws.onopen = () => {
        if (!isCurrent()) return;
        sendViewportSize();
      };

      ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
        if (!isCurrent()) return;

        if (typeof event.data === "string") {
          let raw: unknown;
          try {
            raw = JSON.parse(event.data);
          } catch {
            return;
          }
          const parsed = WebSocketServerMessageSchema.safeParse(raw);
          if (parsed.success && parsed.data.type === WsMessageType.SessionEnd) {
            setEndReason(parsed.data.reason);
          }
          return;
        }

        let frames;
        try {
          frames = parser.push(new Uint8Array(event.data));
        } catch (err) {
          fail(
            err instanceof WebAppProtocolError
              ? "The gateway sent data the viewer could not read."
              : "The session failed."
          );
          return;
        }

        frames.forEach((frame) => {
          if (frame.type === WebAppFrameType.Jpeg) {
            paint(frame.payload);
            return;
          }
          const message = decodeServerMessage(frame.payload);
          if (!message) return;
          switch (message.type) {
            case "ready":
              setStatus("connected");
              break;
            case "state":
              setPageState({
                url: message.url,
                title: message.title,
                canGoBack: message.canGoBack,
                canGoForward: message.canGoForward
              });
              break;
            case "notice":
              createNotification({ type: "info", text: message.message });
              break;
            case "blocked":
              createNotification({
                type: "warning",
                title: "Page blocked",
                text: `${message.message} (${message.url})`
              });
              break;
            case "error":
              fail(message.message);
              break;
            default:
              break;
          }
        });
      };

      ws.onclose = () => {
        if (!isCurrent()) return;
        wsRef.current = null;
        setStatus((current) => (current === "error" ? current : "ended"));
      };
    },
    [accountId, fail, sendViewportSize]
  );

  const connect = useCallback(async () => {
    closeSocket();
    generationRef.current += 1;
    const gen = generationRef.current;
    const isCurrent = () => gen === generationRef.current;

    setStatus("connecting");
    setError(null);
    setEndReason(null);
    setPageState(null);

    const requestTicket = async (ticketMfaSessionId?: string) => {
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { reason, mfaSessionId: ticketMfaSessionId }
      );
      return data.ticket;
    };

    // The backend consumes an MFA session on first use, so later connects must run a fresh challenge
    const initialMfaSessionId = mfaSessionIdRef.current;
    mfaSessionIdRef.current = undefined;

    let ticket: string;
    try {
      ticket = await requestTicket(initialMfaSessionId);
    } catch (err) {
      const challengeMfaSessionId = extractMfaSessionId(err);
      if (!challengeMfaSessionId || !isCurrent()) throw err;
      const outcome = await runMfaChallenge(challengeMfaSessionId);
      if (!isCurrent()) return;
      if (outcome === "blocked") {
        throw new Error(
          "Allow pop-ups for this site to complete MFA verification, then reconnect."
        );
      }
      if (outcome === "failed") {
        throw new Error("MFA verification timed out or failed. Reconnect to try again.");
      }
      ticket = await requestTicket(challengeMfaSessionId);
    }
    if (!isCurrent()) return;
    openSocket(ticket, isCurrent);
  }, [accountId, reason, closeSocket, openSocket, runMfaChallenge]);

  const handleConnectError = useCallback(
    (err: unknown) => {
      let message = "Failed to start the web app session";
      if (axios.isAxiosError(err)) {
        message = getAccessErrorMessage(err, message);
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      fail(message);
    },
    [fail]
  );

  useEffect(() => {
    // Issuing a ticket revokes the user's previous one, so a mount that StrictMode discards must
    // not request one, or the two requests race and the surviving mount can hold the revoked ticket.
    const timer = setTimeout(() => {
      connect().catch(handleConnectError);
    }, 0);
    return () => {
      clearTimeout(timer);
      generationRef.current += 1;
      closeSocket();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(sendViewportSize, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(container);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [sendViewportSize]);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    closeSocket();
    setStatus("ended");
  }, [closeSocket]);

  const reconnect = useCallback(() => {
    connect().catch(handleConnectError);
  }, [connect, handleConnectError]);

  return {
    containerRef,
    canvasRef,
    status,
    error,
    endReason,
    pageState,
    frameSize,
    send,
    disconnect,
    reconnect
  };
};
