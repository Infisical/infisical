import { useCallback, useEffect, useRef, useState } from "react";
import {
  faHistory,
  faPlay,
  faPlugCircleCheck,
  faPlugCircleXmark,
  faSpinner,
  faTable
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, Table, TableContainer, TBody, Td, Th, THead, Tr } from "@app/components/v2";
import { useCreateSqlSession } from "@app/hooks/api/pam";
import { getAuthToken } from "@app/hooks/api/reactQuery";

// must be the same as the frontend. currently not a way to share these across the frontend and backend.
enum SqlProxyMessageType {
  Query = "query",
  Close = "close",
  Status = "status",
  Result = "result",
  Error = "error",
  Connected = "connected",
  Disconnected = "disconnected"
}

type TConnectionInfo = {
  host: string;
  port: number;
  database: string;
  resourceName: string;
  accountName: string;
};

type TSqlQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  command: string;
  duration: number;
};

type TQueryHistoryItem = {
  query: string;
  timestamp: Date;
  success: boolean;
  duration?: number;
  rowCount?: number;
};

type Props = {
  sessionId: string;
};

export const SqlConsoleSection = ({ sessionId: initialSessionId }: Props) => {
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId);
  const [isConnecting, setIsConnecting] = useState(true); // Start as connecting (auto-connect)
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<TConnectionInfo | null>(null);
  const [query, setQuery] = useState("SELECT 1;");
  const [isExecuting, setIsExecuting] = useState(false);
  const [results, setResults] = useState<TSqlQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<TQueryHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const connectionInitiatedRef = useRef(false);
  const queryRef = useRef(query);
  const isConnectedRef = useRef(isConnected);
  const currentSessionIdRef = useRef(currentSessionId);
  const reconnectAttemptRef = useRef(0);
  const hasEverConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDisconnectedRef = useRef(false);
  const maxReconnectAttempts = 10;

  const createSqlSession = useCreateSqlSession();

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const attemptReconnect = useCallback(async () => {
    // if info is stored on refresh, use it to reconnect
    const storedInfo = sessionStorage.getItem(`sql-console-${initialSessionId}`);
    if (!storedInfo) {
      setConnectionError("Session expired. Please go back and start a new session.");
      setIsConnecting(false);
      return false;
    }

    try {
      setIsReconnecting(true);
      const { accountPath, projectId, duration } = JSON.parse(storedInfo) as {
        accountPath: string;
        projectId: string;
        duration: string;
      };

      const response = await createSqlSession.mutateAsync({
        accountPath,
        projectId,
        duration
      });

      sessionStorage.setItem(
        `sql-console-${response.sessionId}`,
        JSON.stringify({ accountPath, projectId, duration })
      );

      setCurrentSessionId(response.sessionId);
      connectionInitiatedRef.current = false;
      setIsReconnecting(false);
      return true;
    } catch (err) {
      setConnectionError("Failed to reconnect. Please go back and start a new session.");
      setIsConnecting(false);
      setIsReconnecting(false);
      return false;
    }
  }, [initialSessionId, createSqlSession]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [query]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data as string);

      switch (message.type) {
        case SqlProxyMessageType.Connected:
          setIsConnected(true);
          setIsConnecting(false);
          setIsAutoReconnecting(false);
          setConnectionError(null);
          reconnectAttemptRef.current = 0;
          hasEverConnectedRef.current = true;
          setConnectionInfo({
            host: message.host,
            port: message.port,
            database: message.database,
            resourceName: message.resourceName,
            accountName: message.accountName
          });
          createNotification({
            text: `Connected to ${message.resourceName} (${message.accountName})`,
            type: "success"
          });
          break;

        case SqlProxyMessageType.Disconnected:
          setIsConnected(false);
          setConnectionInfo(null);
          createNotification({
            text: "Disconnected from database",
            type: "info"
          });
          break;

        case SqlProxyMessageType.Result:
          setIsExecuting(false);
          setResults(message.data);
          setError(null);
          setQueryHistory((prev) => [
            {
              query: queryRef.current.trim(),
              timestamp: new Date(),
              success: true,
              duration: message.data.duration,
              rowCount: message.data.rowCount
            },
            ...prev.slice(0, 49)
          ]);
          break;

        case SqlProxyMessageType.Error:
          setIsExecuting(false);
          if (!isConnectedRef.current) {
            void attemptReconnect();
          } else {
            setError(message.message);
            setQueryHistory((prev) => [
              {
                query: queryRef.current.trim(),
                timestamp: new Date(),
                success: false
              },
              ...prev.slice(0, 49)
            ]);
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    const { protocol, hostname, port } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const wsPort = port ? `:${port}` : "";
    const token = getAuthToken();
    const activeSessionId = currentSessionIdRef.current;
    const wsUrl = `${wsProtocol}//${hostname}${wsPort}/api/v1/pam/sql-proxy/${activeSessionId}/ws`;

    // pass token via Sec-WebSocket-Protocol header
    const base64UrlEncode = (str: string) => {
      return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const tokenProtocol = token ? `bearer-${base64UrlEncode(token)}` : undefined;
    const ws = new WebSocket(wsUrl, tokenProtocol ? [tokenProtocol] : undefined);

    ws.onopen = () => {
      wsRef.current = ws;
    };

    ws.onmessage = handleMessage;

    ws.onclose = (event) => {
      setIsConnected(false);
      wsRef.current = null;
      
      // don't reconnect if user initiated the disconnect
      if (userDisconnectedRef.current) {
        userDisconnectedRef.current = false;
        setConnectionInfo(null);
        return;
      }
      
      // if websocket is closed unexpectedly, attempt to reconnect (up to maxReconnectAttempts times)
      if (event.code !== 1000 && event.code !== 1001) {
        // don't schedule another reconnect if one is already pending
        if (reconnectTimeoutRef.current) {
          return;
        }
        
        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          setIsAutoReconnecting(true);
          setConnectionError(null);
          
          // exponential backoff: 1s, 2s, 4s, 8s, 16s
          const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 32000);
          reconnectAttemptRef.current += 1;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (!wsRef.current) {
              connectionInitiatedRef.current = false;
              connectWebSocket();
            }
          }, delay);
        } else {
          setIsAutoReconnecting(false);
          setConnectionInfo(null);
          setConnectionError("Server error. Please try again later.");
        }
      } else {
        // user closed the connection
        setConnectionInfo(null);
        setIsAutoReconnecting(false);
        // clear any pending reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      }
    };

    ws.onerror = () => {
      setIsConnecting(false);
      if (!reconnectAttemptRef.current) {
        setConnectionError("WebSocket connection failed");
        createNotification({
          text: "WebSocket connection error",
          type: "error"
        });
      }
    };

    return ws;
  }, [handleMessage]);

  useEffect(() => {
    if (connectionInitiatedRef.current) {
      return;
    }
    connectionInitiatedRef.current = true;

    setIsConnecting(true);
    setConnectionError(null);
    connectWebSocket();

    let closeSent = false;
    const sendClose = () => {
      if (closeSent) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        closeSent = true;
        wsRef.current.send(JSON.stringify({ type: SqlProxyMessageType.Close }));
        wsRef.current.close();
      }
    };

    window.addEventListener("beforeunload", sendClose);

    return () => {
      window.removeEventListener("beforeunload", sendClose);
      sendClose();
    };
  }, [connectWebSocket, currentSessionId]);

  const handleDisconnect = () => {
    userDisconnectedRef.current = true;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: SqlProxyMessageType.Close }));
    }
    setIsConnected(false);
    setConnectionInfo(null);
    setResults(null);
  };

  const handleExecuteQuery = () => {
    if (!query.trim()) {
      createNotification({
        text: "Please enter a query",
        type: "error"
      });
      return;
    }

    if (!isConnected) {
      createNotification({
        text: "Not connected to database",
        type: "error"
      });
      return;
    }

    setIsExecuting(true);
    setError(null);
    setResults(null);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: SqlProxyMessageType.Query,
          query: query.trim()
        })
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // also execute on ctrl/cmd + enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecuteQuery();
    }
  };

  const loadQueryFromHistory = (historyQuery: string) => {
    setQuery(historyQuery);
    setShowHistory(false);
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  // loading state
  if (isConnecting || isReconnecting) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4 px-6">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-4xl text-primary-500" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-mineshaft-100">
            {isReconnecting ? "Reconnecting..." : "Connecting to Database..."}
          </h2>
          <p className="mt-1 text-sm text-mineshaft-400">
            {isReconnecting
              ? "Creating a new session after page refresh"
              : "Establishing secure connection using your PAM credentials"}
          </p>
        </div>
      </div>
    );
  }

  // error state - only show full-page error if we never connected at all
  if (connectionError && !isConnected && !hasEverConnectedRef.current) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4 px-6">
        <FontAwesomeIcon icon={faPlugCircleXmark} className="text-4xl text-red-500" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-mineshaft-100">Connection Failed</h2>
          <p className="mt-2 max-w-md text-sm text-red-400">{connectionError}</p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-4"
            colorSchema="primary"
            variant="outline_bg"
          >
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 pb-6">
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={twMerge(
                "flex size-12 items-center justify-center rounded-lg",
                isConnected ? "bg-green-500/20" : "bg-red-500/20"
              )}
            >
              <FontAwesomeIcon
                icon={isConnected ? faPlugCircleCheck : faPlugCircleXmark}
                className={twMerge("text-xl", isConnected ? "text-green-500" : "text-red-500")}
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-mineshaft-100">
                {connectionInfo?.resourceName || "PostgreSQL Database"}
              </h2>
              {connectionInfo ? (
                <p className="text-sm text-mineshaft-400">
                  <span className="font-medium text-mineshaft-300">
                    {connectionInfo.accountName}
                  </span>{" "}
                  •{" "}
                  <span className="font-mono">
                    {connectionInfo.database}@{connectionInfo.host}:{connectionInfo.port}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-mineshaft-400">Session disconnected</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={twMerge(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                isConnected && "bg-green-500/20 text-green-400",
                isAutoReconnecting && "bg-yellow-500/20 text-yellow-400",
                !isConnected && !isAutoReconnecting && "bg-red-500/20 text-red-400"
              )}
            >
              {isAutoReconnecting ? (
                <FontAwesomeIcon icon={faSpinner} className="size-2 animate-spin" />
              ) : (
                <span
                  className={twMerge(
                    "size-2 rounded-full",
                    isConnected ? "bg-green-500" : "bg-red-500"
                  )}
                />
              )}
              {isConnected && "Connected"}
              {isAutoReconnecting && "Reconnecting..."}
              {!isConnected && !isAutoReconnecting && (connectionError ? "Server Error" : "Disconnected")}
            </span>
            {isConnected && (
              <Button
                onClick={handleDisconnect}
                leftIcon={<FontAwesomeIcon icon={faPlugCircleXmark} />}
                colorSchema="danger"
                variant="outline_bg"
                size="sm"
              >
                Disconnect
              </Button>
            )}
            {!isConnected && !isAutoReconnecting && (
              <Button
                onClick={() => {
                  // close any pending reconnect attempt
                  if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                  }
                  reconnectAttemptRef.current = 0;
                  setIsAutoReconnecting(false);
                  setConnectionError(null);
                  setIsConnecting(true);
                  void attemptReconnect();
                }}
                leftIcon={<FontAwesomeIcon icon={faPlugCircleCheck} />}
                colorSchema="primary"
                variant="outline_bg"
                size="sm"
              >
                Reconnect
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-mineshaft-100">
            <FontAwesomeIcon icon={faTable} className="text-mineshaft-400" />
            SQL Query Editor
          </h2>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowHistory(!showHistory)}
              variant="outline_bg"
              colorSchema="secondary"
              size="xs"
              leftIcon={<FontAwesomeIcon icon={faHistory} />}
            >
              History ({queryHistory.length})
            </Button>
          </div>
        </div>

        {showHistory && queryHistory.length > 0 && (
          <div className="mb-4 max-h-48 overflow-y-auto rounded-md border border-mineshaft-600 bg-mineshaft-800">
            {queryHistory.map((item, index) => (
              <button
                key={`${item.timestamp.getTime()}-${index}`}
                type="button"
                onClick={() => loadQueryFromHistory(item.query)}
                className="flex w-full items-center justify-between border-b border-mineshaft-700 p-3 text-left transition-colors last:border-b-0 hover:bg-mineshaft-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-mineshaft-200">{item.query}</p>
                  <p className="mt-1 text-xs text-mineshaft-400">
                    {item.timestamp.toLocaleTimeString()}
                    {item.duration !== undefined && ` • ${item.duration}ms`}
                    {item.rowCount !== undefined && ` • ${item.rowCount} rows`}
                  </p>
                </div>
                <span
                  className={twMerge(
                    "ml-3 size-2 rounded-full",
                    item.success ? "bg-green-500" : "bg-red-500"
                  )}
                />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="SELECT * FROM users LIMIT 10;"
              className={twMerge(
                "w-full min-h-[120px] resize-none rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 font-mono text-sm text-mineshaft-100",
                "placeholder:text-mineshaft-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              )}
              spellCheck={false}
            />
            <div className="absolute bottom-3 right-3 text-xs text-mineshaft-500">
              Ctrl/Cmd + Enter to execute
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              onClick={handleExecuteQuery}
              isLoading={isExecuting}
              isDisabled={!query.trim() || isExecuting || !isConnected || isAutoReconnecting}
              leftIcon={
                isExecuting ? (
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                ) : (
                  <FontAwesomeIcon icon={faPlay} />
                )
              }
              colorSchema="primary"
            >
              {isExecuting ? "Executing..." : "Run Query"}
            </Button>
            {results && (
              <span className="text-sm text-mineshaft-400">
                {results.rowCount} row{results.rowCount !== 1 ? "s" : ""} • {results.duration}ms •{" "}
                {results.command}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <h3 className="mb-2 font-semibold text-red-400">Error</h3>
          <pre className="whitespace-pre-wrap font-mono text-sm text-red-300">{error}</pre>
        </div>
      )}

      {results && results.rows.length > 0 && (
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900">
          <div className="border-b border-mineshaft-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-mineshaft-100">Query Results</h2>
          </div>
          <div className="max-h-[500px] overflow-auto">
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    {results.columns.map((column) => (
                      <Th key={column} className="whitespace-nowrap font-mono text-xs">
                        {column}
                      </Th>
                    ))}
                  </Tr>
                </THead>
                <TBody>
                  {results.rows.map((row, rowIndex) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Tr key={rowIndex}>
                      {results.columns.map((column) => (
                        <Td
                          key={`${rowIndex}-${column}`}
                          className="max-w-xs truncate font-mono text-xs"
                          title={formatValue(row[column])}
                        >
                          <span
                            className={twMerge(row[column] === null && "italic text-mineshaft-500")}
                          >
                            {formatValue(row[column])}
                          </span>
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </div>
        </div>
      )}

      {results && results.rows.length === 0 && (
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-8 text-center">
          <FontAwesomeIcon icon={faTable} className="mb-3 text-4xl text-mineshaft-500" />
          <h3 className="text-lg font-medium text-mineshaft-300">No Rows Returned</h3>
          <p className="mt-1 text-sm text-mineshaft-400">
            {results.command}: {results.rowCount} row{results.rowCount !== 1 ? "s" : ""} affected
          </p>
        </div>
      )}
    </div>
  );
};
