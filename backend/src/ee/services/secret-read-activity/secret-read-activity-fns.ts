import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { DAY_IN_MS } from "@app/ee/services/audit-report/audit-report-fns";
import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { groupBy, prefixWithSlash, removeTrailingSlash, unique } from "@app/lib/fn";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { buildFolderIdMap, buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";

import {
  SecretReadNotJudgedReason,
  SecretReadObjectType,
  SecretReadStatus,
  TMemberRole,
  TProjectAccess,
  TProjectFolderTree,
  TReachSecret,
  TSecretAccessSummary,
  TSecretActivity,
  TSecretLastRead,
  TSecretLocation,
  TSecretReach,
  TSecretReachGraph,
  TSecretReaderType,
  TSecretReadResult,
  TUnusedAccessRole
} from "./secret-read-activity-types";

export const getUtcMonthStart = (date: Date, monthOffset = 0) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1));

export const normalizeSecretPath = (secretPath: string) => removeTrailingSlash(prefixWithSlash(secretPath));

export const toLocationKey = ({ environment, secretPath }: TSecretLocation) =>
  `${environment}:${normalizeSecretPath(secretPath)}`;

export const toActorKey = (actorType: string, actorId: string) => `${actorType}:${actorId}`;

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
): Promise<TProjectFolderTree> => {
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
      const key = toActorKey(read.actorType, read.actorId);
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

// Who can read the secret's value today, and which of them have left it unread. Unused access is judged on the
// non-admins, since admins can read everything by design.
export const summarizeSecretAccess = (
  { secret, environment, secretPath, trackedSince, reads }: TSecretActivity,
  { readersByRules, adminActorIds, accessChangedAtByActorId, judgedFrom }: TProjectAccess
): TSecretAccessSummary => {
  const subject = { environment, secretPath, secretName: secret.key, secretTags: secret.tags?.map((tag) => tag.slug) };
  const entitled = unique(
    readersByRules
      .filter(([{ permission }]) =>
        hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, subject)
      )
      .flat(),
    (reader) => toActorKey(reader.actorType, reader.actorId)
  );
  const nonAdmins = entitled.filter((reader) => !adminActorIds.has(reader.actorId));
  const unread = nonAdmins.filter(
    (reader) =>
      !reads.has(toActorKey(reader.actorType, reader.actorId)) &&
      coversWholeWindow(trackedSince, accessChangedAtByActorId.get(reader.actorId), judgedFrom)
  );
  return { entitled, nonAdmins, unread };
};

// A reader without a read who is not unused access was left out for one of three reasons, checked in this order.
// The last needs no check of its own: a non-admin whose access predates the judged period is only left out when
// the secret does not.
export const getReadStatus = ({
  lastReadAt,
  isUnused,
  isProjectAdmin,
  accessChangedAt,
  judgedFrom
}: {
  lastReadAt: Date | null;
  isUnused: boolean;
  isProjectAdmin: boolean;
  accessChangedAt: Date | null;
  judgedFrom: Date;
}) => {
  if (lastReadAt) return { readStatus: SecretReadStatus.Read, notJudgedReason: null };
  if (isUnused) return { readStatus: SecretReadStatus.Unused, notJudgedReason: null };
  let notJudgedReason = SecretReadNotJudgedReason.SecretTooNew;
  if (isProjectAdmin) notJudgedReason = SecretReadNotJudgedReason.ProjectAdmin;
  else if (accessChangedAt && accessChangedAt > judgedFrom) notJudgedReason = SecretReadNotJudgedReason.AccessChanged;
  return { readStatus: SecretReadStatus.NotJudged, notJudgedReason };
};

// Only the names of the predefined roles are read, so the project id they are built for does not matter.
const BUILT_IN_ROLE_NAMES = new Map<string, string>(
  getPredefinedRoles({ projectId: "", projectType: ProjectType.SecretManager }).map((role) => [role.slug, role.name])
);

// A built-in role has no id and is named after its predefined role; a custom role keeps its own id and name.
export const toUnusedAccessRoles = (roles: TMemberRole[]): TUnusedAccessRole[] =>
  unique(
    roles.map(({ role, customRoleId, customRoleName }) =>
      role === ProjectMembershipRole.Custom
        ? { id: customRoleId ?? null, slug: role, name: customRoleName ?? role }
        : { id: null, slug: role, name: BUILT_IN_ROLE_NAMES.get(role) ?? role }
    ),
    (role) => `${role.slug}:${role.id ?? role.name}`
  );
