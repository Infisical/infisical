import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import type { CodeEditorDialect } from "@infisical/cipher/ui/code-editor";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TableIcon, TerminalSquareIcon } from "lucide-react";

import { PamAccountType, type TPamAccount } from "@app/hooks/api/pam";

import { toast } from "../../../access/toast";
import { AccessCard, AccessFailed, AccessPending } from "../access-gate";
import { BrowseGrid } from "./browse-grid";
import type { SchemaInfo, TableInfo } from "./protocol";
import { QueryPanel } from "./query-panel";
import { ExplorerSidebar } from "./sidebar";
import type { SqlDialect } from "./sql";
import { useDataExplorerSession } from "./use-session";
import { MAX_TABS, useQueryTabs } from "./use-tabs";

const EDITOR_DIALECT: Partial<Record<PamAccountType, CodeEditorDialect>> = {
  [PamAccountType.CockroachDB]: "cockroachdb",
  [PamAccountType.MySQL]: "mysql",
  [PamAccountType.Snowflake]: "snowflake",
  [PamAccountType.ClickHouse]: "clickhouse"
};

const SQL_DIALECT: Partial<Record<PamAccountType, SqlDialect>> = {
  [PamAccountType.MySQL]: "mysql",
  [PamAccountType.Snowflake]: "snowflake",
  [PamAccountType.ClickHouse]: "clickhouse"
};

const defaultSchemaFor = (account: TPamAccount, dialect: SqlDialect) => {
  const details = account.connectionDetails as { database?: string; schema?: string } | null;
  if (dialect === "mysql") return details?.database ?? "";
  if (dialect === "snowflake") return details?.schema ?? "PUBLIC";
  if (dialect === "clickhouse") return details?.database ?? "default";
  return "public";
};

export const DataExplorer = ({
  account,
  reason,
  mfaSessionId
}: {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
}) => {
  const dialect = SQL_DIALECT[account.accountType] ?? "postgres";
  const editorDialect = EDITOR_DIALECT[account.accountType] ?? "postgres";
  const defaultSchema = defaultSchemaFor(account, dialect);

  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [selectedSchema, setSelectedSchema] = useState(defaultSchema);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [ended, setEnded] = useState<{ reason: string | null } | null>(null);
  const tablesRequestRef = useRef(0);
  const tabActionsRef = useRef<{
    markConnectionDead: (connectionId: string) => void;
    resetTabs: () => void;
    openQueryTab: () => Promise<string | null>;
  } | null>(null);
  const defaultTabOpenedRef = useRef(false);

  const session = useDataExplorerSession({
    accountId: account.id,
    reason,
    onSessionEnd: (endReason) => setEnded({ reason: endReason ?? null }),
    onConnectionClosed: (connectionId) => tabActionsRef.current?.markConnectionDead(connectionId),
    onReconnected: () => {
      tabActionsRef.current?.resetTabs();
      defaultTabOpenedRef.current = true;
      tabActionsRef.current?.openQueryTab().catch(() => {});
    }
  });
  const {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    reconnect,
    fetchSchemas,
    fetchTables,
    executeQuery
  } = session;

  const tabs = useQueryTabs({
    openConnection: session.openConnection,
    closeConnection: session.closeConnection,
    fetchTableDetail: session.fetchTableDetail
  });
  useLayoutEffect(() => {
    tabActionsRef.current = tabs;
  });
  const { openQueryTab, openBrowseTab, resetTabs, refreshBrowseTab } = tabs;

  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      connect(mfaSessionId);
    }
    return () => disconnect();
    // Connects once per mount; the session keeps its own refs current
  }, []);

  const loadTables = useCallback(
    async (schema: string) => {
      tablesRequestRef.current += 1;
      const request = tablesRequestRef.current;
      setIsLoadingTables(true);
      try {
        const result = await fetchTables(schema);
        if (request === tablesRequestRef.current) setTables(result);
      } catch {
        // The session reports a failed request
      } finally {
        if (request === tablesRequestRef.current) setIsLoadingTables(false);
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
        const matched = result.find(
          ({ name }) => name.toLowerCase() === selectedSchema.toLowerCase()
        );
        const activeSchema = matched?.name ?? result[0]?.name ?? defaultSchema;
        if (!matched && result.length > 0)
          toast({
            title: `Schema "${selectedSchema}" was not found`,
            description: `Browsing "${activeSchema}" instead.`
          });
        if (activeSchema !== selectedSchema && result.length > 0 && !keepSelected)
          setSelectedSchema(activeSchema);
        if (result.length > 0) await loadTables(activeSchema);
      } catch {
        // The session reports a failed request
      } finally {
        setIsLoadingSchemas(false);
      }
    },
    [fetchSchemas, loadTables, selectedSchema, defaultSchema]
  );

  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (!isConnected) {
      wasConnectedRef.current = false;
      return;
    }
    if (wasConnectedRef.current) return;
    wasConnectedRef.current = true;
    (async () => {
      await loadSchemas();
      if (!defaultTabOpenedRef.current) {
        defaultTabOpenedRef.current = true;
        await openQueryTab();
      }
    })().catch(() => {});
  }, [isConnected]);

  const handleReconnect = () => {
    setEnded(null);
    setSchemas([]);
    setTables([]);
    resetTabs();
    reconnect();
  };

  if (isConnecting && !isConnected)
    return <AccessPending title="Connecting" label="Connecting to database" />;

  if (session.mfa)
    return session.mfa.verifying ? (
      <AccessPending
        title="MFA verification"
        label="Waiting for verification in the pop-up window"
      />
    ) : (
      <AccessCard
        title="MFA verification required"
        footer={<Button onClick={session.verifyMfa}>Verify MFA</Button>}
      />
    );

  if (session.error && !isConnected)
    return <AccessFailed message={session.error} onRetry={handleReconnect} />;

  if (ended && !isConnected)
    return (
      <AccessCard
        title="Disconnected"
        footer={
          <Button variant="outline" icon="sync" onClick={handleReconnect}>
            Reconnect
          </Button>
        }
      >
        {ended.reason ?? "The database connection was closed."}
      </AccessCard>
    );

  const active = tabs.tabs.find(({ id }) => id === tabs.activeTabId);
  const activeTable =
    active?.kind === "browse" ? { schema: active.schema, table: active.table } : null;
  const newTabReason = tabs.atTabLimit ? `Tab limit (${MAX_TABS}) reached` : undefined;

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        minHeight: 560,
        border: "var(--cipher-size-control-border) solid var(--cipher-line-soft)",
        overflow: "hidden"
      }}
    >
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ExplorerSidebar
          schemas={schemas}
          selectedSchema={selectedSchema}
          onSchemaChange={(schema) => {
            setSelectedSchema(schema);
            loadTables(schema);
          }}
          tables={tables}
          activeTable={activeTable}
          onTableOpen={(table, options) => {
            openBrowseTab(selectedSchema, table, options).catch(() => {});
          }}
          isLoadingSchemas={isLoadingSchemas}
          isLoadingTables={isLoadingTables}
          disabled={tabs.isOpeningTab}
        />
        <div
          style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, minHeight: 0 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--cipher-space-8)",
              padding: "0 var(--cipher-space-12)",
              borderBlockEnd: "var(--cipher-size-control-border) solid var(--cipher-line-soft)"
            }}
          >
            <div style={{ flex: "0 1 auto", minWidth: 0, overflowX: "auto" }}>
              {tabs.tabs.length > 0 && (
                <Tabs
                  label="Open tabs"
                  value={tabs.activeTabId ?? undefined}
                  onChange={tabs.setActiveTab}
                  tabs={tabs.tabs.map((tab) => ({
                    value: tab.id,
                    label: (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "var(--cipher-space-6)",
                          color: tab.isDead ? "var(--cipher-bad)" : undefined
                        }}
                      >
                        <Icon icon={tab.kind === "browse" ? TableIcon : TerminalSquareIcon} />
                        {tab.title}
                      </span>
                    )
                  }))}
                />
              )}
            </div>
            {active && (
              <Button
                variant="ghost"
                size="icon-sm"
                iconOnly
                icon="x"
                aria-label={`Close ${active.title}`}
                onClick={() => tabs.closeTab(active.id)}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              icon="plus"
              loading={tabs.isOpeningTab}
              disabledReason={newTabReason}
              onClick={() => {
                openQueryTab().catch(() => {});
              }}
            >
              New query
            </Button>
          </div>
          {tabs.tabs.map((tab) => {
            let content;
            if (tab.isDead)
              content = (
                <EmptyState
                  icon="alert"
                  title="This connection was closed and can't be reused"
                  actions={
                    <Button variant="outline" onClick={() => tabs.closeTab(tab.id)}>
                      Close tab
                    </Button>
                  }
                />
              );
            else if (tab.kind === "browse")
              content = (
                <BrowseGrid
                  tableDetail={tab.tableDetail}
                  tableType={tables.find(({ name }) => name === tab.table)?.tableType}
                  schema={tab.schema}
                  table={tab.table}
                  connectionId={tab.connectionId}
                  executeQuery={executeQuery}
                  dialect={dialect}
                  onRefresh={() =>
                    Promise.all([
                      refreshBrowseTab(tab.id),
                      loadSchemas(true),
                      loadTables(selectedSchema)
                    ]).then(() => undefined)
                  }
                />
              );
            else
              content = (
                <QueryPanel
                  tab={tab}
                  dialect={editorDialect}
                  executeQuery={executeQuery}
                  cancelQuery={session.cancelQuery}
                  onSqlChange={(sql) => tabs.updateTabSql(tab.id, sql)}
                  onTransactionStateChange={(open) => tabs.setTabTransactionOpen(tab.id, open)}
                />
              );
            return (
              <div
                key={tab.id}
                hidden={tab.id !== tabs.activeTabId}
                style={{
                  display: tab.id === tabs.activeTabId ? "flex" : "none",
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0
                }}
              >
                {content}
              </div>
            );
          })}
          {tabs.tabs.length === 0 && (
            <EmptyState
              icon={TerminalSquareIcon}
              title="No tabs open"
              actions={
                <Button
                  variant="outline"
                  icon="plus"
                  loading={tabs.isOpeningTab}
                  onClick={() => {
                    openQueryTab().catch(() => {});
                  }}
                >
                  New query
                </Button>
              }
            />
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "var(--cipher-space-16)",
          padding: "var(--cipher-space-6) var(--cipher-space-12)",
          borderBlockStart: "var(--cipher-size-control-border) solid var(--cipher-line-soft)",
          color: "var(--cipher-muted)",
          fontSize: "var(--cipher-type-small-font-size)",
          lineHeight: "var(--cipher-type-small-line-height)"
        }}
      >
        <span>{`${tables.length} ${tables.length === 1 ? "table" : "tables"} in ${selectedSchema}`}</span>
        <span>{`Account ${account.name}`}</span>
      </div>
    </div>
  );
};
