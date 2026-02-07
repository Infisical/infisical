import { useCallback, useEffect, useRef, useState } from "react";

import { getAuthToken } from "@app/hooks/api/reactQuery";

import type {
  ConnectionState,
  UseTerminalWebSocketOptions,
  WebSocketClientMessage
} from "./pam-terminal-types";
import { WebSocketServerMessageSchema } from "./pam-terminal-types";

export const useTerminalWebSocket = ({
  accountId,
  projectId,
  onConnect,
  onDisconnect,
  onError,
  onMessage
}: UseTerminalWebSocketOptions) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const websocketRef = useRef<WebSocket | null>(null);
  const isConnectedRef = useRef(false);

  // Ref-ify callbacks to avoid stale closures and unnecessary reconnects
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
    onMessageRef.current = onMessage;
  }, [onConnect, onDisconnect, onError, onMessage]);

  const connect = useCallback(() => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnectedRef.current = false;
    setConnectionState("connecting");

    const token = getAuthToken();
    if (!token) {
      setConnectionState("error");
      onErrorRef.current?.("Not authenticated");
      return;
    }

    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${host}/api/v1/pam/terminal/accounts/${accountId}/terminal-access?projectId=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    websocketRef.current = ws;

    const isStale = () => websocketRef.current !== ws;

    ws.onmessage = (event) => {
      if (isStale()) return;
      const parsed = WebSocketServerMessageSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) return;

      const message = parsed.data;

      if (message.type === "ready") {
        isConnectedRef.current = true;
        setConnectionState("connected");
        onConnectRef.current?.();
      }

      onMessageRef.current?.(message);
    };

    ws.onerror = () => {
      if (isStale()) return;
      setConnectionState("error");
      onErrorRef.current?.("WebSocket connection error");
    };

    ws.onclose = () => {
      if (isStale()) return;
      websocketRef.current = null;
      if (isConnectedRef.current) {
        setConnectionState("disconnected");
        onDisconnectRef.current?.();
      }
      isConnectedRef.current = false;
    };
  }, [accountId, projectId]);

  const disconnect = useCallback(() => {
    const ws = websocketRef.current;
    if (ws) {
      // Nullify ref first to prevent onclose from double-firing onDisconnect
      websocketRef.current = null;

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "control", data: "quit" }));
      }
      ws.close();
    }
    isConnectedRef.current = false;
    setConnectionState("disconnected");
    onDisconnectRef.current?.();
  }, []);

  const send = useCallback((data: WebSocketClientMessage) => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendSql = useCallback(
    (sql: string) => {
      send({ type: "input", data: sql });
    },
    [send]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (websocketRef.current) {
        if (websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.send(JSON.stringify({ type: "control", data: "quit" }));
        }
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, []);

  return {
    connectionState,
    connect,
    disconnect,
    sendSql
  };
};
