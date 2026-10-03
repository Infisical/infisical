import { PendingAction } from "@app/hooks/api/secretFolders/types";

import type {
  PendingSecretChange,
  PendingSecretCreate,
  PendingSecretUpdate
} from "./SecretMainPage.store";

const normalizeValue = (value: unknown): string | boolean | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  return value as string | boolean;
};

const areValuesEqual = (value1: unknown, value2: unknown) =>
  normalizeValue(value1) === normalizeValue(value2);

const areArraysEqual = (arr1: unknown[] | undefined, arr2: unknown[] | undefined): boolean => {
  if (!arr1 && !arr2) return true;
  if (!arr1 || !arr2 || arr1.length !== arr2.length) return false;

  return JSON.stringify(arr1) === JSON.stringify(arr2);
};

const cleanupRevertedSecretFields = (update: PendingSecretUpdate): PendingSecretUpdate | null => {
  const cleaned = { ...update };
  let hasChanges = false;

  if (
    cleaned.secretValue !== undefined &&
    !areValuesEqual(cleaned.secretValue, cleaned.originalValue)
  ) {
    hasChanges = true;
  } else {
    cleaned.secretValue = undefined;
  }

  if (
    cleaned.secretComment !== undefined &&
    (!areValuesEqual(cleaned.secretComment, cleaned.originalComment) ||
      !areValuesEqual(cleaned.secretComment, cleaned.existingSecret.comment))
  ) {
    hasChanges = true;
  } else {
    cleaned.secretComment = undefined;
  }

  if (
    cleaned.skipMultilineEncoding !== undefined &&
    cleaned.skipMultilineEncoding !== cleaned.originalSkipMultilineEncoding
  ) {
    hasChanges = true;
  } else {
    cleaned.skipMultilineEncoding = undefined;
  }

  if (cleaned.tags !== undefined && !areArraysEqual(cleaned.tags, cleaned.originalTags)) {
    hasChanges = true;
  } else {
    cleaned.tags = undefined;
  }

  if (
    cleaned.secretMetadata !== undefined &&
    !areArraysEqual(cleaned.secretMetadata, cleaned.originalSecretMetadata)
  ) {
    hasChanges = true;
  } else {
    cleaned.secretMetadata = undefined;
  }

  if (cleaned.newSecretName !== undefined && cleaned.newSecretName !== cleaned.secretKey) {
    hasChanges = true;
  } else {
    cleaned.newSecretName = undefined;
  }

  return hasChanges ? cleaned : null;
};

export const mergePendingSecretChange = (
  secretChanges: PendingSecretChange[],
  change: PendingSecretChange
): PendingSecretChange[] => {
  if (change.type === PendingAction.Create) {
    const existingCreateIndex = secretChanges.findIndex(
      (candidate) =>
        candidate.type === PendingAction.Create &&
        (candidate.id === change.id ||
          candidate.secretKey === change.secretKey ||
          candidate.secretKey === change.originalKey)
    );

    if (existingCreateIndex < 0) return [...secretChanges, change];

    const nextChanges = [...secretChanges];
    nextChanges[existingCreateIndex] = {
      ...nextChanges[existingCreateIndex],
      ...change,
      timestamp: Date.now()
    } as PendingSecretCreate;
    return nextChanges;
  }

  if (change.type === PendingAction.Delete) {
    const pendingCreate = secretChanges.find(
      (candidate) => candidate.id === change.id && candidate.type === PendingAction.Create
    );

    if (pendingCreate) return secretChanges.filter((candidate) => candidate.id !== change.id);

    return [...secretChanges.filter((candidate) => candidate.id !== change.id), change];
  }

  if (
    secretChanges.some(
      (candidate) => candidate.id === change.id && candidate.type === PendingAction.Delete
    )
  ) {
    return secretChanges;
  }

  const existingCreateIndex = secretChanges.findIndex(
    (candidate) => candidate.type === PendingAction.Create && candidate.id === change.id
  );

  if (existingCreateIndex >= 0) {
    const existingCreate = secretChanges[existingCreateIndex] as PendingSecretCreate;
    const nextChanges = [...secretChanges];
    nextChanges[existingCreateIndex] = {
      ...existingCreate,
      secretKey: change.newSecretName || change.secretKey || existingCreate.secretKey,
      secretValue:
        change.secretValue !== undefined ? change.secretValue : existingCreate.secretValue,
      secretComment:
        change.secretComment !== undefined ? change.secretComment : existingCreate.secretComment,
      skipMultilineEncoding:
        change.skipMultilineEncoding !== undefined
          ? change.skipMultilineEncoding
          : existingCreate.skipMultilineEncoding,
      tags: change.tags !== undefined ? change.tags : existingCreate.tags,
      secretMetadata:
        change.secretMetadata !== undefined ? change.secretMetadata : existingCreate.secretMetadata,
      timestamp: Date.now()
    };
    return nextChanges;
  }

  const existingUpdateIndex = secretChanges.findIndex(
    (candidate) => candidate.type === PendingAction.Update && candidate.id === change.id
  );

  if (existingUpdateIndex < 0) {
    const cleanedUpdate = cleanupRevertedSecretFields(change);
    return cleanedUpdate ? [...secretChanges, cleanedUpdate] : secretChanges;
  }

  const existingUpdate = secretChanges[existingUpdateIndex] as PendingSecretUpdate;
  const cleanedUpdate = cleanupRevertedSecretFields({
    ...existingUpdate,
    originalValue: existingUpdate.originalValue,
    originalComment: existingUpdate.originalComment,
    originalSkipMultilineEncoding: existingUpdate.originalSkipMultilineEncoding,
    originalTags: existingUpdate.originalTags,
    originalSecretMetadata: existingUpdate.originalSecretMetadata,
    newSecretName:
      change.newSecretName !== undefined ? change.newSecretName : existingUpdate.newSecretName,
    secretValue: change.secretValue !== undefined ? change.secretValue : existingUpdate.secretValue,
    secretComment:
      change.secretComment !== undefined ? change.secretComment : existingUpdate.secretComment,
    skipMultilineEncoding:
      change.skipMultilineEncoding !== undefined
        ? change.skipMultilineEncoding
        : existingUpdate.skipMultilineEncoding,
    tags: change.tags !== undefined ? change.tags : existingUpdate.tags,
    secretMetadata:
      change.secretMetadata !== undefined ? change.secretMetadata : existingUpdate.secretMetadata,
    existingSecret: existingUpdate.existingSecret,
    timestamp: Date.now()
  });

  const nextChanges = [...secretChanges];
  if (cleanedUpdate) nextChanges[existingUpdateIndex] = cleanedUpdate;
  else nextChanges.splice(existingUpdateIndex, 1);
  return nextChanges;
};
