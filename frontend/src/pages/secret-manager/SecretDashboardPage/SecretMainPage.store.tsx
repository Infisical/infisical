/* eslint-disable no-nested-ternary */
import { createContext, ReactNode, useContext, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { createStore, StateCreator, StoreApi, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

// akhilmhdh: Don't remove this file if ur thinking why use zustand just for selected selects state
// This is first step and the whole secret crud will be moved to this global page scope state
// this will allow more stuff like undo grouping stuffs etc

// Base interface for all pending changes
export interface BasePendingChange {
  id: string;
  timestamp: number;
}

// Secret-related change types
export interface PendingSecretCreate extends BasePendingChange {
  resourceType: "secret";
  type: PendingAction.Create;
  secretKey: string;
  secretValue: string;
  secretComment?: string;
  skipMultilineEncoding?: boolean;
  tags?: { id: string; slug: string }[];
  secretMetadata?: { key: string; value: string }[];
  originalKey?: string;
}

export interface PendingSecretUpdate extends BasePendingChange {
  resourceType: "secret";
  type: PendingAction.Update;
  secretKey: string;
  newSecretName?: string;
  originalValue?: string;
  secretValue?: string;
  originalComment?: string;
  secretComment?: string;
  originalSkipMultilineEncoding?: boolean;
  skipMultilineEncoding?: boolean;
  originalTags?: { id: string; slug: string }[];
  tags?: { id: string; slug: string }[];
  originalSecretMetadata?: { key: string; value: string }[];
  secretMetadata?: { key: string; value: string }[];
}

export interface PendingSecretDelete extends BasePendingChange {
  resourceType: "secret";
  type: PendingAction.Delete;
  secretKey: string;
  secretValue: string;
}

// Folder-related change types
export interface PendingFolderCreate extends BasePendingChange {
  resourceType: "folder";
  type: PendingAction.Create;
  id: string;
  folderName: string;
  description?: string;
  parentPath: string;
}

export interface PendingFolderUpdate extends BasePendingChange {
  resourceType: "folder";
  type: PendingAction.Update;
  originalFolderName: string;
  folderName: string;
  id: string;
  originalDescription?: string;
  description?: string;
}

export interface PendingFolderDelete extends BasePendingChange {
  resourceType: "folder";
  type: PendingAction.Delete;
  id: string;
  folderName: string;
  folderPath: string;
}

// Union types for each resource
export type PendingSecretChange = PendingSecretCreate | PendingSecretUpdate | PendingSecretDelete;
export type PendingFolderChange = PendingFolderCreate | PendingFolderUpdate | PendingFolderDelete;
export type PendingChange = PendingSecretChange | PendingFolderChange;

// Grouped changes for better processing
export interface PendingChanges {
  secrets: PendingSecretChange[];
  folders: PendingFolderChange[];
}

// Context interface for batch operations
export interface BatchContext {
  workspaceId: string;
  environment: string;
  secretPath: string;
}

const STORAGE_KEY = "infisical_pending_changes";

const generateContextKey = (workspaceId: string, environment: string, secretPath: string) => {
  return `${workspaceId}_${environment}_${secretPath}`;
};

const savePendingChangesToStorage = (
  changes: PendingChanges,
  workspaceId: string,
  environment: string,
  secretPath: string
) => {
  const key = `${STORAGE_KEY}_${generateContextKey(workspaceId, environment, secretPath)}`;
  try {
    localStorage.setItem(key, JSON.stringify(changes));
  } catch (error) {
    console.warn("Failed to save pending changes to localStorage:", error);
  }
};

const loadPendingChangesFromStorage = (
  workspaceId: string,
  environment: string,
  secretPath: string
): PendingChanges => {
  const key = `${STORAGE_KEY}_${generateContextKey(workspaceId, environment, secretPath)}`;
  const stored = localStorage.getItem(key);
  if (!stored) return { secrets: [], folders: [] };

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return {
        secrets: parsed.filter(
          (change: any) => !change.resourceType || change.resourceType === "secret"
        ),
        folders: []
      };
    }
    return {
      secrets: parsed.secrets || [],
      folders: parsed.folders || []
    };
  } catch (error) {
    console.warn("Failed to parse pending changes from localStorage:", error);
    return { secrets: [], folders: [] };
  }
};

const clearPendingChangesFromStorage = (
  workspaceId: string,
  environment: string,
  secretPath: string
) => {
  const key = `${STORAGE_KEY}_${generateContextKey(workspaceId, environment, secretPath)}`;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Failed to clear pending changes from localStorage:", error);
  }
};

type SelectedSecretState = {
  selectedSecret: Record<string, SecretV3RawSanitized>;
  action: {
    toggle: (secret: SecretV3RawSanitized) => void;
    reset: () => void;
    set: (secrets: Record<string, SecretV3RawSanitized>) => void;
  };
};

const createSelectedSecretStore: StateCreator<CombinedState, [], [], SelectedSecretState> = (
  set
) => ({
  selectedSecret: {},
  action: {
    toggle: (secret) =>
      set((state) => {
        const isChecked = Boolean(state.selectedSecret?.[secret.id]);
        const newChecks = { ...state.selectedSecret };
        if (isChecked) delete newChecks[secret.id];
        else newChecks[secret.id] = secret;
        return { selectedSecret: newChecks };
      }),
    reset: () => set({ selectedSecret: {} }),
    set: (secrets) => set({ selectedSecret: secrets })
  }
});

const cleanupRevertedFields = (update: PendingSecretUpdate): PendingSecretUpdate => {
  const cleaned = { ...update };

  if (cleaned.secretValue === cleaned.originalValue) {
    cleaned.secretValue = undefined;
  }

  if (cleaned.secretComment === cleaned.originalComment) {
    cleaned.secretComment = undefined;
  }

  if (cleaned.skipMultilineEncoding === cleaned.originalSkipMultilineEncoding) {
    cleaned.skipMultilineEncoding = undefined;
  }

  // For arrays, compare stringified versions
  if (JSON.stringify(cleaned.tags) === JSON.stringify(cleaned.originalTags)) {
    cleaned.tags = undefined;
  }

  if (JSON.stringify(cleaned.secretMetadata) === JSON.stringify(cleaned.originalSecretMetadata)) {
    cleaned.secretMetadata = undefined;
  }

  // If the new name is the same as original key, remove it
  if (cleaned.newSecretName === cleaned.secretKey) {
    cleaned.newSecretName = undefined;
  }

  return cleaned;
};

type BatchModeState = {
  isBatchMode: boolean;
  pendingChanges: PendingChanges;
  existingSecretKeys: Set<string>;
  existingFolderNames: Set<string>;
  currentContext: BatchContext | null;
  batchActions: {
    addPendingChange: (change: PendingChange, context: BatchContext) => void;
    loadPendingChanges: (context: BatchContext) => void;
    clearAllPendingChanges: (context: BatchContext) => void;
    setExistingKeys: (secretKeys: string[], folderNames: string[]) => void;
    getTotalPendingChangesCount: () => number;
    removePendingChange: (changeId: string, resourceType: string, context: BatchContext) => void;
  };
};

const createBatchModeStore: StateCreator<CombinedState, [], [], BatchModeState> = (set, get) => ({
  isBatchMode: true, // Always enabled by default
  pendingChanges: { secrets: [], folders: [] },
  currentContext: null,
  existingSecretKeys: new Set<string>(),
  existingFolderNames: new Set<string>(),
  batchActions: {
    addPendingChange: (change: PendingChange, context: BatchContext) =>
      set((state) => {
        const newChanges = { ...state.pendingChanges };

        if (change.resourceType === "folder") {
          const existingFolder =
            state.existingFolderNames.has(change.folderName) ||
            newChanges.folders.some((f) => f.folderName === change.folderName);

          if (change.type === PendingAction.Create && existingFolder) {
            return { pendingChanges: newChanges };
          }
          if (
            change.type === PendingAction.Update &&
            change.folderName !== change.originalFolderName &&
            existingFolder
          ) {
            return { pendingChanges: newChanges };
          }
        }

        if (change.resourceType === "secret") {
          const existingSecret =
            state.existingSecretKeys.has(change.secretKey) ||
            newChanges.secrets.some((s) => s.secretKey === change.secretKey);

          if (change.type === PendingAction.Create && existingSecret) {
            return { pendingChanges: newChanges };
          }

          const existingNewSecretName =
            change.type === PendingAction.Update &&
            change.newSecretName &&
            change.newSecretName !== change.secretKey &&
            (state.existingSecretKeys.has(change.newSecretName) ||
              newChanges.secrets.some(
                (s) =>
                  (s.secretKey === change.newSecretName ||
                    (s.type === PendingAction.Update &&
                      s.newSecretName === change.newSecretName)) &&
                  s.id !== change.id
              ));

          if (existingNewSecretName) {
            return { pendingChanges: newChanges };
          }
        }

        if (change.resourceType === "secret") {
          const secretChanges = [...newChanges.secrets];

          if (change.type === PendingAction.Create) {
            const existingCreateIndex = secretChanges.findIndex(
              (c) =>
                c.type === PendingAction.Create &&
                (c.secretKey === change.secretKey || c.secretKey === change.originalKey)
            );

            if (existingCreateIndex >= 0) {
              secretChanges[existingCreateIndex] = {
                ...secretChanges[existingCreateIndex],
                ...change,
                timestamp: Date.now()
              };
            } else {
              secretChanges.push(change);
            }
          } else if (change.type === PendingAction.Update) {
            const existingCreateIndex = secretChanges.findIndex(
              (c) => c.type === PendingAction.Create && c.id === change.id
            );

            if (existingCreateIndex >= 0) {
              const existingCreate = secretChanges[existingCreateIndex] as PendingSecretCreate;
              secretChanges[existingCreateIndex] = {
                ...existingCreate,
                secretKey: change.newSecretName || change.secretKey || existingCreate.secretKey,
                secretValue:
                  change.secretValue !== undefined
                    ? change.secretValue
                    : existingCreate.secretValue,
                secretComment:
                  change.secretComment !== undefined
                    ? change.secretComment
                    : existingCreate.secretComment,
                skipMultilineEncoding:
                  change.skipMultilineEncoding !== undefined
                    ? change.skipMultilineEncoding
                    : existingCreate.skipMultilineEncoding,
                tags: change.tags !== undefined ? change.tags : existingCreate.tags,
                secretMetadata:
                  change.secretMetadata !== undefined
                    ? change.secretMetadata
                    : existingCreate.secretMetadata,
                timestamp: Date.now()
              };
            } else {
              const existingUpdateIndex = secretChanges.findIndex(
                (c) => c.type === PendingAction.Update && c.id === change.id
              );

              if (existingUpdateIndex >= 0) {
                const existingUpdate = secretChanges[existingUpdateIndex] as PendingSecretUpdate;

                const improvedUpdate: PendingSecretUpdate = {
                  ...existingUpdate,
                  secretKey: existingUpdate.secretKey,
                  originalValue: existingUpdate.originalValue,
                  originalComment: existingUpdate.originalComment,
                  originalSkipMultilineEncoding: existingUpdate.originalSkipMultilineEncoding,
                  originalTags: existingUpdate.originalTags,
                  originalSecretMetadata: existingUpdate.originalSecretMetadata,

                  newSecretName:
                    change.newSecretName !== undefined
                      ? change.newSecretName
                      : existingUpdate.newSecretName,
                  secretValue:
                    change.secretValue !== undefined
                      ? change.secretValue
                      : existingUpdate.secretValue,
                  secretComment:
                    change.secretComment !== undefined
                      ? change.secretComment
                      : existingUpdate.secretComment,
                  skipMultilineEncoding:
                    change.skipMultilineEncoding !== undefined
                      ? change.skipMultilineEncoding
                      : existingUpdate.skipMultilineEncoding,
                  tags: change.tags !== undefined ? change.tags : existingUpdate.tags,
                  secretMetadata:
                    change.secretMetadata !== undefined
                      ? change.secretMetadata
                      : existingUpdate.secretMetadata,

                  timestamp: Date.now()
                };

                const cleanedUpdate = cleanupRevertedFields(improvedUpdate);

                secretChanges[existingUpdateIndex] = cleanedUpdate;
              } else {
                secretChanges.push(change);
              }
            }
          } else {
            secretChanges.push(change);
          }

          newChanges.secrets = secretChanges;
        } else if (change.resourceType === "folder") {
          const folderChanges = [...newChanges.folders];

          if (change.type === PendingAction.Create) {
            const existingCreateIndex = folderChanges.findIndex(
              (c) => c.type === PendingAction.Create && c.folderName === change.folderName
            );

            if (existingCreateIndex >= 0) {
              folderChanges[existingCreateIndex] = {
                ...folderChanges[existingCreateIndex],
                ...change,
                timestamp: Date.now()
              };
            } else {
              folderChanges.push(change);
            }
          } else if (change.type === PendingAction.Update) {
            const existingCreateIndex = folderChanges.findIndex(
              (c) => c.type === PendingAction.Create && c.folderName === change.originalFolderName
            );

            if (existingCreateIndex >= 0) {
              const existingCreate = folderChanges[existingCreateIndex] as PendingFolderCreate;
              folderChanges[existingCreateIndex] = {
                ...existingCreate,
                folderName: change.folderName || existingCreate.folderName,
                description:
                  change.description !== undefined
                    ? change.description
                    : existingCreate.description,
                timestamp: Date.now()
              };
            } else {
              const existingUpdateIndex = folderChanges.findIndex(
                (c) => c.type === PendingAction.Update && c.id === change.id
              );

              if (existingUpdateIndex >= 0) {
                const existingUpdate = folderChanges[existingUpdateIndex] as PendingFolderUpdate;

                folderChanges[existingUpdateIndex] = {
                  ...existingUpdate,
                  originalFolderName: existingUpdate.originalFolderName,
                  originalDescription: existingUpdate.originalDescription,

                  folderName:
                    change.folderName !== undefined ? change.folderName : existingUpdate.folderName,
                  description:
                    change.description !== undefined
                      ? change.description
                      : existingUpdate.description,

                  timestamp: Date.now()
                };
              } else {
                folderChanges.push(change);
              }
            }
          } else {
            folderChanges.push(change);
          }

          newChanges.folders = folderChanges;
        }

        savePendingChangesToStorage(
          newChanges,
          context.workspaceId,
          context.environment,
          context.secretPath
        );
        return { pendingChanges: newChanges };
      }),

    removePendingChange: (changeId: string, resourceType: string, context: BatchContext) =>
      set((state) => {
        const newChanges = { ...state.pendingChanges };

        if (resourceType === "secret") {
          newChanges.secrets = newChanges.secrets.filter((c) => c.id !== changeId);
        } else if (resourceType === "folder") {
          newChanges.folders = newChanges.folders.filter((c) => c.id !== changeId);
        }

        savePendingChangesToStorage(
          newChanges,
          context.workspaceId,
          context.environment,
          context.secretPath
        );
        return { pendingChanges: newChanges };
      }),

    loadPendingChanges: (context) => {
      const changes = loadPendingChangesFromStorage(
        context.workspaceId,
        context.environment,
        context.secretPath
      );
      set({ pendingChanges: changes });
    },

    clearAllPendingChanges: (context) => {
      clearPendingChangesFromStorage(context.workspaceId, context.environment, context.secretPath);
      set({
        pendingChanges: { secrets: [], folders: [] }
      });
    },

    setExistingKeys: (secretKeys, folderNames) =>
      set({
        existingSecretKeys: new Set(secretKeys),
        existingFolderNames: new Set(folderNames)
      }),

    getTotalPendingChangesCount: () => {
      const state = get();
      return state.pendingChanges.secrets.length + state.pendingChanges.folders.length;
    }
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

type CombinedState = SelectedSecretState & PopUpState & BatchModeState;
const StoreContext = createContext<StoreApi<CombinedState> | null>(null);
export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const storeRef = useRef<StoreApi<CombinedState>>(
    createStore<CombinedState>((...a) => ({
      ...createSelectedSecretStore(...a),
      ...createPopUpStore(...a),
      ...createBatchModeStore(...a)
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

export const useBatchMode = () =>
  useStoreContext(
    useShallow((state) => ({
      isBatchMode: state.isBatchMode,
      pendingChanges: state.pendingChanges,
      currentContext: state.currentContext,
      totalChangesCount: state.batchActions.getTotalPendingChangesCount(),
      secretChangesCount: state.pendingChanges.secrets.length,
      folderChangesCount: state.pendingChanges.folders.length
    }))
  );

export const useBatchModeActions = () => useStoreContext(useShallow((state) => state.batchActions));
