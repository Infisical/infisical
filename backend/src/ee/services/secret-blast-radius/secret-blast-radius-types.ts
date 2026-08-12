import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { TProjectPermission } from "@app/lib/types";

export enum BlastRadiusWindow {
  SevenDays = "7d",
  ThirtyDays = "30d",
  NinetyDays = "90d"
}

export enum BlastRadiusLeg {
  Entitlement = "entitlement",
  Distribution = "distribution",
  Consumption = "consumption"
}

export enum ExposureBand {
  Low = "low",
  Elevated = "elevated",
  High = "high",
  Critical = "critical",
  // Two of the score's terms are computed from read activity, so an actor who cannot see audit logs
  // gets no number at all. Scoring them on the remaining terms would give the same secret a
  // different score depending on who is looking at it.
  Unavailable = "unavailable"
}

export enum PrincipalType {
  User = "user",
  Identity = "identity",
  Group = "group"
}

export enum ReadPrecision {
  Secret = "secret",
  Folder = "folder"
}

export enum DestinationKind {
  Sync = "sync",
  Import = "import",
  Replication = "replication",
  Reference = "reference",
  FolderGrant = "folderGrant"
}

export enum DestinationStatus {
  Healthy = "healthy",
  Stale = "stale",
  Failed = "failed",
  Unknown = "unknown"
}

export enum RotationVerdict {
  Green = "green",
  Amber = "amber",
  Red = "red"
}

export enum PrincipalOrder {
  NoReadsFirst = "no-reads-first",
  MostReadsFirst = "most-reads-first",
  Name = "name"
}

export enum PrincipalAccessFilter {
  All = "all",
  ReadValue = "read-value",
  DescribeOnly = "describe-only",
  Write = "write"
}

export enum PrincipalUsageFilter {
  All = "all",
  NoReads = "no-reads",
  Observed = "observed"
}

export type TGrantPathStep =
  | { kind: "group"; groupId: string; groupName: string }
  | { kind: "role"; roleName: string; roleSlug?: string; isTemporary: boolean; expiresAt?: string }
  | { kind: "additionalPrivilege"; privilegeId: string; name: string; isTemporary: boolean; expiresAt?: string };

export type TGrantCondition = {
  field: string;
  operator: string;
  value: unknown;
};

export type TGrantPath = {
  sourceId: string;
  via: TGrantPathStep[];
  conditions: TGrantCondition[];
};

export type TObservedActivity = {
  readCount: number;
  lastReadAt: string | null;
  lastReadOutsideWindow: boolean;
  precision: ReadPrecision | null;
  clients: string[];
};

export type TGroupMember = {
  id: string;
  name: string;
  type: PrincipalType.User | PrincipalType.Identity;
};

export type TBlastRadiusPrincipal = {
  id: string;
  name: string;
  type: PrincipalType;
  actions: ProjectPermissionSecretActions[];
  memberCount?: number;
  // Capped: a group of 400 does not need to ship 400 names to draw a graph. `memberCount` stays exact.
  members?: TGroupMember[];
  grantPaths: TGrantPath[];
  observed: TObservedActivity | null;
};

export type TBlastRadiusDestination = {
  id: string;
  kind: DestinationKind;
  label: string;
  provider?: string;
  target?: string;
  status: DestinationStatus;
  statusMessage?: string;
  lastSyncedAt?: string;
  autoSync?: boolean;
  crossProject: boolean;
};

export type TBlastRadiusConsumer = {
  actorId: string | null;
  actorType: string;
  label: string;
  authMethod?: string;
  clients: string[];
  readCount: number;
  lastReadAt: string;
  precision: ReadPrecision;
  entitledNow: boolean;
  principalExists: boolean;
};

export type TBlastRadius = {
  secret: {
    id: string;
    key: string;
    environment: string;
    environmentName: string;
    secretPath: string;
    folderId: string;
    version: number;
    lastValueChangedAt: string;
    isRotationManaged: boolean;
    hasApprovalPolicy: boolean;
  };
  exposure: {
    score: number | null;
    band: ExposureBand;
    drivers: string[];
  };
  principals: TBlastRadiusPrincipal[];
  destinations: TBlastRadiusDestination[];
  consumers: TBlastRadiusConsumer[];
  ghostReaders: TBlastRadiusConsumer[];
  window: {
    requestedDays: number;
    effectiveDays: number;
    boundByRetention: boolean;
    consumptionAvailable: boolean;
  };
  truncated: {
    principals: {
      drawn: number;
      total: number;
      notDrawnWithReads: number;
      notDrawnWithoutReads: number;
    };
    destinations: { drawn: number; total: number };
    consumers: { drawn: number; total: number };
  };
};

export type TRotationSimulationItem = {
  code: string;
  message: string;
};

export type TRotationSimulation = {
  secret: { key: string; environment: string; secretPath: string };
  verdict: RotationVerdict;
  headline: string;
  subheadline: string;
  reasonsToRotate: TRotationSimulationItem[];
  impacts: TRotationSimulationItem[];
  worthKnowing: TRotationSimulationItem[];
  willUpdateAutomatically: TRotationSimulationItem[];
  consumptionAvailable: boolean;
};

export type TGetSecretBlastRadiusDTO = {
  secretName: string;
  environment: string;
  secretPath: string;
  window: BlastRadiusWindow;
  include: BlastRadiusLeg[];
  principalLimit: number;
  principalOffset: number;
  principalOrder: PrincipalOrder;
  // Filters are applied to the whole set before the page is cut, so paging through a filtered graph
  // walks the filtered set rather than the raw one.
  principalAccess: PrincipalAccessFilter;
  principalUsage: PrincipalUsageFilter;
} & TProjectPermission;

export type TExposureRankingEntry = {
  secretId: string;
  secretKey: string;
  environment: string;
  environmentName: string;
  secretPath: string;
  score: number | null;
  band: ExposureBand;
  topDriver: string | null;
  entitledCount: number;
  noReadsCount: number;
  destinationCount: number;
  ghostReaderCount: number;
  valueAgeDays: number;
};

export type TGetExposureRankingDTO = {
  limit: number;
  environment?: string;
  window: BlastRadiusWindow;
} & TProjectPermission;

export type TSimulateSecretRotationDTO = {
  secretName: string;
  environment: string;
  secretPath: string;
  window: BlastRadiusWindow;
} & TProjectPermission;
