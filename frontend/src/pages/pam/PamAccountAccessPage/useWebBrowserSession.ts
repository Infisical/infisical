import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

// Wire framing with the gateway web handler (see cli .../handlers/web/proxy.go):
// newline-delimited JSON. gateway → browser: {type:"frame",data(base64 jpeg),elapsedMs}
// and {type:"navigated",url}. browser → gateway: {type:"click",x,y} / {type:"text",text}
// / {type:"key",key} / {type:"navigate",url}.

type UseWebBrowserSessionOptions = {
  accountId: string;
  reason?: string;
  mfaSessionId?: string;
  onSessionEnd?: () => void;
};

const WEB_SESSION_FAILED_MESSAGE = "Web session failed. Please try again.";

export const useWebBrowserSession = ({
  accountId,
  reason,
  mfaSessionId,
  onSessionEnd
}: UseWebBrowserSessionOptions) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const buildProxyAddress = useCallback(
    (ticket: string) => {
      const { protocol, host } = window.location;
      const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`;
    },
    [accountId]
  );

  const drawFrame = useCallback((base64Jpeg: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      if (canvas.width !== img.width) canvas.width = img.width;
      if (canvas.height !== img.height) canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  }, []);

  const sendInput = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const teardown = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    teardown();
    setError(null);
    try {
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { reason, mfaSessionId }
      );
      const ws = new WebSocket(buildProxyAddress(data.ticket));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      let buffer = "";
      const handlePayload = (text: string) => {
        buffer += text;
        let idx = buffer.indexOf("\n");
        while (idx !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.trim()) {
            try {
              const msg = JSON.parse(line) as { type: string; data?: string };
              if (msg.type === "frame" && msg.data) drawFrame(msg.data);
            } catch {
              // partial/invalid line; skip
            }
          }
          idx = buffer.indexOf("\n");
        }
      };

      ws.onopen = () => setIsConnected(true);
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          handlePayload(ev.data);
        } else {
          handlePayload(new TextDecoder().decode(ev.data as ArrayBuffer));
        }
      };
      ws.onerror = () => {
        setError(WEB_SESSION_FAILED_MESSAGE);
      };
      ws.onclose = () => {
        setIsConnected(false);
        onSessionEndRef.current?.();
      };
    } catch (err) {
      let message = "Failed to start web session";
      if (axios.isAxiosError(err)) {
        const apiMessage = (err.response?.data as { message?: string } | undefined)?.message;
        if (apiMessage) message = apiMessage;
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      setError(message);
      createNotification({ type: "error", text: message });
    }
  }, [accountId, reason, mfaSessionId, buildProxyAddress, drawFrame, teardown]);

  useEffect(() => {
    connect().catch(() => {
      // connect() already surfaces errors via setError/createNotification
    });
    return () => teardown();
  }, [connect, teardown]);

  // Map a canvas click to CDP coordinates (canvas is drawn at native frame size).
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
      sendInput({ type: "click", x, y });
    },
    [sendInput]
  );

  const navigate = useCallback((url: string) => sendInput({ type: "navigate", url }), [sendInput]);
  const typeText = useCallback((text: string) => sendInput({ type: "text", text }), [sendInput]);

  return {
    canvasRef,
    isConnected,
    error,
    handleCanvasClick,
    navigate,
    typeText,
    reconnect: connect
  };
};
