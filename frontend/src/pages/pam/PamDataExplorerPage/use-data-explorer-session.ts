import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession/types";

import type {
  DataExplorerClientMessage,
  DataExplorerServerMessage,
  FieldInfo,
  SchemaInfo,
  TableDetail,
  TableInfo
} from "./data-explorer-types";

type PendingRequest = {
  resolve: (msg: DataExplorerServerMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type MfaState = {
  required: boolean;
  sessionId?: string;
  method?: string;
  verifying: boolean;
};

type ApprovalState = {
  required: boolean;
  policyName?: string;
  policyId?: string;
  creating: boolean;
  submitted: boolean;
  approvalRequestId?: string;
  errorMessage?: string;
};

type UseDataExplorerSessionOptions = {
  accountId: string;
  projectId: string;
  orgId: string;
  resourceName: string;
  accountName: string;
  onSessionEnd?: (reason?: string) => void;
};

const REQUEST_TIMEOUT_MS = 30_000;

export const useDataExplorerSession = ({
  accountId,
  projectId,
  orgId,
  resourceName,
  accountName,
  onSessionEnd
}: UseDataExplorerSessionOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mfaState, setMfaState] = useState<MfaState | null>(null);
  const [approvalState, setApprovalState] = useState<ApprovalState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
  const readyResolveRef = useRef<(() => void) | null>(null);
  const readyRejectRef = useRef<((err: Error) => void) | null>(null);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  const rejectAllPending = useCallback((reason: string) => {
    const pending = pendingRequestsRef.current;
    pending.forEach(({ reject: rej, timer }) => {
      clearTimeout(timer);
      rej(new Error(reason));
    });
    pending.clear();
  }, []);

  // --- WebSocket lifecycle (imperative, mirrors useWebAccessSession) ---

  const openWebSocket = useCallback(
    (ticket: string) => {
      const { protocol, host } = window.location;
      const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let serverMsg: DataExplorerServerMessage;
        try {
          serverMsg = JSON.parse(event.data as string) as DataExplorerServerMessage;
        } catch {
          return;
        }

        if (serverMsg.type === "ready") {
          setIsConnected(true);
          setIsConnecting(false);
          readyResolveRef.current?.();
          return;
        }

        if (serverMsg.type === "session_end") {
          wsRef.current = null;
          setIsConnected(false);
          setIsConnecting(false);
          rejectAllPending("Session ended");
          readyRejectRef.current?.(new Error("Session ended"));
          onSessionEndRef.current?.(serverMsg.reason);
          return;
        }

        // Request-response correlation
        if ("id" in serverMsg && serverMsg.id) {
          const pending = pendingRequestsRef.current.get(serverMsg.id);
          if (pending) {
            pendingRequestsRef.current.delete(serverMsg.id);
            clearTimeout(pending.timer);

            if (serverMsg.type === "error") {
              const errMsg = [serverMsg.error, serverMsg.detail, serverMsg.hint]
                .filter(Boolean)
                .join("\n");
              pending.reject(new Error(errMsg));
            } else {
              pending.resolve(serverMsg);
            }
          }
        }
      };

      ws.onclose = () => {
        // If wsRef was already cleared (by disconnect/cleanup or session_end handler), skip.
        if (wsRef.current !== ws) return;

        wsRef.current = null;
        setIsConnected(false);
        setIsConnecting(false);
        rejectAllPending("Connection closed");
        readyRejectRef.current?.(new Error("Connection closed"));
        onSessionEndRef.current?.();
      };

      ws.onerror = () => {
        // onclose always fires after onerror
      };
    },
    [accountId, rejectAllPending]
  );

  const connect = useCallback(
    async (mfaSessionId?: string) => {
      setIsConnecting(true);
      setErrorMessage(null);
      setMfaState(null);
      setApprovalState(null);

      readyPromiseRef.current = new Promise<void>((resolve, reject) => {
        readyResolveRef.current = resolve;
        readyRejectRef.current = reject;
      });
      // Prevent unhandled rejection — callers of sendRequest will see the error
      // when they await readyPromiseRef.current.
      readyPromiseRef.current.catch(() => {});

      try {
        const { data } = await apiRequest.post<{ ticket: string }>(
          `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
          { projectId, mfaSessionId }
        );
        openWebSocket(data.ticket);
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: {
            data?: {
              error?: string;
              message?: string;
              details?: {
                mfaSessionId?: string;
                mfaMethod?: string;
                policyId?: string;
                policyName?: string;
              };
            };
          };
        };

        if (axiosErr?.response?.data?.error === "SESSION_MFA_REQUIRED") {
          const { details } = axiosErr.response!.data!;
          setMfaState({
            required: true,
            sessionId: details?.mfaSessionId,
            method: details?.mfaMethod,
            verifying: false
          });
          setIsConnecting(false);
          return;
        }

        if (axiosErr?.response?.data?.error === "PolicyViolationError") {
          const { details } = axiosErr.response!.data!;
          setApprovalState({
            required: true,
            policyName: details?.policyName,
            policyId: details?.policyId,
            creating: false,
            submitted: false
          });
          setIsConnecting(false);
          return;
        }

        setErrorMessage(axiosErr?.response?.data?.message ?? "Failed to connect to database");
        setIsConnecting(false);
        readyRejectRef.current?.(new Error("Failed to connect"));
      }
    },
    [accountId, projectId, openWebSocket]
  );

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    // Clear ref BEFORE close — so onclose sees wsRef.current !== ws and skips.
    wsRef.current = null;
    if (ws) ws.close();
    rejectAllPending("Disconnected");
  }, [rejectAllPending]);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  // MFA flow
  const handleMfaVerification = useCallback(async () => {
    if (!mfaState?.sessionId) return;

    const mfaUrl = `${window.location.origin}/mfa-session/${mfaState.sessionId}`;
    window.open(mfaUrl, "_blank");

    setMfaState((prev) => (prev ? { ...prev, verifying: true } : null));

    const MFA_POLL_INTERVAL = 2000;
    const MFA_TIMEOUT = 5 * 60 * 1000;
    const startTime = Date.now();

    const verified = await new Promise<boolean>((resolve) => {
      const interval = setInterval(async () => {
        if (Date.now() - startTime > MFA_TIMEOUT) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        try {
          const resp = await apiRequest.get<TMfaSessionStatusResponse>(
            `/api/v2/mfa-sessions/${mfaState.sessionId}/status`
          );
          if (resp.data.status === MfaSessionStatus.ACTIVE) {
            clearInterval(interval);
            resolve(true);
          }
        } catch {
          clearInterval(interval);
          resolve(false);
        }
      }, MFA_POLL_INTERVAL);
    });

    if (verified) {
      connect(mfaState.sessionId);
    } else {
      setMfaState((prev) => (prev ? { ...prev, verifying: false } : null));
      setErrorMessage("MFA verification timed out or failed");
    }
  }, [mfaState, connect]);

  // Approval request flow
  const submitApprovalRequest = useCallback(
    async (justification?: string) => {
      if (!approvalState?.required) return;
      setApprovalState((prev) =>
        prev ? { ...prev, creating: true, errorMessage: undefined } : null
      );

      try {
        const { data: approvalData } = await apiRequest.post<{ request: { id: string } }>(
          "/api/v1/approval-policies/pam-access/requests",
          {
            projectId,
            requestData: {
              accessDuration: "1h",
              resourceName,
              accountName
            },
            justification: justification?.trim() || undefined
          }
        );
        setApprovalState((prev) =>
          prev
            ? {
                ...prev,
                creating: false,
                submitted: true,
                approvalRequestId: approvalData.request.id
              }
            : null
        );
      } catch {
        setApprovalState((prev) =>
          prev
            ? { ...prev, creating: false, errorMessage: "Failed to create approval request" }
            : null
        );
      }
    },
    [approvalState, projectId, resourceName, accountName]
  );

  const approvalRequestUrl = approvalState?.approvalRequestId
    ? `${window.location.origin}/organizations/${orgId}/projects/pam/${projectId}/approval-requests/${approvalState.approvalRequestId}`
    : undefined;

  // --- Request helpers ---

  const sendRequest = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async <T extends DataExplorerServerMessage>(msg: Record<string, any>): Promise<T> => {
      if (readyPromiseRef.current) {
        await readyPromiseRef.current;
      }

      const id = crypto.randomUUID();
      const fullMsg = { ...msg, id } as DataExplorerClientMessage;

      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequestsRef.current.delete(id);
          reject(new Error("Request timed out"));
        }, REQUEST_TIMEOUT_MS);

        pendingRequestsRef.current.set(id, {
          resolve: resolve as (m: DataExplorerServerMessage) => void,
          reject,
          timer
        });

        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(fullMsg));
        } else {
          pendingRequestsRef.current.delete(id);
          clearTimeout(timer);
          reject(new Error("WebSocket not connected"));
        }
      });
    },
    []
  );

  const fetchSchemas = useCallback(async (): Promise<SchemaInfo[]> => {
    const resp = await sendRequest<Extract<DataExplorerServerMessage, { type: "schemas" }>>({
      type: "get-schemas"
    });
    return resp.data;
  }, [sendRequest]);

  const fetchTables = useCallback(
    async (schema: string): Promise<TableInfo[]> => {
      const resp = await sendRequest<Extract<DataExplorerServerMessage, { type: "tables" }>>({
        type: "get-tables",
        schema
      });
      return resp.data;
    },
    [sendRequest]
  );

  const fetchTableDetail = useCallback(
    async (schema: string, table: string): Promise<TableDetail> => {
      const resp = await sendRequest<Extract<DataExplorerServerMessage, { type: "table-detail" }>>({
        type: "get-table-detail",
        schema,
        table
      });
      return resp.data;
    },
    [sendRequest]
  );

  const cancelQuery = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cancel" }));
    }
  }, []);

  const executeQuery = useCallback(
    async (
      sql: string
    ): Promise<{
      rows: Record<string, unknown>[];
      fields: FieldInfo[];
      rowCount: number | null;
      command: string;
      executionTimeMs: number;
    }> => {
      const resp = await sendRequest<Extract<DataExplorerServerMessage, { type: "query-result" }>>({
        type: "query",
        sql
      });
      return {
        rows: resp.rows,
        fields: resp.fields,
        rowCount: resp.rowCount,
        command: resp.command,
        executionTimeMs: resp.executionTimeMs
      };
    },
    [sendRequest]
  );

  // No auto-connect here — the page component drives connection lifecycle,
  // same as useWebAccessSession where containerEl gates the connect call.

  return {
    isConnected,
    isConnecting,
    errorMessage,
    mfaState,
    approvalState,
    connect,
    disconnect,
    reconnect,
    handleMfaVerification,
    submitApprovalRequest,
    approvalRequestUrl,
    fetchSchemas,
    fetchTables,
    fetchTableDetail,
    executeQuery,
    cancelQuery
  };
};
