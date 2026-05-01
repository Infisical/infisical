import { useCallback, useRef, useState } from "react";

import { createNotification } from "@app/components/notifications";

import type { TableDetail } from "./data-explorer-types";

type TabBase = {
  id: string;
  connectionId: string;
  backendPid: number | null;
  isInTransaction: boolean;
  lastFocusedAt: number;
  isDead?: boolean;
};

type BrowseTab = TabBase & {
  kind: "browse";
  title: string;
  schema: string;
  table: string;
  tableDetail: TableDetail | null;
  isLoadingDetail: boolean;
};

export type QueryTab = TabBase & {
  kind: "query";
  title: string;
  sql: string;
};

type Tab = BrowseTab | QueryTab;

const MAX_TABS = 20;

type UseQueryTabsOptions = {
  openConnection: () => Promise<{ connectionId: string; backendPid: number | null }>;
  closeConnection: (connectionId: string) => void;
  fetchTableDetail: (
    connectionId: string,
    schema: string,
    table: string
  ) => Promise<{ detail: TableDetail; transactionOpen: boolean }>;
};

export const useQueryTabs = ({
  openConnection,
  closeConnection,
  fetchTableDetail
}: UseQueryTabsOptions) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isOpeningTab, setIsOpeningTab] = useState(false);
  const nextQueryNumberRef = useRef(1);

  const atTabLimit = tabs.length >= MAX_TABS;

  const guardLimit = useCallback((): boolean => {
    if (tabs.length >= MAX_TABS) {
      createNotification({
        title: "Tab limit reached",
        text: `Maximum ${MAX_TABS} tabs open. Close one to open another.`,
        type: "warning"
      });
      return false;
    }
    return true;
  }, [tabs.length]);

  // Shared shell for openQueryTab / openBrowseTab: enforces the tab-count cap,
  // toggles the spinner, asks the BE for a new connection, and surfaces any
  // failure as a toast. Returns null if the caller should bail out.
  const acquireTabConnection = useCallback(async (): Promise<{
    connectionId: string;
    backendPid: number | null;
  } | null> => {
    if (!guardLimit()) return null;
    setIsOpeningTab(true);
    try {
      return await openConnection();
    } catch (err) {
      createNotification({
        title: "Failed to open tab",
        text: err instanceof Error ? err.message : "Unknown error",
        type: "error"
      });
      return null;
    } finally {
      setIsOpeningTab(false);
    }
  }, [openConnection, guardLimit]);

  const openQueryTab = useCallback(async (): Promise<string | null> => {
    const conn = await acquireTabConnection();
    if (!conn) return null;
    const id = crypto.randomUUID();
    const title = `Query ${nextQueryNumberRef.current}`;
    nextQueryNumberRef.current += 1;
    setTabs((prev) => [
      ...prev,
      {
        kind: "query",
        id,
        connectionId: conn.connectionId,
        backendPid: conn.backendPid,
        isInTransaction: false,
        lastFocusedAt: Date.now(),
        title,
        sql: ""
      }
    ]);
    setActiveTabId(id);
    return id;
  }, [acquireTabConnection]);

  const openBrowseTab = useCallback(
    async (
      schema: string,
      table: string,
      { forceNew }: { forceNew: boolean }
    ): Promise<string | null> => {
      if (!forceNew) {
        const matches = tabs.filter(
          (t): t is BrowseTab =>
            t.kind === "browse" && t.schema === schema && t.table === table && !t.isDead
        );
        if (matches.length > 0) {
          const focus = matches.reduce((a, b) => (a.lastFocusedAt >= b.lastFocusedAt ? a : b));
          setActiveTabId(focus.id);
          setTabs((prev) =>
            prev.map((t) => (t.id === focus.id ? { ...t, lastFocusedAt: Date.now() } : t))
          );
          return focus.id;
        }
      }

      const conn = await acquireTabConnection();
      if (!conn) return null;
      const id = crypto.randomUUID();

      // Optimistic push with isLoadingDetail: true — the grid shows a skeleton
      // until fetchTableDetail resolves.
      setTabs((prev) => [
        ...prev,
        {
          kind: "browse",
          id,
          connectionId: conn.connectionId,
          backendPid: conn.backendPid,
          isInTransaction: false,
          lastFocusedAt: Date.now(),
          title: `${schema}.${table}`,
          schema,
          table,
          tableDetail: null,
          isLoadingDetail: true
        }
      ]);
      setActiveTabId(id);

      // Fire the detail fetch off the critical open path.
      (async () => {
        try {
          const { detail, transactionOpen } = await fetchTableDetail(
            conn.connectionId,
            schema,
            table
          );
          setTabs((prev) =>
            prev.map((t) =>
              t.id === id && t.kind === "browse"
                ? {
                    ...t,
                    tableDetail: detail,
                    isLoadingDetail: false,
                    isInTransaction: transactionOpen
                  }
                : t
            )
          );
        } catch (err) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === id && t.kind === "browse"
                ? { ...t, isLoadingDetail: false, isDead: true }
                : t
            )
          );
          createNotification({
            title: "Failed to load table",
            text: err instanceof Error ? err.message : "Unknown error",
            type: "error"
          });
        }
      })().catch(() => {});

      return id;
    },
    [acquireTabConnection, fetchTableDetail, tabs]
  );

  const closeTab = useCallback(
    (id: string) => {
      // Side effects (closeConnection + setActiveTabId) are hoisted OUT of
      // the setTabs updater so StrictMode's double-invoke can't fire the WS
      // close frame twice. React requires updaters to be pure.
      const target = tabs.find((t) => t.id === id);
      if (!target) return;
      closeConnection(target.connectionId);
      const remaining = tabs.filter((t) => t.id !== id);
      if (activeTabId === id) {
        // Activate the most recently focused remaining tab, if any.
        const nextActive =
          remaining.length > 0
            ? remaining.reduce((a, b) => (a.lastFocusedAt >= b.lastFocusedAt ? a : b)).id
            : null;
        setActiveTabId(nextActive);
      }
      setTabs(remaining);
    },
    [tabs, activeTabId, closeConnection]
  );

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id);
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, lastFocusedAt: Date.now() } : t)));
  }, []);

  const updateTabSql = useCallback((id: string, sql: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id && t.kind === "query" ? { ...t, sql } : t)));
  }, []);

  const setTabTransactionOpen = useCallback((id: string, open: boolean) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, isInTransaction: open } : t)));
  }, []);

  // Server pushed connection-closed for this tab's connection — mark it dead
  // but don't auto-remove. The user sees an error state and can close manually.
  const markConnectionDead = useCallback((connectionId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.connectionId === connectionId ? { ...t, isDead: true } : t))
    );
  }, []);

  // Reconnect flow — drop all tabs, reset next-query counter.
  const resetTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    nextQueryNumberRef.current = 1;
  }, []);

  const refreshBrowseTab = useCallback(
    async (id: string) => {
      const target = tabs.find((t) => t.id === id);
      if (!target || target.kind !== "browse") return;
      setTabs((prev) =>
        prev.map((t) => (t.id === id && t.kind === "browse" ? { ...t, isLoadingDetail: true } : t))
      );
      try {
        const { detail, transactionOpen } = await fetchTableDetail(
          target.connectionId,
          target.schema,
          target.table
        );
        setTabs((prev) =>
          prev.map((t) =>
            t.id === id && t.kind === "browse"
              ? {
                  ...t,
                  tableDetail: detail,
                  isLoadingDetail: false,
                  isInTransaction: transactionOpen
                }
              : t
          )
        );
      } catch (err) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === id && t.kind === "browse" ? { ...t, isLoadingDetail: false } : t
          )
        );
        createNotification({
          title: "Failed to refresh table",
          text: err instanceof Error ? err.message : "Unknown error",
          type: "error"
        });
      }
    },
    [tabs, fetchTableDetail]
  );

  return {
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
  };
};
