import { useCallback, useState } from "react";

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

const DEFAULT_STATE: TabState = { tabs: [], activeTabId: BROWSE_TAB_ID, nextTabNumber: 1 };

export function useQueryTabs() {
  const [state, setState] = useState<TabState>(DEFAULT_STATE);

  const update = useCallback((updater: (prev: TabState) => TabState) => {
    setState((prev) => updater(prev));
  }, []);

  const addTab = useCallback(() => {
    update((prev) => {
      const newTab: QueryTab = {
        id: crypto.randomUUID(),
        title: `Query ${prev.nextTabNumber}`,
        sql: ""
      };
      return { tabs: [...prev.tabs, newTab], activeTabId: newTab.id, nextTabNumber: prev.nextTabNumber + 1 };
    });
  }, [update]);

  const closeTab = useCallback(
    (id: string) => {
      update((prev) => {
        const idx = prev.tabs.findIndex((t) => t.id === id);
        const newTabs = prev.tabs.filter((t) => t.id !== id);
        const newActiveId =
          prev.activeTabId === id
            ? (newTabs[idx - 1]?.id ?? newTabs[0]?.id ?? BROWSE_TAB_ID)
            : prev.activeTabId;
        return { ...prev, tabs: newTabs, activeTabId: newActiveId };
      });
    },
    [update]
  );

  const setActiveTab = useCallback(
    (id: string) => update((prev) => ({ ...prev, activeTabId: id })),
    [update]
  );

  const updateTabSql = useCallback(
    (id: string, sql: string) => {
      update((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, sql } : t))
      }));
    },
    [update]
  );

  return { tabs: state.tabs, activeTabId: state.activeTabId, addTab, closeTab, setActiveTab, updateTabSql };
}
