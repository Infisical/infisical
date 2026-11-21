import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { errorMessage } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { TWebAccessChannel } from "../../../data/pam/web-access/contract";
import { MFA_FAILED, mfaSessionIdOf } from "../web-access";
import type {
  DataExplorerClientMessage,
  DataExplorerServerMessage,
  QueryResult,
  SchemaInfo,
  TableDetail,
  TableInfo
} from "./protocol";

type PendingRequest = {
  resolve: (message: DataExplorerServerMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  connectionId?: string;
};

type MfaState = { sessionId: string; verifying: boolean };

const REQUEST_TIMEOUT_MS = 30_000;
// The server's idle timer is 10 minutes, so a minute leaves room for a dropped heartbeat
const ACTIVITY_PING_INTERVAL_MS = 60_000;

type Reply<T extends DataExplorerServerMessage["type"]> = Extract<
  DataExplorerServerMessage,
  { type: T }
>;

export const useDataExplorerSession = ({
  accountId,
  reason,
  onSessionEnd,
  onConnectionClosed,
  onReconnected
}: {
  accountId: string;
  reason?: string;
  onSessionEnd: (reason?: string) => void;
  onConnectionClosed: (connectionId: string) => void;
  onReconnected: () => void;
}) => {
  const webAccess = useV4Adapter("pam").useWebAccess();
  const runMfa = useV4Adapter("pamAccess").useMfaChallenge();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<MfaState | null>(null);

  const channelRef = useRef<TWebAccessChannel | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const readyRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);
  const callbacksRef = useRef({ onSessionEnd, onConnectionClosed, onReconnected });
  useLayoutEffect(() => {
    callbacksRef.current = { onSessionEnd, onConnectionClosed, onReconnected };
  });
  const hasConnectedRef = useRef(false);

  const rejectPending = useCallback((message: string, connectionId?: string) => {
    pendingRef.current.forEach((pending, id) => {
      if (connectionId && pending.connectionId !== connectionId) return;
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      pendingRef.current.delete(id);
    });
  }, []);

  const endSession = useCallback(
    (endReason?: string) => {
      channelRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
      rejectPending(endReason ? "Session ended" : "Connection closed");
      readyRef.current?.reject(new Error("Connection closed"));
      callbacksRef.current.onSessionEnd(endReason);
    },
    [rejectPending]
  );

  const onMessage = useCallback(
    (raw: string) => {
      let message: DataExplorerServerMessage;
      try {
        message = JSON.parse(raw) as DataExplorerServerMessage;
      } catch {
        return;
      }
      if (message.type === "ready") {
        setIsConnected(true);
        setIsConnecting(false);
        readyRef.current?.resolve();
        if (hasConnectedRef.current) callbacksRef.current.onReconnected();
        hasConnectedRef.current = true;
        return;
      }
      if (message.type === "session_end") {
        endSession(message.reason);
        return;
      }
      if (message.type === "connection-closed") {
        rejectPending(message.reason || "Connection closed", message.connectionId);
        callbacksRef.current.onConnectionClosed(message.connectionId);
        return;
      }
      const pending = pendingRef.current.get(message.id);
      if (!pending) return;
      pendingRef.current.delete(message.id);
      clearTimeout(pending.timer);
      if (message.type === "error")
        pending.reject(
          new Error([message.error, message.detail, message.hint].filter(Boolean).join("\n"))
        );
      else if (message.type === "connection-open-failed") pending.reject(new Error(message.error));
      else pending.resolve(message);
    },
    [endSession, rejectPending]
  );

  const connect = useCallback(
    async (mfaSessionId?: string) => {
      setIsConnecting(true);
      setError(null);
      setMfa(null);
      let resolve = () => {};
      let reject: (cause: Error) => void = () => {};
      const promise = new Promise<void>((settle, fail) => {
        resolve = settle;
        reject = fail;
      });
      promise.catch(() => {});
      readyRef.current = { promise, resolve, reject };
      try {
        const ticket = await webAccess.requestTicket({ accountId, reason, mfaSessionId });
        const channel = webAccess.openDataExplorer({
          accountId,
          ticket,
          onMessage,
          onClose: () => {
            if (channelRef.current === channel) endSession();
          }
        });
        channelRef.current = channel;
      } catch (cause) {
        setIsConnecting(false);
        const challenge = mfaSessionIdOf(cause);
        if (challenge) {
          setMfa({ sessionId: challenge, verifying: false });
          return;
        }
        setError(errorMessage(cause) ?? "Failed to connect to database");
        reject(new Error("Failed to connect"));
      }
    },
    [accountId, reason, webAccess, onMessage, endSession]
  );

  const disconnect = useCallback(() => {
    const channel = channelRef.current;
    channelRef.current = null;
    channel?.close();
    rejectPending("Disconnected");
  }, [rejectPending]);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  const verifyMfa = useCallback(async () => {
    if (!mfa) return;
    setMfa({ ...mfa, verifying: true });
    const outcome = await runMfa(mfa.sessionId);
    if (outcome === "verified") {
      connect(mfa.sessionId);
      return;
    }
    setMfa(null);
    setError(MFA_FAILED[outcome]);
  }, [mfa, runMfa, connect]);

  const send = useCallback(
    async <T extends DataExplorerServerMessage>(
      message: Record<string, unknown>,
      connectionId?: string
    ): Promise<T> => {
      await readyRef.current?.promise;
      const id = crypto.randomUUID();
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error("Request timed out"));
        }, REQUEST_TIMEOUT_MS);
        const channel = channelRef.current;
        if (!channel?.isOpen()) {
          clearTimeout(timer);
          reject(new Error("WebSocket not connected"));
          return;
        }
        pendingRef.current.set(id, {
          resolve: resolve as (reply: DataExplorerServerMessage) => void,
          reject,
          timer,
          connectionId
        });
        channel.send(JSON.stringify({ ...message, id }));
      });
    },
    []
  );

  const fireAndForget = useCallback((message: DataExplorerClientMessage) => {
    const channel = channelRef.current;
    if (channel?.isOpen()) channel.send(JSON.stringify(message));
  }, []);

  const openConnection = useCallback(async () => {
    const reply = await send<Reply<"connection-opened">>({ type: "open-connection" });
    return { connectionId: reply.connectionId, nativeConnectionId: reply.nativeConnectionId };
  }, [send]);

  const closeConnection = useCallback(
    (connectionId: string) => {
      rejectPending("Connection closed", connectionId);
      fireAndForget({ type: "close-connection", connectionId });
    },
    [rejectPending, fireAndForget]
  );

  const fetchSchemas = useCallback(
    async (): Promise<SchemaInfo[]> => (await send<Reply<"schemas">>({ type: "get-schemas" })).data,
    [send]
  );

  const fetchTables = useCallback(
    async (schema: string): Promise<TableInfo[]> =>
      (await send<Reply<"tables">>({ type: "get-tables", schema })).data,
    [send]
  );

  const fetchTableDetail = useCallback(
    async (
      connectionId: string,
      schema: string,
      table: string
    ): Promise<{ detail: TableDetail; transactionOpen: boolean }> => {
      const reply = await send<Reply<"table-detail">>(
        { type: "get-table-detail", connectionId, schema, table },
        connectionId
      );
      return { detail: reply.data, transactionOpen: reply.transactionOpen };
    },
    [send]
  );

  const executeQuery = useCallback(
    async (connectionId: string, sql: string): Promise<QueryResult> => {
      const { rows, fields, rowCount, isTruncated, transactionOpen, command, executionTimeMs } =
        await send<Reply<"query-result">>({ type: "query", connectionId, sql }, connectionId);
      return { rows, fields, rowCount, isTruncated, transactionOpen, command, executionTimeMs };
    },
    [send]
  );

  const cancelQuery = useCallback(
    (connectionId: string) => fireAndForget({ type: "cancel", connectionId }),
    [fireAndForget]
  );

  useEffect(() => {
    if (!isConnected) return undefined;
    const ping = () => {
      if (document.visibilityState === "visible") fireAndForget({ type: "activity" });
    };
    ping();
    const interval = setInterval(ping, ACTIVITY_PING_INTERVAL_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [isConnected, fireAndForget]);

  return {
    isConnected,
    isConnecting,
    error,
    mfa,
    connect,
    disconnect,
    reconnect,
    verifyMfa,
    openConnection,
    closeConnection,
    fetchSchemas,
    fetchTables,
    fetchTableDetail,
    executeQuery,
    cancelQuery
  };
};

export type TDataExplorerSession = ReturnType<typeof useDataExplorerSession>;
