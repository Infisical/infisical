import { createContext, ReactNode, useContext, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { createStore, StateCreator, StoreApi, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

// akhilmhdh: Don't remove this file if ur thinking why use zustand just for selected selects state
// This is first step and the whole secret crud will be moved to this global page scope state
// this will allow more stuff like undo grouping stuffs etc
type SelectedSecretState = {
  selectedSecret: Record<string, SecretV3RawSanitized>;
  action: {
    toggle: (secret: SecretV3RawSanitized) => void;
    reset: () => void;
    set: (secrets: Record<string, SecretV3RawSanitized>) => void;
  };
};
const createSelectedSecretStore: StateCreator<SelectedSecretState> = (set) => ({
  selectedSecret: {},
  action: {
    toggle: (secret) =>
      set((state) => {
        const isChecked = Boolean(state.selectedSecret?.[secret.id]);
        const newChecks = { ...state.selectedSecret };
        // remove selection if its present else add it
        if (isChecked) delete newChecks[secret.id];
        else newChecks[secret.id] = secret;
        return { selectedSecret: newChecks };
      }),
    reset: () => set({ selectedSecret: {} }),
    set: (secrets) => set({ selectedSecret: secrets })
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
  const storeRef = useRef<StoreApi<CombinedState>>(
    createStore<CombinedState>((...a) => ({
      ...createSelectedSecretStore(...a),
      ...createPopUpStore(...a)
    }))
  );
  const router = useRouter();

  useEffect(() => {
    const onRouteChangeStart = () => {
      const state = storeRef.current?.getState();
      state?.action.reset();
    };

    const unsubscribe = router.subscribe("onBeforeLoad", onRouteChangeStart);
    return () => {
      unsubscribe();
    };
  }, []);

  return <StoreContext.Provider value={storeRef.current}>{children}</StoreContext.Provider>;
};

const useStoreContext = <T extends object>(selector: (state: CombinedState) => T): T => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("Missing ");
  return useStore(ctx, selector);
};

// selected secret context
export const useSelectedSecrets = () =>
  useStoreContext(useShallow((state) => state.selectedSecret));
export const useSelectedSecretActions = () => useStoreContext(useShallow((state) => state.action));

// popup context
export const usePopUpState = (id: PopUpNames) =>
  useStoreContext(useShallow((state) => state.popUp?.[id] || { isOpen: false }));
export const usePopUpAction = () => useStoreContext(useShallow((state) => state.popUpActions));
