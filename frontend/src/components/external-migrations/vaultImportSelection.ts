export type VaultImportSelectionState<TSelection> = {
  connectionId: string | null;
  namespace: string | null;
  mountPath: string | null;
  selection: TSelection | null;
};

export type VaultImportSelectionAction<TSelection> =
  | { type: "connection"; value: string }
  | { type: "namespace"; value: string }
  | { type: "mount"; value: string | null }
  | { type: "selection"; value: TSelection | null };

export const createVaultImportSelection = <TSelection>(
  connectionIds: string[]
): VaultImportSelectionState<TSelection> => ({
  connectionId: connectionIds.length === 1 ? connectionIds[0] : null,
  namespace: null,
  mountPath: null,
  selection: null
});

export const vaultImportSelectionReducer = <TSelection>(
  state: VaultImportSelectionState<TSelection>,
  action: VaultImportSelectionAction<TSelection>
): VaultImportSelectionState<TSelection> => {
  switch (action.type) {
    case "connection":
      return {
        connectionId: action.value,
        namespace: null,
        mountPath: null,
        selection: null
      };
    case "namespace":
      return { ...state, namespace: action.value, mountPath: null, selection: null };
    case "mount":
      return { ...state, mountPath: action.value, selection: null };
    case "selection":
      return { ...state, selection: action.value };
    default:
      return state;
  }
};
