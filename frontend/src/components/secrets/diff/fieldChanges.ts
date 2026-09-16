import { FolderVersionData, SecretVersionData } from "./types";

export type SecretFieldKey =
  | "secretKey"
  | "secretValue"
  | "secretComment"
  | "tags"
  | "secretMetadata"
  | "skipMultilineEncoding";

export type FolderFieldKey = "name" | "description";

export type ResourceOperationType = "create" | "update" | "delete";

export const SECRET_FIELD_LABELS: Record<SecretFieldKey, string> = {
  secretKey: "Key",
  secretValue: "Value",
  secretComment: "Comment",
  tags: "Tags",
  secretMetadata: "Metadata",
  skipMultilineEncoding: "Multi-line encoding"
};

export const FOLDER_FIELD_LABELS: Record<FolderFieldKey, string> = {
  name: "Name",
  description: "Description"
};

/** Display order for every view that renders properties one after another. */
export const SECRET_FIELD_ORDER: SecretFieldKey[] = [
  "secretKey",
  "secretValue",
  "secretComment",
  "tags",
  "secretMetadata",
  "skipMultilineEncoding"
];

export const FOLDER_FIELD_ORDER: FolderFieldKey[] = ["name", "description"];

/**
 * The field that identifies the resource. The card header already shows it, so an
 * update only counts it as a property once it changes (a rename), while a create or
 * delete anchors its compact view on it.
 */
export const SECRET_IDENTITY_FIELD: SecretFieldKey = "secretKey";
export const FOLDER_IDENTITY_FIELD: FolderFieldKey = "name";

export type CompactFieldSummary<K extends string> = {
  /** Properties the compact view renders, in display order. */
  visibleKeys: K[];
  changedKeys: K[];
  changedCount: number;
};

/**
 * Picks the properties worth showing without the full state: what changed for an
 * update, what was populated for a create, and nothing but the identity for a delete.
 */
export const summarizeCompactFields = <K extends string>({
  operationType,
  fieldOrder,
  identityField,
  changes,
  populated
}: {
  operationType: ResourceOperationType;
  fieldOrder: K[];
  identityField: K;
  changes: Record<K, boolean>;
  populated: Record<K, boolean>;
}): CompactFieldSummary<K> => {
  const changedKeys = fieldOrder.filter((key) => changes[key]);

  let visibleKeys: K[];
  if (operationType === "update") {
    visibleKeys = changedKeys;
  } else if (operationType === "create") {
    visibleKeys = fieldOrder.filter((key) => key === identityField || populated[key]);
  } else {
    visibleKeys = [identityField];
  }

  return {
    visibleKeys,
    changedKeys,
    changedCount: changedKeys.length
  };
};

const normalizeTags = (tags?: Array<{ slug: string; color: string }>) =>
  (tags ?? [])
    .map((tag) => tag.slug)
    .sort()
    .join("\0");

const normalizeMetadata = (
  metadata?: Array<{ key: string; value: string; isEncrypted?: boolean }>
) =>
  (metadata ?? [])
    .map((entry) => `${entry.key}=${entry.value}=${entry.isEncrypted ? "1" : "0"}`)
    .sort()
    .join("\0");

export const getSecretFieldChanges = (
  oldVersion?: SecretVersionData,
  newVersion?: SecretVersionData
): Record<SecretFieldKey, boolean> => {
  const oldKey = oldVersion?.secretKey ?? "";
  const newKey = newVersion?.secretKey ?? "";

  const oldValue = oldVersion?.secretValue ?? "";
  const newValue = newVersion?.secretValue ?? oldVersion?.secretValue ?? "";

  return {
    // A create or delete leaves one side empty, which is not a rename
    secretKey: oldKey !== newKey && oldKey !== "" && newKey !== "",
    secretValue: oldValue !== newValue,
    secretComment: (oldVersion?.secretComment ?? "") !== (newVersion?.secretComment ?? ""),
    tags: normalizeTags(oldVersion?.tags) !== normalizeTags(newVersion?.tags),
    secretMetadata:
      normalizeMetadata(oldVersion?.secretMetadata) !==
      normalizeMetadata(newVersion?.secretMetadata),
    skipMultilineEncoding:
      String(oldVersion?.skipMultilineEncoding ?? false) !==
      String(newVersion?.skipMultilineEncoding ?? false)
  };
};

export const getSecretPopulatedFields = (
  version?: SecretVersionData
): Record<SecretFieldKey, boolean> => ({
  secretKey: Boolean(version?.secretKey),
  // A value the viewer has no access to is still a value
  secretValue: Boolean(version?.secretValue) || Boolean(version?.secretValueHidden),
  secretComment: Boolean(version?.secretComment),
  tags: Boolean(version?.tags?.length),
  secretMetadata: Boolean(version?.secretMetadata?.length),
  skipMultilineEncoding: Boolean(version?.skipMultilineEncoding)
});

export const getFolderPopulatedFields = (
  version?: FolderVersionData
): Record<FolderFieldKey, boolean> => ({
  name: Boolean(version?.name),
  description: Boolean(version?.description)
});

export const getFolderFieldChanges = (
  oldVersion?: FolderVersionData,
  newVersion?: FolderVersionData
): Record<FolderFieldKey, boolean> => {
  const oldName = oldVersion?.name ?? "";
  const newName = newVersion?.name ?? "";

  return {
    name: oldName !== newName && oldName !== "" && newName !== "",
    description: (oldVersion?.description ?? "") !== (newVersion?.description ?? "")
  };
};
