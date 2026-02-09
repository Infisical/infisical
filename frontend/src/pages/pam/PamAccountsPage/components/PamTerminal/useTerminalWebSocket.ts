import { useCallback, useEffect, useRef } from "react";

import { useCreatePamTerminalTicket } from "@app/hooks/api/pam";

import type { UseTerminalWebSocketOptions, WebSocketClientMessage } from "./pam-terminal-types";
import { WebSocketServerMessageSchema, WsMessageType } from "./pam-terminal-types";

export const useTerminalWebSocket = ({
  accountId,
  projectId,
  onConnect,
  onDisconnect,
  onMessage
}: UseTerminalWebSocketOptions) => {
  const websocketRef = useRef<WebSocket | null>(null);
  const isConnectedRef = useRef(false);
  const createTicket = useCreatePamTerminalTicket();

  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onMessageRef.current = onMessage;
  }, [onConnect, onDisconnect, onMessage]);

  const connect = useCallback(async () => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnectedRef.current = false;

    const ticket = await createTicket.mutateAsync({ accountId, projectId });

    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/terminal-access?ticket=${encodeURIComponent(ticket)}`;

    const ws = new WebSocket(wsUrl);
    websocketRef.current = ws;

    const isStale = () => websocketRef.current !== ws;

    ws.onmessage = (event) => {
      if (isStale()) return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = WebSocketServerMessageSchema.safeParse(raw);
      if (!parsed.success) return;

      const message = parsed.data;

      if (message.type === WsMessageType.Ready) {
        isConnectedRef.current = true;
        onConnectRef.current?.();
      }

      onMessageRef.current?.(message);
    };

    ws.onerror = () => {
      // no-op: onclose always fires after onerror
    };

    ws.onclose = () => {
      if (isStale()) return;
      websocketRef.current = null;
      onDisconnectRef.current?.();
      isConnectedRef.current = false;
    };
  }, [accountId, projectId, createTicket]);

  const disconnect = useCallback(() => {
    const ws = websocketRef.current;
    const wasConnected = isConnectedRef.current;

    // Nullify ref before closing so onclose handler (via isStale) won't double-fire onDisconnect
    websocketRef.current = null;
    isConnectedRef.current = false;

    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: WsMessageType.Control, data: "quit" }));
      }
      ws.close();
    }

    if (wasConnected) {
      onDisconnectRef.current?.();
    }
  }, []);

  const send = useCallback((data: WebSocketClientMessage) => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      websocketRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendInput = useCallback(
    (input: string) => {
      send({ type: WsMessageType.Input, data: input });
    },
    [send]
  );

  useEffect(() => {
    return () => {
      if (websocketRef.current) {
        if (websocketRef.current.readyState === WebSocket.OPEN) {
          websocketRef.current.send(JSON.stringify({ type: WsMessageType.Control, data: "quit" }));
        }
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, []);

  return {
    connect,
    disconnect,
    sendInput
  };
};
