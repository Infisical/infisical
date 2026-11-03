import { MongoAbility, MongoQuery } from "@casl/ability";

import { SecretFolderRole, TProjectEnvironments, TSecretFolders, TSecretReadActivity } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { ActorType } from "@app/services/auth/auth-type";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

// A reader's last read of an object. The table also keys it by month (its partition key), which the DAL adds
// on write and folds away on read.
export type TSecretLastRead = Omit<TSecretReadActivity, "readMonth">;

// A bulk read that returned whole folders is recorded against them. Anything narrower, and every single read,
// is recorded against the secrets it returned, as unexpanded when their references were not resolved: those
// handed over only the secret itself, not the values it references.
export enum SecretReadObjectType {
  Folder = "folder",
  Secret = "secret",
  SecretUnexpanded = "secret-unexpanded"
}

export type TSecretReaderType = ActorType.USER | ActorType.IDENTITY;

export type TSecretReadResult = {
  actorType: TSecretReaderType;
  actorId: string;
  lastReadAt: Date;
  // The latest read recorded against the secret itself, so known to have returned it, unlike a folder read.
  lastSecretReadAt?: Date;
};

// Everything whose read hands over this secret's value: the secret and every secret that references it,
// and every folder that holds one of those or imports one that does.
export type TSecretReach = {
  secretId: string;
  secretIds: Set<string>;
  folderIds: Set<string>;
};

// userId is set on a personal secret: its owner's.
export type TReachSecret = { id: string; folderId: string; key?: string; userId?: string | null };

export type TSecretLocation = { environment: string; secretPath: string };

// A project's folders, loaded once, with each folder's path and location worked out on demand.
export type TProjectFolderTree = {
  folders: TSecretFolders[];
  folderById: Record<string, TSecretFolders>;
  envById: Map<string, TProjectEnvironments>;
  pathOf: (folderId: string) => string;
  locationOf: (folderId: string) => TSecretLocation | undefined;
  folderIdByLocation: Map<string, string>;
};

export type TSecretReachGraph = {
  getReferencers: (secret: TReachSecret) => TReachSecret[];
  getImporterFolderIds: (folderId: string) => string[];
};

type TSecretReader = {
  actor: ActorType;
  actorId: string;
  projectId: string;
};

export type TRecordSecretReadDTO = TSecretReader & {
  secretIds: string[];
  referencesExpanded: boolean;
};

type TReturnedSecret = { id: string; type: string; secretValueHidden: boolean };

export type TRecordBulkSecretReadDTO = TSecretReader & {
  environment: string;
  secretPath: string;
  recursive: boolean;
  isFiltered: boolean;
  includeImports: boolean;
  expandSecretReferences: boolean;
  includesPersonalOverrides?: boolean;
  notModified?: boolean;
  // The response's ETag, which changes with what the read returned.
  etag?: string;
  secrets: TReturnedSecret[];
  imports?: { secrets: TReturnedSecret[] }[];
  // Set when references were expanded with the reader's personal overrides: the secrets they resolved to, credited
  // in place of matching references by key, which would credit a shared secret an override replaced.
  referencedSecretIds?: string[];
};

// What the request path appends to the stream; the consumer resolves it to folders and secrets.
export type TSecretReadStreamEntry = {
  actorType: TSecretReaderType;
  actorId: string;
  projectId: string;
  readAt: string;
  environment?: string;
  secretPath?: string;
  recursive?: boolean;
  secretIds?: string[];
  referencesExpanded?: boolean;
};

export type TGetSecretReadActivityDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  secretName: string;
};

// Without a secret, the whole project is in scope. A caller that already loaded the folder tree passes it in.
export type TReadActivityScope = {
  projectId: string;
  windowStart: Date;
  secret?: Omit<TGetSecretReadActivityDTO, "projectId">;
  tree?: TProjectFolderTree;
};

export type TSecretActivity = TSecretLocation & {
  secret: Awaited<ReturnType<TSecretV2BridgeDALFactory["find"]>>[number];
  trackedSince: Date;
  // Each reader's latest read of the secret, by actor id.
  reads: Map<string, TSecretReadResult>;
};

export type TProjectReader = {
  actorType: TSecretReaderType;
  actorId: string;
  permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
};

// One way an actor has access, and when it last changed. A folder grant only reaches secrets in its own folder.
export type TAccessSource = {
  date?: Date;
  folderId?: string;
  // A folder grant edited since it was created may have held access back before, so access in its folder dates from
  // the edit.
  restartsFolder?: boolean;
  permission: () => MongoAbility<ProjectPermissionSet, MongoQuery>;
};

export type TProjectAccess = {
  readersByRules: TProjectReader[][];
  adminActorIds: Set<string>;
  judgedFrom: Date;
  // When the actor got access to the secret: the oldest of their sources that grants it on its own.
  accessSinceOf: (actor: { actorId: string }, activity: TSecretActivity) => Date | undefined;
  // The newest of the actor's source dates. When it is older than the judged period, so is every secret's access.
  latestAccessChangeOf: (actor: { actorId: string }) => Date | undefined;
};

export type TSecretAccessSummary = {
  // Everyone who can read the value today, each once.
  entitled: TProjectReader[];
  nonAdmins: TProjectReader[];
  unread: TProjectReader[];
  // The latest read of each entitled reader, leaving out a read from before they had access to the secret: a
  // folder read then could not have returned it.
  readsByActorId: Map<string, TSecretReadResult>;
};

export enum SecretReadStatus {
  Read = "read",
  Unused = "unused",
  NotJudged = "not-judged"
}

export enum SecretReadNotJudgedReason {
  ProjectAdmin = "project-admin",
  TrackingTooNew = "tracking-too-new",
  AccessTooNew = "access-too-new",
  SecretTooNew = "secret-too-new"
}

export type TSecretReadActivityActor = {
  actorType: TSecretReaderType;
  actorId: string;
  name: string;
  isProjectAdmin: boolean;
  lastReadAt: Date | null;
  accessSince: Date;
  readStatus: SecretReadStatus;
  notJudgedReason: SecretReadNotJudgedReason | null;
};

// A group's roles carry no assignment id, and naming a role does not need one.
export type TMemberRole = Omit<
  Awaited<ReturnType<TPermissionServiceFactory["getProjectPermissions"]>>["userPermissions"][number]["roles"][number],
  "id"
>;

export type TUnusedAccessRole = { id: string | null; slug: string; name: string };

export type TUnusedAccessPaths = {
  roles: TUnusedAccessRole[];
  groups: { id: string; name: string; roles: TUnusedAccessRole[] }[];
  // Project-wide only; a privilege tied to a folder is a folder grant, listed under folderAccess.
  additionalPrivileges: { id: string; name: string }[];
  folderAccess: { id: string; folderId: string; environment: string; secretPath: string; role: SecretFolderRole }[];
};

export type TUnusedAccessActor = {
  actorType: TSecretReaderType;
  actorId: string;
  name: string;
  accessibleSecretCount: number;
  unusedSecretCount: number;
  environments: string[];
  accessPaths: TUnusedAccessPaths;
};

export type TUnusedAccessTally = {
  actorType: TSecretReaderType;
  actorId: string;
  accessibleSecretCount: number;
  unusedSecretCount: number;
  // Capped at UNUSED_ACCESS_MAX_SECRETS_PER_ACTOR
  unusedSecretIds: string[];
  environments: Set<string>;
};

export type TUnusedAccessSummary = {
  rows: TUnusedAccessActor[];
  // The unused secret ids of the top actors, by actor id.
  details: Record<string, string[]>;
};

export type TUnusedSecret = TSecretLocation & { secretKey: string };

export type TListUnusedAccessDTO = {
  projectId: string;
  offset: number;
  limit: number;
  search?: string;
};

export type TGetUnusedAccessActorDTO = {
  projectId: string;
  actorType: TSecretReaderType;
  actorId: string;
};
