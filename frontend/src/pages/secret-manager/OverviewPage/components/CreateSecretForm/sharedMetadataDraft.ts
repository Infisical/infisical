export type MetadataRow = {
  id: string;
  key: string;
  value: string;
  isEncrypted: boolean;
};

export type MetadataDraft = {
  row: MetadataRow;
  origin: MetadataRow | null;
  encryptionOrigin: boolean;
  encryption?: boolean;
  removedBy?: string;
};

export type MetadataDraftState = {
  entries: MetadataDraft[];
  removedKeys: string[];
};

export const editMetadataDraft = (
  state: MetadataDraftState,
  row: MetadataRow,
  origin: MetadataRow | null,
  changes: Partial<Pick<MetadataRow, "key" | "value" | "isEncrypted">>
): MetadataDraftState => {
  const existing = state.entries.find((entry) => entry.row.id === row.id);
  let original = origin ? { ...origin } : null;
  if (existing) original = existing.origin;
  const next = { ...(existing?.row ?? row), ...changes };
  const encryptionOrigin = existing?.encryptionOrigin ?? original?.isEncrypted ?? row.isEncrypted;
  let encryption = existing?.encryption;
  if (changes.isEncrypted !== undefined)
    encryption = changes.isEncrypted === encryptionOrigin ? undefined : changes.isEncrypted;
  const draft = {
    row: next,
    origin: original,
    encryptionOrigin,
    encryption,
    removedBy: existing?.removedBy
  };
  const clean =
    original &&
    next.key.trim() === original.key.trim() &&
    next.value === original.value &&
    next.isEncrypted === original.isEncrypted &&
    encryption === undefined &&
    !draft.removedBy;
  if (clean) return { ...state, entries: state.entries.filter((entry) => entry.row.id !== row.id) };
  return {
    ...state,
    entries: existing
      ? state.entries.map((entry) => (entry.row.id === row.id ? draft : entry))
      : [...state.entries, draft]
  };
};

export const setMetadataRemovals = (
  state: MetadataDraftState,
  keys: string[]
): MetadataDraftState => {
  const removedKeys = [...new Set(keys.map((key) => key.trim()))];
  const added = removedKeys.filter((key) => !state.removedKeys.includes(key));
  return {
    removedKeys,
    entries: state.entries.map((entry) => {
      if (entry.removedBy) {
        return removedKeys.includes(entry.removedBy) ? entry : { ...entry, removedBy: undefined };
      }
      const owner = (entry.origin?.key ?? entry.row.key).trim();
      return added.includes(owner) ? { ...entry, removedBy: owner } : entry;
    })
  };
};

export const removeMetadataDraft = (
  state: MetadataDraftState,
  row: MetadataRow,
  origin: MetadataRow | null
): MetadataDraftState => {
  const existing = state.entries.find((entry) => entry.row.id === row.id);
  const original = existing ? existing.origin : origin;
  if (!original) {
    return { ...state, entries: state.entries.filter((entry) => entry.row.id !== row.id) };
  }
  return setMetadataRemovals(state, [...state.removedKeys, original.key]);
};

export const projectMetadataDraft = (
  defaults: MetadataRow[],
  state: MetadataDraftState
): MetadataRow[] => {
  const owned = new Set(state.entries.map((entry) => (entry.origin?.key ?? entry.row.key).trim()));
  return [
    ...defaults.filter(
      (entry) => !state.removedKeys.includes(entry.key.trim()) && !owned.has(entry.key.trim())
    ),
    ...state.entries.filter((entry) => !entry.removedBy).map((entry) => entry.row)
  ].map((entry) => ({ ...entry }));
};

export const getMetadataDraftChanges = (state: MetadataDraftState, enforceEncryption: boolean) => {
  const active = state.entries.filter((entry) => !entry.removedBy);
  return {
    secretMetadata: active.length
      ? active.map(({ row, origin, encryption }) => ({
          key: row.key.trim(),
          value: row.value,
          previousKey: origin?.key.trim(),
          isEncrypted: enforceEncryption ? true : encryption
        }))
      : undefined,
    removedMetadataKeys: state.removedKeys
  };
};
