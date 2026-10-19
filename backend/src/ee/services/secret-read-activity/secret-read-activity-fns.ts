import { DAY_IN_MS } from "@app/ee/services/audit-report/audit-report-fns";
import { groupBy, prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { buildFolderIdMap, buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";

import {
  SecretExposureBand,
  SecretExposureDriver,
  SecretReadObjectType,
  TReachSecret,
  TSecretExposure,
  TSecretExposureCounts,
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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// Counts grow long-tailed: going from 2 to 12 readers matters far more than going from 40 to 50.
const logScale = (value: number, saturateAt: number) => clamp01(Math.log2(value + 1) / Math.log2(saturateAt + 1));

const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

// A score from 0 to 100 built from the three facts read activity gives: how many can read the value, how many
// who no longer can still know it, and how many of those who can never do. The weights follow the blast radius
// prototype's proportions for the same three terms, rescaled to add up to 100.
export const calculateExposureScore = ({
  entitledCount,
  unreadCount,
  ghostReaderCount
}: TSecretExposureCounts): TSecretExposure => {
  const terms = [
    {
      kind: SecretExposureDriver.Readers,
      points: 45 * logScale(entitledCount, 40),
      label: `${pluralize(entitledCount, "user or machine identity", "users and machine identities")} can read the value`
    },
    {
      kind: SecretExposureDriver.GhostReaders,
      points: 30 * clamp01(ghostReaderCount / 4),
      label: `${pluralize(ghostReaderCount, "ghost reader", "ghost readers")} can no longer read it but still ${
        ghostReaderCount === 1 ? "knows" : "know"
      } the value`
    },
    {
      kind: SecretExposureDriver.UnusedAccess,
      points: 25 * (entitledCount ? unreadCount / entitledCount : 0),
      label: `${unreadCount} of ${entitledCount} ${unreadCount === 1 ? "has" : "have"} not read it in ${SECRET_READ_ACTIVITY_WINDOW_DAYS} days`
    }
  ];
  const score = Math.round(terms.reduce((total, term) => total + term.points, 0));

  // Whole numbers that add up to exactly the score, by largest remainder: rounding each term on its own comes
  // out a point off the total often enough to look like a bug.
  const contributing = terms.filter((term) => term.points > 0).sort((a, b) => b.points - a.points);
  const points = contributing.map((term) => Math.floor(term.points));
  let remainder = score - points.reduce((total, value) => total + value, 0);
  contributing
    .map((term, index) => ({ index, fraction: term.points - points[index] }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => {
      if (remainder <= 0) return;
      points[index] += 1;
      remainder -= 1;
    });
  const drivers = contributing
    .map((term, index) => ({ kind: term.kind, points: points[index], label: term.label }))
    .filter((driver) => driver.points > 0);

  let band = SecretExposureBand.Low;
  if (score >= 85) band = SecretExposureBand.Critical;
  else if (score >= 60) band = SecretExposureBand.High;
  else if (score >= 30) band = SecretExposureBand.Elevated;

  return { score, band, drivers };
};
