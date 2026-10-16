import { TSecretReadActivity } from "@app/db/schemas";
import { OrderByDirection } from "@app/lib/types";
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

export type TUnusedSecretAccess = {
  secretKey: string;
  environment: string;
  secretPath: string;
  actorType: TSecretReaderType;
  actorId: string;
  actorName: string;
};

// Each value is the row field it sorts by.
export enum UnusedSecretAccessOrderBy {
  SecretKey = "secretKey",
  Environment = "environment",
  SecretPath = "secretPath",
  Actor = "actorName"
}

export type TListUnusedSecretAccessDTO = {
  projectId: string;
  offset: number;
  limit: number;
  orderBy?: UnusedSecretAccessOrderBy;
  orderDirection: OrderByDirection;
};
