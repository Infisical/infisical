import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { DAY_IN_MS } from "@app/ee/services/audit-report/audit-report-fns";
import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { groupBy, prefixWithSlash, removeTrailingSlash, unique } from "@app/lib/fn";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { buildFolderIdMap, buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";
import { LEVEL_BREAK } from "@app/services/secret-import/secret-import-fns";
import { MAX_SECRET_REFERENCE_DEPTH } from "@app/services/secret-v2-bridge/secret-reference-fns";

import {
  SecretReadNotJudgedReason,
  SecretReadObjectType,
  SecretReadStatus,
  TAccessSource,
  TMemberRole,
  TProjectAccess,
  TProjectFolderTree,
  TProjectReader,
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

export const SECRET_READ_ACTIVITY_WINDOW_DAYS = 30;

export const getReadActivityWindowStart = () => new Date(Date.now() - SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS);

// Reads from before tracking began are unknown, so unused access is only judged once a whole window has been tracked.
export const getUnusedAccessFrom = (trackingStartedAt: Date) =>
  new Date(trackingStartedAt.getTime() + SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS);

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

  // A read expands references at most MAX_SECRET_REFERENCE_DEPTH + 1 levels down, so a referencer further away never
  // returns this secret. Levels are walked in order, so each referencer is reached at its shortest distance.
  let pendingSecrets = [secret];
  for (let depth = 0; depth <= MAX_SECRET_REFERENCE_DEPTH && pendingSecrets.length; depth += 1) {
    const referencers = pendingSecrets.flatMap((pending) => graph.getReferencers(pending));
    pendingSecrets = [];
    for (const referencer of referencers) {
      // A personal secret is left out of folder reads that skip personal values, so only a read of the personal secret
      // itself counts, not of its folder. Nothing referencing it is followed either: a reference to its key resolves to
      // the shared secret unless the reader expands their own overrides, which records exactly what resolved.
      if (referencer.userId) {
        secretIds.add(referencer.id);
      } else {
        folderIds.add(referencer.folderId);
        if (!secretIds.has(referencer.id)) {
          secretIds.add(referencer.id);
          pendingSecrets.push(referencer);
        }
      }
    }
  }

  // Likewise, a read follows imports at most LEVEL_BREAK + 1 levels down.
  let pendingFolderIds = [...folderIds];
  for (let depth = 0; depth <= LEVEL_BREAK && pendingFolderIds.length; depth += 1) {
    const importerFolderIds = pendingFolderIds.flatMap((folderId) => graph.getImporterFolderIds(folderId));
    pendingFolderIds = [];
    for (const importerFolderId of importerFolderIds) {
      if (!folderIds.has(importerFolderId)) {
        folderIds.add(importerFolderId);
        pendingFolderIds.push(importerFolderId);
      }
    }
  }

  return { secretId: secret.id, secretIds, folderIds };
};

export const indexSecretReads = (reads: TSecretLastRead[]) => groupBy(reads, (read) => read.objectId);

// An unread secret only counts as unused once both it and the reader's access to it have existed for the whole
// window. Before that, the reader has not had the whole window to read it.
export const coversWholeWindow = (trackedSince: Date, accessSince: Date | undefined, windowStart: Date) =>
  trackedSince <= windowStart && (!accessSince || accessSince <= windowStart);

const subjectOf = ({ secret, environment, secretPath }: TSecretActivity) => ({
  environment,
  secretPath,
  secretName: secret.key,
  secretTags: secret.tags?.map((tag) => tag.slug)
});

// Dates an actor's access to each secret from the oldest of their sources that still grants it on its own, so a
// change only restarts the window for the secrets it opened. With no single source granting it (rules that only
// add up together), the newest source date is used. Restrictions that ended can have given access back, so access
// dates no earlier than an expired folder grant in its folder (folderReopenedAt, by "<actorId>:<folderId>"), an
// edited folder grant in its folder, or an expired temporary role or privilege anywhere (accessReopenedAt, by actor,
// since what it held back is not worked out). Sources are checked once per secret, shared ones (a role, a group)
// once for every actor holding them, and only the current secret's checks are kept.
export const createAccessDating = (
  sourcesByActorId: Record<string, TAccessSource[]>,
  folderReopenedAt: Map<string, Date>,
  accessReopenedAt: Map<string, Date>
): Pick<TProjectAccess, "accessSinceOf" | "latestAccessChangeOf"> => {
  const latestByActorId = new Map<string, Date>();
  const raise = (actorId: string, date?: Date) => {
    const current = latestByActorId.get(actorId);
    if (date && (!current || date > current)) latestByActorId.set(actorId, date);
  };
  Object.entries(sourcesByActorId).forEach(([actorId, sources]) =>
    sources.forEach((source) => raise(actorId, source.date))
  );
  folderReopenedAt.forEach((date, key) => raise(key.slice(0, key.indexOf(":")), date));
  accessReopenedAt.forEach((date, actorId) => raise(actorId, date));

  let checkedSecret: TSecretActivity | undefined;
  let checks = new Map<unknown, boolean>();

  const accessSinceOf = ({ actorId }: { actorId: string }, activity: TSecretActivity) => {
    if (activity !== checkedSecret) {
      checkedSecret = activity;
      checks = new Map();
    }
    const subject = subjectOf(activity);
    const inFolder = (source: TAccessSource) => source.folderId === activity.secret.folderId;
    const grants = (source: TAccessSource) => {
      if (source.folderId && !inFolder(source)) return false;
      const permission = source.permission();
      let granted = checks.get(permission);
      if (granted === undefined) {
        granted = hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, subject);
        checks.set(permission, granted);
      }
      return granted;
    };
    const sources = sourcesByActorId[actorId] ?? [];
    const grantingDates = sources.flatMap((source) => (source.date && grants(source) ? [source.date] : []));
    const since = grantingDates.length
      ? new Date(Math.min(...grantingDates.map((date) => date.getTime())))
      : latestByActorId.get(actorId);
    const floors = [
      folderReopenedAt.get(`${actorId}:${activity.secret.folderId}`),
      accessReopenedAt.get(actorId),
      ...sources.filter((source) => source.restartsFolder && inFolder(source)).map((source) => source.date)
    ];
    return floors.reduce((latest, floor) => (floor && (!latest || floor > latest) ? floor : latest), since);
  };

  return { accessSinceOf, latestAccessChangeOf: ({ actorId }) => latestByActorId.get(actorId) };
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
      const current = activity.get(read.actorId) ?? {
        actorType: read.actorType as TSecretReaderType,
        actorId: read.actorId,
        lastReadAt: read.lastReadAt
      };
      if (read.lastReadAt > current.lastReadAt) current.lastReadAt = read.lastReadAt;
      const isOfTheSecret = objectId === reach.secretId && objectType !== SecretReadObjectType.Folder;
      if (isOfTheSecret && (!current.lastSecretReadAt || read.lastReadAt > current.lastSecretReadAt)) {
        current.lastSecretReadAt = read.lastReadAt;
      }
      activity.set(read.actorId, current);
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
  activity: TSecretActivity,
  { readersByRules, adminActorIds, judgedFrom, accessSinceOf, latestAccessChangeOf }: TProjectAccess
): TSecretAccessSummary => {
  const { trackedSince, reads } = activity;
  const subject = subjectOf(activity);
  const entitled = unique(
    readersByRules
      .filter(([{ permission }]) =>
        hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, subject)
      )
      .flat(),
    (reader) => reader.actorId
  );
  const nonAdmins = entitled.filter((reader) => !adminActorIds.has(reader.actorId));
  // Only a reader with a source newer than the judged period needs the per-secret date.
  const accessSince = (reader: TProjectReader) => {
    const latest = latestAccessChangeOf(reader);
    return latest && latest > judgedFrom ? accessSinceOf(reader, activity) : latest;
  };
  // A folder read credits every secret in the folder, so one from before the reader had access to this secret did
  // not return it; a read recorded against the secret itself did, so it always counts. A read after the reader's
  // newest source change is after their access to every secret, so only an earlier one is checked.
  const readsByActorId = new Map<string, TSecretReadResult>();
  entitled.forEach((reader) => {
    const read = reads.get(reader.actorId);
    if (!read) return;
    const latest = latestAccessChangeOf(reader);
    const since = latest && read.lastReadAt < latest ? accessSinceOf(reader, activity) : undefined;
    if (!since || read.lastReadAt >= since) readsByActorId.set(reader.actorId, read);
    else if (read.lastSecretReadAt) readsByActorId.set(reader.actorId, { ...read, lastReadAt: read.lastSecretReadAt });
  });
  const unread = nonAdmins.filter(
    (reader) => !readsByActorId.has(reader.actorId) && coversWholeWindow(trackedSince, accessSince(reader), judgedFrom)
  );
  return { entitled, nonAdmins, unread, readsByActorId };
};

// A reader without a read who is not unused access was left out for one of three reasons, checked in this order.
// The last needs no check of its own: a non-admin whose access predates the judged period is only left out when
// the secret does not.
export const getReadStatus = ({
  lastReadAt,
  isUnused,
  isProjectAdmin,
  accessSince,
  judgedFrom,
  trackingStartedAt
}: {
  lastReadAt: Date | null;
  isUnused: boolean;
  isProjectAdmin: boolean;
  accessSince: Date;
  judgedFrom: Date;
  trackingStartedAt: Date;
}) => {
  if (lastReadAt) return { readStatus: SecretReadStatus.Read, notJudgedReason: null };
  if (isUnused) return { readStatus: SecretReadStatus.Unused, notJudgedReason: null };
  let notJudgedReason = SecretReadNotJudgedReason.SecretTooNew;
  if (isProjectAdmin) notJudgedReason = SecretReadNotJudgedReason.ProjectAdmin;
  else if (trackingStartedAt > judgedFrom) notJudgedReason = SecretReadNotJudgedReason.TrackingTooNew;
  else if (accessSince > judgedFrom) notJudgedReason = SecretReadNotJudgedReason.AccessTooNew;
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
