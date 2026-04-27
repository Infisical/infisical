import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  DatabaseIcon,
  PlusIcon,
  ShieldCheckIcon,
  TableIcon,
  TerminalSquareIcon,
  UnplugIcon,
  XIcon
} from "lucide-react";

import { Spinner } from "@app/components/v2";
import { Button } from "@app/components/v3/generic/Button";
import { cn } from "@app/components/v3/utils";
import { useGetPamAccountById } from "@app/hooks/api/pam";

import { DataExplorerGrid } from "./components/DataExplorerGrid";
import { DataExplorerSidebar } from "./components/DataExplorerSidebar";
import { QueryPanel } from "./components/QueryPanel";
import type { SchemaInfo, TableInfo } from "./data-explorer-types";
import { useDataExplorerSession } from "./use-data-explorer-session";
import { useQueryTabs } from "./use-query-tabs";

type Props = {
  reason?: string;
};

export const PamDataExplorerPage = ({ reason }: Props = {}) => {
  const { accountId, projectId, orgId } = useParams({
    strict: false
  }) as {
    accountId: string;
    projectId: string;
    orgId: string;
  };

  const { data: account } = useGetPamAccountById(accountId);

  // Sidebar-only view state. Switching schemas in the sidebar does not alter
  // open tabs — tabs are bound to their own (schema, table) at open time.
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("public");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [hasDisconnected, setHasDisconnected] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);
  const latestSchemaRequestRef = useRef(0);
  const tabElRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const [approvalJustification, setApprovalJustification] = useState("");

  // Forward refs for tab-state handlers that useDataExplorerSession calls
  // before useQueryTabs has been called. Assigned after useQueryTabs below.
  const markConnectionDeadRef = useRef<((connId: string) => void) | null>(null);
  const resetTabsRef = useRef<(() => void) | null>(null);
  const openFirstQueryTabRef = useRef<(() => Promise<string | null>) | null>(null);
  // Shared guard so the first-connect effect and onReconnected don't both
  // end up opening a default tab.
  const defaultTabOpenedRef = useRef(false);

  const {
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
    openConnection,
    closeConnection,
    fetchSchemas,
    fetchTables,
    fetchTableDetail,
    executeQuery,
    cancelQuery
  } = useDataExplorerSession({
    accountId,
    projectId,
    orgId,
    resourceName: account?.resource?.name ?? "",
    accountName: account?.name ?? "",
    reason,
    onSessionEnd: (endReason?: string) => {
      setHasDisconnected(true);
      setDisconnectReason(endReason ?? null);
    },
    onConnectionClosed: (connId: string) => {
      markConnectionDeadRef.current?.(connId);
    },
    onReconnected: () => {
      // Drop all tabs on reconnect — all connectionIds are invalid.
      resetTabsRef.current?.();
      // Claim the default-tab slot so the first-connect effect skips it.
      defaultTabOpenedRef.current = true;
      const opener = openFirstQueryTabRef.current;
      if (opener) opener().catch(() => {});
    }
  });

  const {
    tabs,
    activeTabId,
    atTabLimit,
    isOpeningTab,
    openQueryTab,
    openBrowseTab,
    closeTab,
    setActiveTab,
    updateTabSql,
    setTabTransactionOpen,
    markConnectionDead,
    resetTabs,
    refreshBrowseTab,
    MAX_TABS
  } = useQueryTabs({
    openConnection,
    closeConnection,
    fetchTableDetail
  });

  markConnectionDeadRef.current = markConnectionDead;
  resetTabsRef.current = resetTabs;
  openFirstQueryTabRef.current = openQueryTab;

  // Drive connection from the page, not the hook.
  // Use a ref callback as the gate (same approach as useWebAccessSession's containerEl).
  // The ref callback fires once after the real DOM mount — StrictMode's simulated
  // unmount/remount does NOT re-fire ref callbacks, so we get exactly one connect.
  const connectedOnceRef = useRef(false);
  const mountRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && !connectedOnceRef.current) {
        connectedOnceRef.current = true;
        connect();
      }
    },
    [connect]
  );

  // Cleanup on real unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTables = useCallback(
    async (schema: string) => {
      // Guard against stale responses when the user switches schemas quickly.
      // Only apply results if this is still the latest request.
      latestSchemaRequestRef.current += 1;
      const requestId = latestSchemaRequestRef.current;
      setIsLoadingTables(true);
      try {
        const result = await fetchTables(schema);
        if (latestSchemaRequestRef.current !== requestId) return;
        setTables(result);
      } catch {
        // Error handled by the hook
      } finally {
        if (latestSchemaRequestRef.current === requestId) {
          setIsLoadingTables(false);
        }
      }
    },
    [fetchTables]
  );

  const loadSchemas = useCallback(
    async (keepSelected = false) => {
      setIsLoadingSchemas(true);
      try {
        const result = await fetchSchemas();
        setSchemas(result);
        const hasSelected = result.find((s) => s.name === selectedSchema);
        const activeSchema = hasSelected ? selectedSchema : (result[0]?.name ?? "public");
        if (!hasSelected && result.length > 0 && !keepSelected) {
          setSelectedSchema(activeSchema);
        }
        if (result.length > 0) {
          await loadTables(activeSchema);
        }
      } catch {
        // Error handled by the hook
      } finally {
        setIsLoadingSchemas(false);
      }
    },
    [fetchSchemas, loadTables, selectedSchema]
  );

  // Keep the active tab visible in the tab bar whenever activation changes
  // (tab switch, new tab opened, sidebar table opened, etc.). Only scrolls the
  // tab bar itself — not ancestor containers — so the rest of the page layout
  // stays put.
  useEffect(() => {
    if (!activeTabId) return;
    const el = tabElRefs.current.get(activeTabId);
    const container = el?.parentElement;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    if (elRect.left < cRect.left) {
      container.scrollBy({ left: elRect.left - cRect.left, behavior: "smooth" });
    } else if (elRect.right > cRect.right) {
      container.scrollBy({ left: elRect.right - cRect.right, behavior: "smooth" });
    }
  }, [activeTabId, tabs.length]);

  // Auto-load schemas when we transition to connected
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      wasConnectedRef.current = true;
      setHasDisconnected(false);
      (async () => {
        await loadSchemas();
        // Open a default query tab once — onReconnected handles subsequent
        // reconnects via defaultTabOpenedRef, so we don't double-open.
        if (!defaultTabOpenedRef.current) {
          defaultTabOpenedRef.current = true;
          await openQueryTab();
        }
      })().catch(() => {});
    }
    if (!isConnected) {
      wasConnectedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const handleSchemaChange = useCallback(
    (schema: string) => {
      setSelectedSchema(schema);
      loadTables(schema);
    },
    [loadTables]
  );

  const handleTableOpen = useCallback(
    (tableName: string, opts: { forceNew: boolean }) => {
      openBrowseTab(selectedSchema, tableName, opts).catch(() => {});
    },
    [selectedSchema, openBrowseTab]
  );

  const handleReconnect = useCallback(() => {
    setHasDisconnected(false);
    setDisconnectReason(null);
    setSchemas([]);
    setTables([]);
    resetTabs();
    reconnect();
  }, [reconnect, resetTabs]);

  // Tab-scoped refresh: re-fetches tableDetail + schemas + sidebar tables.
  // The grid also re-runs its own SELECT after this completes.
  const handleTabRefresh = useCallback(
    async (tabId: string) => {
      await Promise.all([refreshBrowseTab(tabId), loadSchemas(true), loadTables(selectedSchema)]);
    },
    [refreshBrowseTab, loadSchemas, loadTables, selectedSchema]
  );

  const activeBrowseTarget = (() => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (active?.kind === "browse") return { schema: active.schema, table: active.table };
    return null;
  })();

  // --- Overlay states (shown instead of the main layout) ---

  if (isConnecting && !isConnected) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bunker-800">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-mineshaft-300">Connecting to database...</p>
      </div>
    );
  }

  if (mfaState?.required) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bunker-800">
        <ShieldCheckIcon className="size-8 text-mineshaft-400" />
        <h2 className="text-sm font-medium text-mineshaft-100">MFA Verification Required</h2>
        <p className="max-w-sm text-center text-xs text-mineshaft-400">
          Multi-factor authentication is required to access this database account.
        </p>
        {mfaState.verifying ? (
          <div className="flex items-center gap-2 text-xs text-mineshaft-400">
            <Spinner className="h-4 w-4" />
            Waiting for verification...
          </div>
        ) : (
          <Button variant="outline" size="xs" onClick={handleMfaVerification}>
            Verify MFA
          </Button>
        )}
      </div>
    );
  }

  if (approvalState?.required) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bunker-800">
        <AlertTriangleIcon className="size-8 text-mineshaft-400" />
        <h2 className="text-sm font-medium text-mineshaft-100">Approval Required</h2>
        <p className="max-w-sm text-center text-xs text-mineshaft-400">
          This account is protected by policy: {approvalState.policyName ?? "Unknown"}
        </p>
        {approvalState.submitted ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-mineshaft-300">Approval request created successfully.</p>
            {approvalRequestUrl && (
              <a
                href={approvalRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-500 underline hover:text-primary-400"
              >
                View approval request
              </a>
            )}
            <Button variant="outline" size="xs" onClick={handleReconnect}>
              Reconnect
            </Button>
          </div>
        ) : (
          <div className="flex w-full max-w-sm flex-col gap-2">
            <textarea
              className="w-full rounded border border-mineshaft-600 bg-bunker-700 px-3 py-2 text-xs text-mineshaft-200 placeholder:text-mineshaft-500 focus:border-mineshaft-400 focus:outline-none"
              placeholder="Justification (optional)"
              rows={2}
              value={approvalJustification}
              onChange={(e) => setApprovalJustification(e.target.value)}
            />
            {approvalState.errorMessage && (
              <p className="text-xs text-red-400">{approvalState.errorMessage}</p>
            )}
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="xs"
                isPending={approvalState.creating}
                onClick={() => submitApprovalRequest(approvalJustification)}
              >
                Create Approval Request
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (errorMessage && !isConnected) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bunker-800">
        <AlertTriangleIcon className="size-8 text-mineshaft-400" />
        <h2 className="text-sm font-medium text-mineshaft-100">Connection Error</h2>
        <p className="max-w-sm text-center text-xs text-mineshaft-400">{errorMessage}</p>
        <Button variant="outline" size="xs" onClick={handleReconnect}>
          Try Again
        </Button>
      </div>
    );
  }

  if (hasDisconnected && !isConnected && !isConnecting) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bunker-800">
        <UnplugIcon className="size-8 text-mineshaft-400" />
        <h2 className="text-sm font-medium text-mineshaft-100">Disconnected</h2>
        <p className="text-xs text-mineshaft-400">
          {disconnectReason ?? "The database connection was closed."}
        </p>
        <Button variant="outline" size="xs" onClick={handleReconnect}>
          Reconnect
        </Button>
      </div>
    );
  }

  // --- Main layout ---

  const tabOpeningDisabled = isOpeningTab || atTabLimit;

  return (
    <div ref={mountRef} className="flex h-screen w-screen flex-col bg-bunker-800">
      <div className="flex flex-1 overflow-hidden">
        <DataExplorerSidebar
          schemas={schemas}
          selectedSchema={selectedSchema}
          onSchemaChange={handleSchemaChange}
          tables={tables}
          activeBrowseTarget={activeBrowseTarget}
          onTableOpen={handleTableOpen}
          isLoadingSchemas={isLoadingSchemas}
          isLoadingTables={isLoadingTables}
          disabled={isOpeningTab}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex min-h-[34px] shrink-0 items-center overflow-x-auto border-b border-mineshaft-600 bg-mineshaft-800 px-2 [scrollbar-color:transparent_transparent] [scrollbar-width:thin] hover:[scrollbar-color:#4a4b4e_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-mineshaft-600 [&::-webkit-scrollbar-track]:bg-transparent">
            {tabs.map((tab) => {
              const isActive = activeTabId === tab.id;
              const Icon = tab.kind === "browse" ? TableIcon : TerminalSquareIcon;
              return (
                <div
                  key={tab.id}
                  ref={(el) => {
                    if (el) tabElRefs.current.set(tab.id, el);
                    else tabElRefs.current.delete(tab.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveTab(tab.id)}
                  className={cn(
                    "group flex shrink-0 cursor-pointer items-center gap-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "border-info text-mineshaft-100"
                      : "border-transparent text-mineshaft-400 hover:text-mineshaft-200",
                    tab.isDead && "text-red-400"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon className="size-3.5" />
                    {tab.title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="ml-1 rounded p-0.5 text-mineshaft-300 transition-colors hover:text-mineshaft-100"
                    aria-label={`Close ${tab.title}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => {
                openQueryTab().catch(() => {});
              }}
              disabled={tabOpeningDisabled}
              className="ml-1 flex shrink-0 items-center gap-1.5 rounded border border-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300 transition-colors first:ml-0 hover:border-mineshaft-500 hover:text-mineshaft-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-mineshaft-600 disabled:hover:text-mineshaft-300"
              aria-label="New query tab"
              title={atTabLimit ? `Tab limit (${MAX_TABS}) reached` : "New query tab"}
            >
              <PlusIcon className="size-3" />
              New query
            </button>
          </div>

          {/* All tabs are mounted; inactive tabs are CSS-hidden so their
              component instance state (filters, pagination, SQL, results)
              survives tab switches. */}
          {tabs.map((tab) => {
            const deadTabView = (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <AlertTriangleIcon className="size-8 text-red-400" />
                <p className="text-sm text-mineshaft-300">
                  This connection was closed and cannot be reused.
                </p>
                <Button variant="outline" size="xs" onClick={() => closeTab(tab.id)}>
                  Close tab
                </Button>
              </div>
            );
            let content;
            if (tab.isDead) {
              content = deadTabView;
            } else if (tab.kind === "browse") {
              content = (
                <DataExplorerGrid
                  key={tab.id}
                  tableDetail={tab.tableDetail}
                  tableType={tables.find((t) => t.name === tab.table)?.tableType}
                  schema={tab.schema}
                  table={tab.table}
                  connectionId={tab.connectionId}
                  executeQuery={executeQuery}
                  isLoading={tab.isLoadingDetail}
                  onRefresh={() => handleTabRefresh(tab.id)}
                />
              );
            } else {
              content = (
                <QueryPanel
                  key={tab.id}
                  tab={tab}
                  executeQuery={executeQuery}
                  cancelQuery={cancelQuery}
                  onSqlChange={(sql) => updateTabSql(tab.id, sql)}
                  onTransactionStateChange={(open) => setTabTransactionOpen(tab.id, open)}
                />
              );
            }
            return (
              <div
                key={tab.id}
                className={cn("flex flex-1 overflow-hidden", activeTabId !== tab.id && "hidden")}
              >
                {content}
              </div>
            );
          })}

          {tabs.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <DatabaseIcon className="size-12 text-mineshaft-600" />
              <p className="text-sm text-mineshaft-400">No tabs open</p>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  openQueryTab().catch(() => {});
                }}
                isPending={isOpeningTab}
              >
                New query tab
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5 text-xs">
        <span className="text-mineshaft-400">
          {tables.length} table{tables.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-4">
          <span>
            <span className="text-mineshaft-400">Resource:</span>{" "}
            <span className="text-mineshaft-300">{account?.resource?.name ?? "Database"}</span>
          </span>
          <span className="text-mineshaft-500">|</span>
          <span>
            <span className="text-mineshaft-400">Account:</span>{" "}
            <span className="text-mineshaft-300">{account?.name ?? "Account"}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
