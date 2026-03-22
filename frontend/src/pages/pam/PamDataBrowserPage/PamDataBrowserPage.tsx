import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { AlertTriangleIcon, DatabaseIcon, ShieldCheckIcon, WifiOffIcon } from "lucide-react";

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
import { useGetPamAccountById } from "@app/hooks/api/pam";

import { DataBrowserGrid } from "./components/DataBrowserGrid";
import { DataBrowserSidebar } from "./components/DataBrowserSidebar";
import type { SchemaInfo, TableDetail, TableInfo } from "./data-browser-types";
import { useDataBrowserSession } from "./use-data-browser-session";

export const PamDataBrowserPage = () => {
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
  const unsavedChangeCountRef = useRef(0);
  const [pendingTableSwitch, setPendingTableSwitch] = useState<string | null>(null);
  const latestSchemaRequestRef = useRef(0);
  const latestDetailRequestRef = useRef(0);

  const [approvalJustification, setApprovalJustification] = useState("");

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
    executeQuery
  } = useDataBrowserSession({
    accountId,
    projectId,
    orgId,
    resourceName: account?.resource?.name ?? "",
    accountName: account?.name ?? "",
    onSessionEnd: () => setHasDisconnected(true)
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
      if (tableName === selectedTable) return;
      if (unsavedChangeCountRef.current > 0) {
        setPendingTableSwitch(tableName);
        return;
      }
      setSelectedTable(tableName);
      loadTableDetail(selectedSchema, tableName);
    },
    [selectedTable, selectedSchema, loadTableDetail]
  );

  const handleDiscardAndSwitch = useCallback(() => {
    if (!pendingTableSwitch) return;
    unsavedChangeCountRef.current = 0;
    setSelectedTable(pendingTableSwitch);
    loadTableDetail(selectedSchema, pendingTableSwitch);
    setPendingTableSwitch(null);
  }, [pendingTableSwitch, selectedSchema, loadTableDetail]);

  const handleChangeCountUpdate = useCallback((count: number) => {
    unsavedChangeCountRef.current = count;
  }, []);

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
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bunker-800">
        <ShieldCheckIcon className="h-12 w-12 text-yellow-500" />
        <h2 className="text-lg font-medium text-mineshaft-100">MFA Verification Required</h2>
        <p className="max-w-sm text-center text-sm text-mineshaft-300">
          Multi-factor authentication is required to access this database account.
        </p>
        {mfaState.verifying ? (
          <div className="flex items-center gap-2 text-sm text-mineshaft-300">
            <Spinner className="h-4 w-4" />
            Waiting for verification...
          </div>
        ) : (
          <Button variant="info" onClick={handleMfaVerification}>
            Verify MFA
          </Button>
        )}
      </div>
    );
  }

  if (approvalState?.required) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bunker-800">
        <AlertTriangleIcon className="h-12 w-12 text-yellow-500" />
        <h2 className="text-lg font-medium text-mineshaft-100">Approval Required</h2>
        <p className="max-w-sm text-center text-sm text-mineshaft-300">
          This account is protected by policy: {approvalState.policyName ?? "Unknown"}
        </p>
        {approvalState.submitted ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-green-400">Approval request created successfully!</p>
            {approvalRequestUrl && (
              <a
                href={approvalRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-500 underline hover:text-primary-400"
              >
                View approval request
              </a>
            )}
            <Button variant="info" onClick={handleReconnect}>
              Reconnect
            </Button>
          </div>
        ) : (
          <div className="flex w-full max-w-sm flex-col gap-3">
            <textarea
              className="w-full rounded border border-mineshaft-500 bg-bunker-700 px-3 py-2 text-sm text-mineshaft-100 placeholder:text-mineshaft-500 focus:border-primary-500 focus:outline-none"
              placeholder="Justification (optional)"
              rows={3}
              value={approvalJustification}
              onChange={(e) => setApprovalJustification(e.target.value)}
            />
            {approvalState.errorMessage && (
              <p className="text-sm text-red-400">{approvalState.errorMessage}</p>
            )}
            <div className="flex justify-center gap-2">
              <Button
                variant="info"
                isPending={approvalState.creating}
                onClick={() => submitApprovalRequest(approvalJustification)}
              >
                Create Approval Request
              </Button>
              <Button variant="outline" onClick={handleReconnect}>
                Reconnect
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (errorMessage && !isConnected) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bunker-800">
        <AlertTriangleIcon className="h-12 w-12 text-red-500" />
        <h2 className="text-lg font-medium text-mineshaft-100">Connection Error</h2>
        <p className="max-w-sm text-center text-sm text-mineshaft-400">{errorMessage}</p>
        <Button variant="info" onClick={handleReconnect}>
          Try Again
        </Button>
      </div>
    );
  }

  if (hasDisconnected && !isConnected && !isConnecting) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bunker-800">
        <WifiOffIcon className="h-12 w-12 text-mineshaft-400" />
        <h2 className="text-lg font-medium text-mineshaft-100">Disconnected</h2>
        <p className="text-sm text-mineshaft-400">The database connection was closed.</p>
        <Button variant="info" onClick={handleReconnect}>
          Reconnect
        </Button>
      </div>
    );
  }

  // --- Main layout ---

  let statusLabel = "Connected";
  let statusDotClass = "bg-green-500";
  if (isConnecting) {
    statusLabel = "Connecting";
    statusDotClass = "bg-yellow-500";
  } else if (!isConnected && hasDisconnected) {
    statusLabel = "Disconnected";
    statusDotClass = "bg-mineshaft-400";
  } else if (!isConnected) {
    statusLabel = "Connecting";
    statusDotClass = "bg-yellow-500";
  }

  return (
    <div ref={mountRef} className="flex h-screen w-screen flex-col bg-bunker-800">
      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <DataBrowserSidebar
          schemas={schemas}
          selectedSchema={selectedSchema}
          onSchemaChange={handleSchemaChange}
          tables={tables}
          selectedTable={selectedTable}
          onTableSelect={handleTableSelect}
          isLoadingSchemas={isLoadingSchemas}
          isLoadingTables={isLoadingTables}
        />

        {selectedTable ? (
          <DataBrowserGrid
            key={`${selectedSchema}.${selectedTable}`}
            tableDetail={tableDetail}
            schema={selectedSchema}
            table={selectedTable}
            executeQuery={executeQuery}
            isLoading={isLoadingDetail}
            onChangeCountUpdate={handleChangeCountUpdate}
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

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block size-2 rounded-full ${statusDotClass}`} />
          <span className="text-mineshaft-300">{statusLabel}</span>
          {!isConnected && !isConnecting && (
            <button
              type="button"
              onClick={handleReconnect}
              className="ml-2 text-mineshaft-400 hover:text-green-400"
            >
              Reconnect
            </button>
          )}
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
