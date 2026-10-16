import { DAY_IN_MS } from "@app/ee/services/audit-report/audit-report-fns";
import { groupBy, prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { buildFolderIdMap, buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";

import {
  SecretReadObjectType,
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

export const SECRET_READ_ACTIVITY_WINDOW_DAYS = 30;

export const getReadActivityWindowStart = () => new Date(Date.now() - SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS);

export const loadProjectFolderTree = async (
  {
    folderDAL,
    projectEnvDAL
  }: {
    folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
    projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  },
  projectId: string
) => {
  const [folders, environments] = await Promise.all([
    folderDAL.findByProjectId(projectId),
    projectEnvDAL.find({ projectId })
  ]);
  const folderById = buildFolderIdMap(folders);
  const envById = new Map(environments.map((env) => [env.id, env]));
  const paths = new Map<string, string>();
  const pathOf = (folderId: string) => {
    if (!paths.has(folderId)) paths.set(folderId, buildFolderPath(folderById[folderId], folderById));
    return paths.get(folderId) as string;
  };
  const locationOf = (folderId: string) => {
    const env = folderById[folderId] && envById.get(folderById[folderId].envId);
    return env ? { environment: env.slug, secretPath: pathOf(folderId) } : undefined;
  };
  const folderIdByLocation = new Map(
    folders.flatMap((folder) => {
      const location = locationOf(folder.id);
      return location ? [[toLocationKey(location), folder.id] as const] : [];
    })
  );
  return { folders, folderById, envById, pathOf, locationOf, folderIdByLocation };
};

export type TProjectFolderTree = Awaited<ReturnType<typeof loadProjectFolderTree>>;

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
// whole window. Before that, the reader has not had the whole window to read it.
export const coversWholeWindow = (trackedSince: Date, accessChangedAt: Date | undefined, windowStart: Date) =>
  trackedSince <= windowStart && (!accessChangedAt || accessChangedAt <= windowStart);

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
