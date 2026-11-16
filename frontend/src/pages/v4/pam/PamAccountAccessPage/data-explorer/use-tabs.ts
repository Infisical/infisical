import { useCallback, useRef, useState } from "react";

import { failed, toast } from "../../../access/toast";
import type { TableDetail } from "./protocol";

type TabBase = {
  id: string;
  connectionId: string;
  isInTransaction: boolean;
  lastFocusedAt: number;
  isDead?: boolean;
  title: string;
};

export type BrowseTab = TabBase & {
  kind: "browse";
  schema: string;
  table: string;
  tableDetail: TableDetail | null;
  isLoadingDetail: boolean;
};

export type QueryTab = TabBase & { kind: "query"; sql: string };

export type ExplorerTab = BrowseTab | QueryTab;

export const MAX_TABS = 20;

const latest = (tabs: ExplorerTab[]) =>
  tabs.reduce((best, tab) => (best.lastFocusedAt >= tab.lastFocusedAt ? best : tab));

export const useQueryTabs = ({
  openConnection,
  closeConnection,
  fetchTableDetail
}: {
  openConnection: () => Promise<{ connectionId: string }>;
  closeConnection: (connectionId: string) => void;
  fetchTableDetail: (
    connectionId: string,
    schema: string,
    table: string
  ) => Promise<{ detail: TableDetail; transactionOpen: boolean }>;
}) => {
  const [tabs, setTabs] = useState<ExplorerTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isOpeningTab, setIsOpeningTab] = useState(false);
  const nextQueryNumberRef = useRef(1);

  const atTabLimit = tabs.length >= MAX_TABS;

  const patchTab = useCallback((id: string, patch: Partial<BrowseTab> & Partial<QueryTab>) => {
    setTabs((previous) =>
      previous.map((tab) => (tab.id === id ? ({ ...tab, ...patch } as ExplorerTab) : tab))
    );
  }, []);

  const acquireConnection = useCallback(async () => {
    if (atTabLimit) {
      toast({
        title: "Tab limit reached",
        description: `Maximum ${MAX_TABS} tabs open. Close one to open another.`
      });
      return null;
    }
    setIsOpeningTab(true);
    try {
      return await openConnection();
    } catch (error) {
      failed("Failed to open tab", error);
      return null;
    } finally {
      setIsOpeningTab(false);
    }
  }, [atTabLimit, openConnection]);

  const openQueryTab = useCallback(async () => {
    const connection = await acquireConnection();
    if (!connection) return null;
    const id = crypto.randomUUID();
    const title = `Query ${nextQueryNumberRef.current}`;
    nextQueryNumberRef.current += 1;
    setTabs((previous) => [
      ...previous,
      {
        kind: "query",
        id,
        connectionId: connection.connectionId,
        isInTransaction: false,
        lastFocusedAt: Date.now(),
        title,
        sql: ""
      }
    ]);
    setActiveTabId(id);
    return id;
  }, [acquireConnection]);

  const loadDetail = useCallback(
    async (tab: { id: string; connectionId: string; schema: string; table: string }) => {
      const { detail, transactionOpen } = await fetchTableDetail(
        tab.connectionId,
        tab.schema,
        tab.table
      );
      patchTab(tab.id, {
        tableDetail: detail,
        isLoadingDetail: false,
        isInTransaction: transactionOpen
      });
    },
    [fetchTableDetail, patchTab]
  );

  const openBrowseTab = useCallback(
    async (schema: string, table: string, { forceNew }: { forceNew: boolean }) => {
      if (!forceNew) {
        const matches = tabs.filter(
          (tab): tab is BrowseTab =>
            tab.kind === "browse" && tab.schema === schema && tab.table === table && !tab.isDead
        );
        if (matches.length > 0) {
          const focus = latest(matches);
          setActiveTabId(focus.id);
          patchTab(focus.id, { lastFocusedAt: Date.now() });
          return focus.id;
        }
      }
      const connection = await acquireConnection();
      if (!connection) return null;
      const id = crypto.randomUUID();
      setTabs((previous) => [
        ...previous,
        {
          kind: "browse",
          id,
          connectionId: connection.connectionId,
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
      loadDetail({ id, connectionId: connection.connectionId, schema, table }).catch((error) => {
        patchTab(id, { isLoadingDetail: false, isDead: true });
        failed("Failed to load table", error);
      });
      return id;
    },
    [tabs, acquireConnection, loadDetail, patchTab]
  );

  const closeTab = useCallback(
    (id: string) => {
      const target = tabs.find((tab) => tab.id === id);
      if (!target) return;
      closeConnection(target.connectionId);
      const remaining = tabs.filter((tab) => tab.id !== id);
      if (activeTabId === id) setActiveTabId(remaining.length > 0 ? latest(remaining).id : null);
      setTabs(remaining);
    },
    [tabs, activeTabId, closeConnection]
  );

  const setActiveTab = useCallback(
    (id: string) => {
      setActiveTabId(id);
      patchTab(id, { lastFocusedAt: Date.now() });
    },
    [patchTab]
  );

  const updateTabSql = useCallback((id: string, sql: string) => patchTab(id, { sql }), [patchTab]);

  const setTabTransactionOpen = useCallback(
    (id: string, open: boolean) => patchTab(id, { isInTransaction: open }),
    [patchTab]
  );

  const markConnectionDead = useCallback((connectionId: string) => {
    setTabs((previous) =>
      previous.map((tab) => (tab.connectionId === connectionId ? { ...tab, isDead: true } : tab))
    );
  }, []);

  const resetTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    nextQueryNumberRef.current = 1;
  }, []);

  const refreshBrowseTab = useCallback(
    async (id: string) => {
      const target = tabs.find((tab): tab is BrowseTab => tab.id === id && tab.kind === "browse");
      if (!target) return;
      patchTab(id, { isLoadingDetail: true });
      try {
        await loadDetail(target);
      } catch (error) {
        patchTab(id, { isLoadingDetail: false });
        failed("Failed to refresh table", error);
      }
    },
    [tabs, loadDetail, patchTab]
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
    refreshBrowseTab
  };
};
