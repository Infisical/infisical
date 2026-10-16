import { groupBy, prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";

import {
  SecretReadObjectType,
  SecretReadStatus,
  TReachSecret,
  TSecretLastRead,
  TSecretLocation,
  TSecretReach,
  TSecretReachGraph,
  TSecretReaderType,
  TSecretReadResult
} from "./secret-read-activity-types";

export const getUtcMonthStart = (date: Date, monthOffset = 0) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));

export const normalizeSecretPath = (secretPath: string) => removeTrailingSlash(prefixWithSlash(secretPath));

export const toLocationKey = ({ environment, secretPath }: TSecretLocation) =>
  `${environment}:${normalizeSecretPath(secretPath)}`;

// Imports and references check the reader's own access to the source secret, so a read through either
// one uses that access and must count.
export const computeSecretReach = (secret: TReachSecret, graph: TSecretReachGraph): TSecretReach => {
  const secretIds = new Set([secret.id]);
  const folderIds = new Set([secret.folderId]);

  const pendingSecrets = [secret];
  while (pendingSecrets.length) {
    for (const referencer of graph.getReferencers(pendingSecrets.pop() as TReachSecret)) {
      folderIds.add(referencer.folderId);
      if (!secretIds.has(referencer.id)) {
        secretIds.add(referencer.id);
        pendingSecrets.push(referencer);
      }
    }
  }

  const pendingFolderIds = [...folderIds];
  while (pendingFolderIds.length) {
    for (const importerFolderId of graph.getImporterFolderIds(pendingFolderIds.pop() as string)) {
      if (!folderIds.has(importerFolderId)) {
        folderIds.add(importerFolderId);
        pendingFolderIds.push(importerFolderId);
      }
    }
  }

  return { secretId: secret.id, secretIds, folderIds };
};

export const indexSecretReads = (reads: TSecretLastRead[]) => groupBy(reads, (read) => read.objectId);

// An unread secret only counts as unused once both it and the reader's current access have existed for the
// whole window.
export const getUnreadStatus = (trackedSince: Date, accessChangedAt: Date | undefined, windowStart: Date) => {
  const judgedSince = accessChangedAt && accessChangedAt > trackedSince ? accessChangedAt : trackedSince;
  return {
    trackedSince: judgedSince,
    readStatus: judgedSince > windowStart ? SecretReadStatus.Tracking : SecretReadStatus.NoReads
  };
};

// Reads before trackedSince are ignored: the secret or its folder did not exist yet.
export const classifySecretReads = (
  readsByObjectId: ReturnType<typeof indexSecretReads>,
  reach: TSecretReach,
  trackedSince: Date
) => {
  const activity = new Map<string, TSecretReadResult>();
  const record = (objectType: SecretReadObjectType, objectId: string) => {
    (readsByObjectId[objectId] ?? []).forEach((read) => {
      if (read.objectType !== objectType || read.lastReadAt < trackedSince) return;
      const key = `${read.actorType}:${read.actorId}`;
      const current = activity.get(key);
      if (!current || read.lastReadAt > current.lastReadAt) {
        activity.set(key, {
          actorType: read.actorType as TSecretReaderType,
          actorId: read.actorId,
          status: SecretReadStatus.Read,
          lastReadAt: read.lastReadAt
        });
      }
    });
  };

  reach.secretIds.forEach((secretId) => record(SecretReadObjectType.Secret, secretId));
  record(SecretReadObjectType.SecretUnexpanded, reach.secretId);
  reach.folderIds.forEach((folderId) => record(SecretReadObjectType.Folder, folderId));
  return activity;
};
