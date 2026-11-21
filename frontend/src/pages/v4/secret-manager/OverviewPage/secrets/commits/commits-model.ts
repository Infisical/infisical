import {
  FOLDER_FIELD_LABELS,
  FOLDER_FIELD_ORDER,
  FOLDER_IDENTITY_FIELD,
  getFolderFieldChanges,
  getFolderPopulatedFields,
  getSecretFieldChanges,
  getSecretPopulatedFields,
  SECRET_FIELD_LABELS,
  SECRET_FIELD_ORDER,
  SECRET_IDENTITY_FIELD,
  summarizeCompactFields
} from "@app/components/secrets/diff/fieldChanges";
import type { FolderVersionData, SecretVersionData } from "@app/components/secrets/diff/types";

import type { Resource } from "../../secrets-model";

export type CommitResourceChange = {
  resourceType: "secret" | "folder";
  action: "create" | "update" | "delete";
  name: string;
  before?: Resource;
  after?: Resource;
};

export type CommitSummary = {
  secretCount: number;
  folderCount: number;
  addedCount: number;
  updatedCount: number;
  deletedCount: number;
};

export const summarizeChanges = (changes: readonly CommitResourceChange[]): CommitSummary =>
  changes.reduce(
    (acc, change) => {
      if (change.resourceType === "secret") acc.secretCount += 1;
      else acc.folderCount += 1;
      if (change.action === "create") acc.addedCount += 1;
      else if (change.action === "update") acc.updatedCount += 1;
      else acc.deletedCount += 1;
      return acc;
    },
    { secretCount: 0, folderCount: 0, addedCount: 0, updatedCount: 0, deletedCount: 0 }
  );

export type ResourceChange = CommitResourceChange & { id: string };

const ORDER = { delete: 0, update: 1, create: 2 };

export const sortChanges = (changes: readonly CommitResourceChange[]): ResourceChange[] =>
  changes
    .map((change, index) => ({ ...change, id: `${index}:${change.resourceType}:${change.name}` }))
    .sort((a, b) => {
      if (a.action !== b.action) return ORDER[a.action] - ORDER[b.action];
      if (a.resourceType !== b.resourceType) return a.resourceType === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

export const toSecretData = (resource?: Resource): SecretVersionData | undefined => {
  if (resource?.kind !== "secret") return undefined;
  return {
    secretKey: resource.name,
    secretValue: resource.value.status === "present" ? resource.value.value : undefined,
    secretValueHidden: resource.value.status !== "present",
    secretComment: resource.comment,
    tags: resource.tags.map((slug) => ({ slug, color: "" })),
    secretMetadata: resource.metadata.map((entry) => ({
      key: entry.key,
      value: entry.value,
      isEncrypted: entry.encrypted
    })),
    skipMultilineEncoding: resource.skipMultilineEncoding
  };
};

export const toFolderData = (resource?: Resource): FolderVersionData | undefined =>
  resource?.kind === "folder"
    ? { name: resource.name, description: resource.description }
    : undefined;

export const fieldSummary = (change: CommitResourceChange) => {
  if (change.resourceType === "secret") {
    const oldVersion = toSecretData(change.before);
    const newVersion = toSecretData(change.after);
    const oldPopulated = getSecretPopulatedFields(oldVersion);
    const newPopulated = getSecretPopulatedFields(newVersion);
    const summary = summarizeCompactFields({
      operationType: change.action,
      fieldOrder: SECRET_FIELD_ORDER,
      identityField: SECRET_IDENTITY_FIELD,
      changes: getSecretFieldChanges(oldVersion, newVersion),
      populated: change.action === "delete" ? oldPopulated : newPopulated
    });
    return {
      ...summary,
      hasHiddenState: SECRET_FIELD_ORDER.some(
        (key) =>
          key !== SECRET_IDENTITY_FIELD &&
          !summary.visibleKeys.includes(key) &&
          (oldPopulated[key] || newPopulated[key])
      ),
      identityLabel: SECRET_FIELD_LABELS[SECRET_IDENTITY_FIELD],
      singleChangedLabel: SECRET_FIELD_LABELS[summary.changedKeys[0]]
    };
  }
  const oldVersion = toFolderData(change.before);
  const newVersion = toFolderData(change.after);
  const oldPopulated = getFolderPopulatedFields(oldVersion);
  const newPopulated = getFolderPopulatedFields(newVersion);
  const summary = summarizeCompactFields({
    operationType: change.action,
    fieldOrder: FOLDER_FIELD_ORDER,
    identityField: FOLDER_IDENTITY_FIELD,
    changes: getFolderFieldChanges(oldVersion, newVersion),
    populated: change.action === "delete" ? oldPopulated : newPopulated
  });
  return {
    ...summary,
    hasHiddenState: FOLDER_FIELD_ORDER.some(
      (key) =>
        key !== FOLDER_IDENTITY_FIELD &&
        !summary.visibleKeys.includes(key) &&
        (oldPopulated[key] || newPopulated[key])
    ),
    identityLabel: FOLDER_FIELD_LABELS[FOLDER_IDENTITY_FIELD],
    singleChangedLabel: FOLDER_FIELD_LABELS[summary.changedKeys[0]]
  };
};

export const hasHiddenState = (change: CommitResourceChange) => fieldSummary(change).hasHiddenState;
