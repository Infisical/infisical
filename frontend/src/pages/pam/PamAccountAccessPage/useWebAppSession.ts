import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "@app/config/request";

import { CdpFrameDecoder, encodeCdpFrame } from "./cdpFraming";

type UseWebAppSessionOptions = {
  accountId: string;
  reason?: string;
  mfaSessionId?: string;
  onSessionEnd?: () => void;
};

type CdpScreencastFrameMessage = {
  method: "Page.screencastFrame";
  params: { data: string; sessionId: number };
};

const isScreencastFrame = (message: unknown): message is CdpScreencastFrameMessage =>
  typeof message === "object" &&
  message !== null &&
  (message as { method?: unknown }).method === "Page.screencastFrame";

export const useWebAppSession = ({
  accountId,
  reason,
  mfaSessionId,
  onSessionEnd
}: UseWebAppSessionOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const decoderRef = useRef(new CdpFrameDecoder());
  const onSessionEndRef = useRef(onSessionEnd);
  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const sendCdp = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(encodeCdpFrame(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    decoderRef.current = new CdpFrameDecoder();

    let ticket: string;
    try {
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { reason, mfaSessionId }
      );
      ticket = data.ticket;
    } catch {
      setError("Failed to start session. Please try again.");
      return;
    }

    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`
    );
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      sendCdp({
        id: 1,
        method: "Page.startScreencast",
        params: { format: "jpeg", everyNthFrame: 1 }
      });
    };

    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const messages = decoderRef.current.push(event.data);
      messages.forEach((message) => {
        if (isScreencastFrame(message)) {
          setFrameDataUrl(`data:image/jpeg;base64,${message.params.data}`);
          setFrameCount((count) => count + 1);
          sendCdp({
            id: 0,
            method: "Page.screencastFrameAck",
            params: { sessionId: message.params.sessionId }
          });
        } else {
          // eslint-disable-next-line no-console
          console.debug("cdp message", message);
        }
      });
    };

    ws.onclose = () => {
      wsRef.current = null;
      setIsConnected(false);
      onSessionEndRef.current?.();
    };
  }, [accountId, reason, mfaSessionId, sendCdp]);

  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setFrameDataUrl(null);
    setFrameCount(0);
    connect();
  }, [disconnect, connect]);

  return { isConnected, error, frameDataUrl, frameCount, disconnect, reconnect };
};
