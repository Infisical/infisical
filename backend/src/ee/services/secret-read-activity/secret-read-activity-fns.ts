import { TLastSecretRead } from "@app/ee/services/audit-log/audit-log-dal";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { groupBy, prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";

import {
  SecretReadStatus,
  TReachSecret,
  TSecretLocation,
  TSecretReach,
  TSecretReachGraph,
  TSecretReadActivity
} from "./secret-read-activity-types";

export const SECRET_READ_EVENT_TYPES = [
  EventType.GET_SECRETS,
  EventType.GET_SECRET,
  EventType.DASHBOARD_GET_SECRET_VALUE
];

export const toLocationKey = ({ environment, secretPath }: TSecretLocation) =>
  `${environment}:${removeTrailingSlash(prefixWithSlash(secretPath))}`;

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

  const reach: TSecretReach = {
    secretIds,
    locations: new Set(),
    parentLocations: new Set(),
    environments: new Set()
  };
  folderIds.forEach((folderId) => {
    const location = graph.getLocation(folderId);
    if (!location) return;
    reach.locations.add(toLocationKey(location));
    reach.environments.add(location.environment);
  });
  folderIds.forEach((folderId) => {
    const visited = new Set<string>();
    let parentId = graph.getParentFolderId(folderId);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const location = graph.getLocation(parentId);
      if (location && !reach.locations.has(toLocationKey(location))) {
        reach.parentLocations.add(toLocationKey(location));
      }
      parentId = graph.getParentFolderId(parentId);
    }
  });
  return reach;
};

export const indexSecretReads = (reads: TLastSecretRead[]) => ({
  bySecretId: groupBy(
    reads.filter((read) => read.secretId),
    (read) => read.secretId as string
  ),
  byLocation: groupBy(
    reads.filter((read) => !read.secretId),
    (read) => toLocationKey(read)
  )
});

// Reads before trackedSince are ignored: the secret, or the path it lives at, did not exist yet.
export const classifySecretReads = (
  reads: ReturnType<typeof indexSecretReads>,
  reach: TSecretReach,
  trackedSince: Date
) => {
  const activity = new Map<string, TSecretReadActivity>();
  const record = (status: SecretReadStatus, matches: TLastSecretRead[] = []) => {
    matches.forEach((read) => {
      if (read.lastReadAt < trackedSince) return;
      const key = `${read.actor}:${read.actorId}`;
      const current = activity.get(key);
      // Definite reads are recorded first, so a possible read never replaces one.
      if (!current || (current.status === status && read.lastReadAt > current.lastReadAt)) {
        activity.set(key, { actorType: read.actor, actorId: read.actorId, status, lastReadAt: read.lastReadAt });
      }
    });
  };

  reach.secretIds.forEach((secretId) => record(SecretReadStatus.Read, reads.bySecretId[secretId]));
  reach.locations.forEach((location) => record(SecretReadStatus.Read, reads.byLocation[location]));
  reach.parentLocations.forEach((location) => record(SecretReadStatus.PossiblyRead, reads.byLocation[location]));
  return activity;
};
