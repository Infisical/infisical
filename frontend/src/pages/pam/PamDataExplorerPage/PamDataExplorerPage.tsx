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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3/generic/AlertDialog";
import { Button } from "@app/components/v3/generic/Button";
import { cn } from "@app/components/v3/utils";
import { useGetPamAccountById } from "@app/hooks/api/pam";

import { DataExplorerGrid } from "./components/DataExplorerGrid";
import { DataExplorerSidebar } from "./components/DataExplorerSidebar";
import { QueryPanel } from "./components/QueryPanel";
import type { SchemaInfo, TableDetail, TableInfo } from "./data-explorer-types";
import { useDataExplorerSession } from "./use-data-explorer-session";
import { BROWSE_TAB_ID, useQueryTabs } from "./use-query-tabs";

export const PamDataExplorerPage = () => {
  const { accountId, projectId, orgId } = useParams({
    strict: false
  }) as {
    accountId: string;
    projectId: string;
    orgId: string;
  };

  const { data: account } = useGetPamAccountById(accountId);

  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("public");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableDetail, setTableDetail] = useState<TableDetail | null>(null);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [hasDisconnected, setHasDisconnected] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);
  const unsavedChangeCountRef = useRef(0);
  const [pendingTableSwitch, setPendingTableSwitch] = useState<string | null>(null);
  const latestSchemaRequestRef = useRef(0);
  const latestDetailRequestRef = useRef(0);

  const [approvalJustification, setApprovalJustification] = useState("");

  const { tabs, activeTabId, atTabLimit, addTab, closeTab, setActiveTab, updateTabSql } =
    useQueryTabs();
  const [isInTransaction, setIsInTransaction] = useState(false);

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
    onSessionEnd: (reason?: string) => {
      unsavedChangeCountRef.current = 0;
      setHasDisconnected(true);
      setDisconnectReason(reason ?? null);
    }
  });

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

  // Load schemas when connected
  const loadSchemas = useCallback(async () => {
    setIsLoadingSchemas(true);
    try {
      const result = await fetchSchemas();
      setSchemas(result);
      // Determine the active schema
      const hasPublic = result.find((s) => s.name === selectedSchema);
      const activeSchema = hasPublic ? selectedSchema : (result[0]?.name ?? "public");
      if (!hasPublic && result.length > 0) {
        setSelectedSchema(activeSchema);
      }
      // Auto-load tables for the active schema
      if (result.length > 0) {
        setIsLoadingTables(true);
        try {
          const tableResult = await fetchTables(activeSchema);
          setTables(tableResult);
        } catch {
          // Error handled by the hook
        } finally {
          setIsLoadingTables(false);
        }
      }
    } catch {
      // Error handled by the hook
    } finally {
      setIsLoadingSchemas(false);
    }
  }, [fetchSchemas, fetchTables, selectedSchema]);

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

  const loadTableDetail = useCallback(
    async (schema: string, tableName: string) => {
      latestDetailRequestRef.current += 1;
      const requestId = latestDetailRequestRef.current;
      setIsLoadingDetail(true);
      try {
        const result = await fetchTableDetail(schema, tableName);
        if (latestDetailRequestRef.current !== requestId) return;
        setTableDetail(result);
      } catch {
        // Error handled by the hook
      } finally {
        if (latestDetailRequestRef.current === requestId) {
          setIsLoadingDetail(false);
        }
      }
    },
    [fetchTableDetail]
  );

  // Auto-load schemas when we transition to connected
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      wasConnectedRef.current = true;
      setHasDisconnected(false);
      loadSchemas();
    }
    if (!isConnected) {
      wasConnectedRef.current = false;
    }
  }, [isConnected, loadSchemas]);

  const handleSchemaChange = useCallback(
    (schema: string) => {
      setSelectedSchema(schema);
      // Clear immediately so the grid doesn't fire a stale query
      // against the new schema with the old table name.
      setSelectedTable(null);
      setTableDetail(null);
      loadTables(schema);
    },
    [loadTables]
  );

  const handleTableSelect = useCallback(
    (tableName: string) => {
      if (tableName === selectedTable) {
        setActiveTab(BROWSE_TAB_ID);
        return;
      }
      if (unsavedChangeCountRef.current > 0) {
        setPendingTableSwitch(tableName);
        return;
      }
      setSelectedTable(tableName);
      loadTableDetail(selectedSchema, tableName);
      setActiveTab(BROWSE_TAB_ID);
    },
    [selectedTable, selectedSchema, loadTableDetail, setActiveTab]
  );

  const handleDiscardAndSwitch = useCallback(() => {
    if (!pendingTableSwitch) return;
    unsavedChangeCountRef.current = 0;
    setSelectedTable(pendingTableSwitch);
    loadTableDetail(selectedSchema, pendingTableSwitch);
    setPendingTableSwitch(null);
    setActiveTab(BROWSE_TAB_ID);
  }, [pendingTableSwitch, selectedSchema, loadTableDetail, setActiveTab]);

  const handleFullRefresh = useCallback(async () => {
    // 1. Re-fetch tables for current schema (picks up new/dropped tables)
    setIsLoadingTables(true);
    try {
      const tableResult = await fetchTables(selectedSchema);
      setTables(tableResult);

      // 2. If selected table was dropped, deselect and stop
      if (selectedTable && !tableResult.find((t) => t.name === selectedTable)) {
        setSelectedTable(null);
        setTableDetail(null);
        return;
      }
    } catch {
      // Error handled by the hook
    } finally {
      setIsLoadingTables(false);
    }

    // 3. Re-fetch table detail for current table (picks up column/PK changes)
    if (selectedTable) {
      await loadTableDetail(selectedSchema, selectedTable);
    }
  }, [selectedSchema, selectedTable, fetchTables, loadTableDetail]);

  const handleReconnect = useCallback(() => {
    setHasDisconnected(false);
    setDisconnectReason(null);
    setSchemas([]);
    setTables([]);
    setSelectedTable(null);
    setTableDetail(null);
    reconnect();
  }, [reconnect]);

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

  return (
    <div ref={mountRef} className="flex h-screen w-screen flex-col bg-bunker-800">
      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <DataExplorerSidebar
          schemas={schemas}
          selectedSchema={selectedSchema}
          onSchemaChange={handleSchemaChange}
          tables={tables}
          selectedTable={selectedTable}
          onTableSelect={handleTableSelect}
          isLoadingSchemas={isLoadingSchemas}
          isLoadingTables={isLoadingTables}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex thin-scrollbar shrink-0 items-center overflow-x-auto border-b border-mineshaft-600 bg-mineshaft-800 [&::-webkit-scrollbar]:h-1">
            <button
              type="button"
              onClick={() => setActiveTab(BROWSE_TAB_ID)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors",
                activeTabId === BROWSE_TAB_ID
                  ? "border-info text-mineshaft-100"
                  : "border-transparent text-mineshaft-400 hover:text-mineshaft-200"
              )}
            >
              <TableIcon className="size-3.5" />
              Browse
            </button>

            {tabs.map((tab) => (
              <div
                key={tab.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveTab(tab.id)}
                className={cn(
                  "group flex shrink-0 cursor-pointer items-center gap-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                  activeTabId === tab.id
                    ? "border-info text-mineshaft-100"
                    : "border-transparent text-mineshaft-400 hover:text-mineshaft-200"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <TerminalSquareIcon className="size-3.5" />
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
            ))}

            <button
              type="button"
              onClick={addTab}
              disabled={atTabLimit}
              className="ml-1 flex shrink-0 items-center gap-1.5 rounded border border-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300 transition-colors hover:border-mineshaft-500 hover:text-mineshaft-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-mineshaft-600 disabled:hover:text-mineshaft-300"
              aria-label="New query tab"
            >
              <PlusIcon className="size-3" />
              New query
            </button>
          </div>

          <div
            className={cn("flex flex-1 overflow-hidden", activeTabId !== BROWSE_TAB_ID && "hidden")}
          >
            {selectedTable ? (
              <DataExplorerGrid
                key={`${selectedSchema}.${selectedTable}`}
                tableDetail={tableDetail}
                tableType={tables.find((t) => t.name === selectedTable)?.tableType}
                schema={selectedSchema}
                table={selectedTable}
                executeQuery={executeQuery}
                isLoading={isLoadingDetail}
                onChangeCountUpdate={(count) => {
                  unsavedChangeCountRef.current = count;
                }}
                onFullRefresh={handleFullRefresh}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <DatabaseIcon className="mx-auto mb-3 size-12 text-mineshaft-600" />
                  <p className="text-sm text-mineshaft-400">
                    Select a table from the sidebar to browse data
                  </p>
                </div>
              </div>
            )}
          </div>

          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn("flex flex-1 overflow-hidden", activeTabId !== tab.id && "hidden")}
            >
              <QueryPanel
                tab={tab}
                executeQuery={executeQuery}
                cancelQuery={cancelQuery}
                tableDetail={tableDetail}
                isInTransaction={isInTransaction}
                onSqlChange={(sql) => updateTabSql(tab.id, sql)}
                onTransactionStateChange={setIsInTransaction}
              />
            </div>
          ))}
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

      <AlertDialog
        open={pendingTableSwitch !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTableSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Table contains unsaved changes. Do you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleDiscardAndSwitch}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
