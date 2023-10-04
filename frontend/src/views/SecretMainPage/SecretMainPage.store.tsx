import { createContext, ReactNode, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { createStore, StateCreator, StoreApi, useStore } from "zustand";

// akhilmhdh: Don't remove this file if ur thinking why use zustand just for selected selects state
// This is first step and the whole secret crud will be moved to this global page scope state
// this will allow more stuff like undo grouping stuffs etc
type SelectedSecretState = {
  selectedSecret: Record<string, boolean>;
  action: {
    toggle: (id: string) => void;
    reset: () => void;
  };
};
const createSelectedSecretStore: StateCreator<SelectedSecretState> = (set) => ({
  selectedSecret: {},
  action: {
    toggle: (id) =>
      set((state) => {
        const isChecked = Boolean(state.selectedSecret?.[id]);
        const newChecks = { ...state.selectedSecret };
        // remove selection if its present else add it
        if (isChecked) delete newChecks[id];
        else newChecks[id] = true;
        return { selectedSecret: newChecks };
      }),
    reset: () => set({ selectedSecret: {} })
  }
});

export enum PopUpNames {
  CreateSecretForm = "create-secret-form"
}
type PopUpState = {
  popUp: Record<string, { isOpen: boolean; data?: any }>;
  popUpActions: {
    togglePopUp: (id: PopUpNames, isOpen?: boolean) => void;
    closePopUp: (id: PopUpNames) => void;
    openPopUp: (id: PopUpNames, data?: any) => void;
  };
};
const createPopUpStore: StateCreator<PopUpState> = (set) => ({
  popUp: {},
  popUpActions: {
    closePopUp: (id) => set((state) => ({ popUp: { ...state.popUp, [id]: { isOpen: false } } })),
    openPopUp: (id, data) =>
      set((state) => ({ popUp: { ...state.popUp, [id]: { isOpen: true, data } } })),
    togglePopUp: (id, isOpen) =>
      set((state) => ({
        popUp: { ...state.popUp, [id]: { isOpen: isOpen ?? !state.popUp[id].isOpen } }
      }))
  }
});

type CombinedState = SelectedSecretState & PopUpState;
const StoreContext = createContext<StoreApi<CombinedState> | null>(null);
export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const storeRef = useRef<StoreApi<CombinedState>>();
  const router = useRouter();
  if (!storeRef.current) {
    storeRef.current = createStore<CombinedState>((...a) => ({
      ...createSelectedSecretStore(...a),
      ...createPopUpStore(...a)
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

const useStoreContext = <T extends unknown>(selector: (state: CombinedState) => T): T => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("Missing ");
  return useStore(ctx, selector);
};

// selected secret context
export const useSelectedSecrets = () => useStoreContext((state) => state.selectedSecret);
export const useSelectedSecretActions = () => useStoreContext((state) => state.action);

// popup context
export const usePopUpState = (id: PopUpNames) =>
  useStoreContext((state) => state.popUp?.[id] || { isOpen: false });
export const usePopUpAction = () => useStoreContext((state) => state.popUpActions);
