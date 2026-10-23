import { MongoAbility, MongoQuery } from "@casl/ability";

import { TProjectEnvironments, TSecretFolders, TSecretReadActivity } from "@app/db/schemas";
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
};

// Everything whose read hands over this secret's value: the secret and every secret that references it,
// and every folder that holds one of those or imports one that does.
export type TSecretReach = {
  secretId: string;
  secretIds: Set<string>;
  folderIds: Set<string>;
};

export type TReachSecret = { id: string; folderId: string; key?: string };

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

type TReturnedSecret = { id: string; secretValueHidden: boolean };

export type TRecordBulkSecretReadDTO = TSecretReader & {
  environment: string;
  secretPath: string;
  recursive: boolean;
  isFiltered: boolean;
  includeImports: boolean;
  expandSecretReferences: boolean;
  includesPersonalOverrides?: boolean;
  notModified?: boolean;
  secrets: TReturnedSecret[];
  imports?: { secrets: TReturnedSecret[] }[];
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
  reads: Map<string, TSecretReadResult>;
};

export type TProjectReader = {
  actorType: TSecretReaderType;
  actorId: string;
  permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
};

export type TProjectAccess = {
  readersByRules: TProjectReader[][];
  adminActorIds: Set<string>;
  accessChangedAtByActorId: Map<string, Date>;
  judgedFrom: Date;
};

export type TSecretAccessSummary = {
  // Everyone who can read the value today, each once.
  entitled: TProjectReader[];
  nonAdmins: TProjectReader[];
  unread: TProjectReader[];
  ghostReaders: TSecretReadResult[];
};

// A reader who can read the value today, and whether they count as unused access: no read, with the secret and
// their access both older than the judged period. When they do not, the other fields say why.
export type TEntitledReader = {
  actorType: TSecretReaderType;
  actorId: string;
  actorName: string | null;
  unread: boolean;
  isAdmin: boolean;
  accessChangedAt: Date | null;
};

export type TMemberRole = Awaited<
  ReturnType<TPermissionServiceFactory["getProjectPermissions"]>
>["userPermissions"][number]["roles"][number];

export type TUnusedAccessRole = { id: string | null; slug: string; name: string };

export type TUnusedAccessPaths = {
  roles: TUnusedAccessRole[];
  groups: { id: string; name: string; roles: TUnusedAccessRole[] }[];
  additionalPrivileges: { id: string; name: string }[];
};

export type TUnusedAccessActor = {
  actorType: TSecretReaderType;
  actorId: string;
  name: string;
  entitledCount: number;
  unreadCount: number;
  environments: string[];
  lastReadAt: Date | null;
  accessPaths: TUnusedAccessPaths;
};

export type TUnusedAccessTally = {
  actorType: TSecretReaderType;
  actorId: string;
  entitledCount: number;
  unreadCount: number;
  // Capped at UNUSED_ACCESS_MAX_SECRETS_PER_ACTOR
  unreadSecretIds: string[];
  environments: Set<string>;
};

export type TUnusedAccessSummary = {
  rows: TUnusedAccessActor[];
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
