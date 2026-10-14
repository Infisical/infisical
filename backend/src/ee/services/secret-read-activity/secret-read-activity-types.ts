import { TLastSecretRead } from "@app/ee/services/audit-log/audit-log-dal";
import { OrderByDirection } from "@app/lib/types";

export enum SecretReadStatus {
  Read = "read",
  // Only a parent folder was read. That returns the secret only if the read was recursive, which the
  // audit log does not record.
  PossiblyRead = "possibly-read",
  NoReads = "no-reads"
}

export type TSecretReadActivity = {
  actorType: TLastSecretRead["actor"];
  actorId: string;
  status: SecretReadStatus;
  lastReadAt: Date;
};

// Everything whose read hands over this secret's value: the secret, every secret that references it,
// and every folder that holds one of those or imports one that does.
export type TSecretReach = {
  secretKey?: string;
  secretIds: Set<string>;
  locations: Set<string>;
  parentLocations: Set<string>;
  environments: Set<string>;
};

export type TReachSecret = { id: string; folderId: string; key?: string };

export type TSecretLocation = { environment: string; secretPath: string };

export type TSecretReachGraph = {
  getReferencers: (secret: TReachSecret) => TReachSecret[];
  getImporterFolderIds: (folderId: string) => string[];
  getParentFolderId: (folderId: string) => string | null | undefined;
  getLocation: (folderId: string) => TSecretLocation | undefined;
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
  orgId: string;
  windowDays: number;
  secret?: Omit<TGetSecretReadActivityDTO, "projectId">;
};

export type TUnusedSecretAccess = {
  secretKey: string;
  environment: string;
  secretPath: string;
  principalType: TLastSecretRead["actor"];
  principalId: string;
  principalName: string;
  readStatus: SecretReadStatus;
  lastReadAt: Date | null;
  trackedSince: Date;
};

// Each value is the row field it sorts by.
export enum UnusedSecretAccessOrderBy {
  SecretKey = "secretKey",
  Environment = "environment",
  SecretPath = "secretPath",
  Principal = "principalName",
  Status = "readStatus",
  TrackedSince = "trackedSince"
}

export type TListUnusedSecretAccessDTO = {
  projectId: string;
  offset: number;
  limit: number;
  orderBy?: UnusedSecretAccessOrderBy;
  orderDirection: OrderByDirection;
};
