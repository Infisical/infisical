import { TSecretReadActivity } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";

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

// Without a secret, the whole project is in scope.
export type TReadActivityScope = {
  projectId: string;
  windowStart: Date;
  secret?: Omit<TGetSecretReadActivityDTO, "projectId">;
};

// How a secret stands: everyone who can read its value today, admins included; the non-admins among them with
// no read in the window; and the readers in the window who can no longer read it, so they still know the value.
export type TSecretExposureCounts = {
  entitledCount: number;
  unreadCount: number;
  ghostReaderCount: number;
};

export enum SecretExposureBand {
  Low = "low",
  Elevated = "elevated",
  High = "high",
  Critical = "critical"
}

export enum SecretExposureDriver {
  Readers = "readers",
  GhostReaders = "ghost-readers",
  UnusedAccess = "unused-access"
}

export type TSecretExposureDriver = {
  kind: SecretExposureDriver;
  // Whole points, adding up to the score, so the arithmetic shown beside the number is exact.
  points: number;
  label: string;
};

export type TSecretExposure = {
  score: number;
  band: SecretExposureBand;
  drivers: TSecretExposureDriver[];
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

export enum UnusedAccessPrincipalType {
  User = "user",
  Identity = "identity",
  Group = "group"
}

// A user, group or machine identity that can read secrets it has not read in the window.
export type TUnusedAccessPrincipal = {
  principalType: UnusedAccessPrincipalType;
  principalId: string;
  name: string;
  // Groups only.
  memberCount: number | null;
  // The secrets it can read, and how many of those it has not read.
  entitledCount: number;
  unreadCount: number;
  // The environments holding its unread secrets.
  environments: string[];
  // Its latest read of any secret in the project within the window; a group's is its members' latest.
  lastReadAt: Date | null;
  // How it has the access: roles, additional privileges and groups.
  accessVia: string[];
};

export type TUnusedSecret = TSecretLocation & { secretKey: string };

export type TListUnusedAccessDTO = {
  projectId: string;
  offset: number;
  limit: number;
  search?: string;
};

export type TGetUnusedAccessPrincipalDTO = {
  projectId: string;
  principalType: UnusedAccessPrincipalType;
  principalId: string;
};
