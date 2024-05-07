import { createContext, ReactNode, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { createStore, StateCreator, StoreApi, useStore } from "zustand";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

type SelectedEntriesState = {
  selectedEntries: {
    [EntryType.FOLDER]: Record<string, boolean>;
    [EntryType.SECRET]: Record<string, boolean>;
  };
  action: {
    toggle: (type: EntryType, key: string) => void;
    reset: () => void;
  };
};

const createSelectedSecretStore: StateCreator<SelectedEntriesState> = (set) => ({
  selectedEntries: {
    [EntryType.FOLDER]: {},
    [EntryType.SECRET]: {}
  },
  action: {
    toggle: (type: EntryType, key: string) =>
      set((state) => {
        const isChecked = Boolean(state.selectedEntries[type]?.[key]);
        const newChecks = { ...state.selectedEntries };
        // remove selection if its present else add it
        if (isChecked) delete newChecks[type][key];
        else newChecks[type][key] = true;
        return { selectedEntries: newChecks };
      }),
    reset: () =>
      set({
        selectedEntries: {
          [EntryType.FOLDER]: {},
          [EntryType.SECRET]: {}
        }
      })
  }
});

const StoreContext = createContext<StoreApi<SelectedEntriesState> | null>(null);
export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const storeRef = useRef<StoreApi<SelectedEntriesState>>();
  const router = useRouter();
  if (!storeRef.current) {
    storeRef.current = createStore<SelectedEntriesState>((...a) => ({
      ...createSelectedSecretStore(...a)
    }));
  }

  useEffect(() => {
    const onRouteChangeStart = () => {
      const state = storeRef.current?.getState();
      state?.action.reset();
    };

    router.events.on("routeChangeStart", onRouteChangeStart);
    return () => {
      router.events.off("routeChangeStart", onRouteChangeStart);
    };
  }, []);

  return <StoreContext.Provider value={storeRef.current}>{children}</StoreContext.Provider>;
};

const useStoreContext = <T extends unknown>(selector: (state: SelectedEntriesState) => T): T => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("Missing ");
  return useStore(ctx, selector);
};

export const useSelectedEntries = () => useStoreContext((state) => state.selectedEntries);
export const useSelectedEntryActions = () => useStoreContext((state) => state.action);
