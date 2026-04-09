import { useState } from "react";

export type QueryTab = {
  id: string;
  title: string;
  sql: string;
};

type TabState = {
  tabs: QueryTab[];
  activeTabId: string;
  nextTabNumber: number;
};

export const BROWSE_TAB_ID = "browse";
const MAX_QUERY_TABS = 20;

const DEFAULT_STATE: TabState = { tabs: [], activeTabId: BROWSE_TAB_ID, nextTabNumber: 1 };

export function useQueryTabs() {
  const [state, setState] = useState<TabState>(DEFAULT_STATE);

  const addTab = () => {
    setState((prev) => {
      if (prev.tabs.length >= MAX_QUERY_TABS) return prev;
      const newTab: QueryTab = {
        id: crypto.randomUUID(),
        title: `Query ${prev.nextTabNumber}`,
        sql: ""
      };
      return {
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
        nextTabNumber: prev.nextTabNumber + 1
      };
    });
  };

  const closeTab = (id: string) => {
    setState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.id === id);
      const newTabs = prev.tabs.filter((t) => t.id !== id);
      const newActiveId =
        prev.activeTabId === id
          ? (newTabs[idx - 1]?.id ?? newTabs[0]?.id ?? BROWSE_TAB_ID)
          : prev.activeTabId;
      return { ...prev, tabs: newTabs, activeTabId: newActiveId };
    });
  };

  const setActiveTab = (id: string) => setState((prev) => ({ ...prev, activeTabId: id }));

  const updateTabSql = (id: string, sql: string) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === id ? { ...t, sql } : t))
    }));
  };

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    addTab,
    closeTab,
    setActiveTab,
    updateTabSql
  };
}
