import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  TGitLabDataSource,
  TGitLabDataSourceOption
} from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";
import { DiscriminativePick } from "@app/types";

import {
  SecretScanningDataSource,
  SecretScanningFindingConfidence,
  SecretScanningFindingOrderBy,
  SecretScanningFindingSeverity,
  SecretScanningFindingStatus,
  SecretScanningResourceOrderBy,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "../enums";
import { TBitbucketDataSource, TBitbucketDataSourceOption } from "./bitbucket-data-source";
import { TGitHubDataSource, TGitHubDataSourceOption } from "./github-data-source";

export type TSecretScanningDataSource =
  | TGitHubDataSource
  | TBitbucketDataSource
  | TGitLabDataSource;

export type TSecretScanningDataSourceWithDetails = TSecretScanningDataSource & {
  lastScannedAt: string | null;
  lastScanStatus: SecretScanningScanStatus | null;
  lastScanStatusMessage: string | null;
  unresolvedFindings: number | null;
  resourceCount: number;
};

export type TListSecretScanningDataSources = {
  dataSources: TSecretScanningDataSourceWithDetails[];
};

export type TListSecretScanningBasicDataSources = {
  dataSources: TSecretScanningDataSource[];
};

export type TSecretScanningDataSourceOption =
  | TGitHubDataSourceOption
  | TBitbucketDataSourceOption
  | TGitLabDataSourceOption;

export type TListSecretScanningDataSourceOptions = {
  dataSourceOptions: TSecretScanningDataSourceOption[];
};

export type TSecretScanningDataSourceResponse = { dataSource: TSecretScanningDataSource };

export type TCreateSecretScanningDataSourceDTO = DiscriminativePick<
  TSecretScanningDataSource,
  | "name"
  | "config"
  | "description"
  | "connectionId"
  | "type"
  | "isHistoricalScanEnabled"
  | "isScanNewCommitsEnabled"
  | "isDiscoveryEnabled"
  | "projectId"
>;

export type TUpdateSecretScanningDataSourceDTO = Partial<
  Omit<TCreateSecretScanningDataSourceDTO, "type" | "connectionId" | "projectId">
> & {
  type: SecretScanningDataSource;
  dataSourceId: string;
  // required for query invalidation
  projectId: string;
};

export type TDeleteSecretScanningDataSourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  // required for query invalidation
  projectId: string;
};

export type TTriggerSecretScanningDataSourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  resourceId?: string;
  // required for query invalidation
  projectId: string;
};

export type TAddSecretScanningResourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  resourceName: string;
  // required for query invalidation
  projectId: string;
};

export type TAddAllSecretScanningResourcesDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  // required for query invalidation
  projectId: string;
};

export type TRemoveSecretScanningResourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  resourceId: string;
  // required for query invalidation
  projectId: string;
};

export type TUpdateSecretScanningFinding = {
  findingId: string;
  status: SecretScanningFindingStatus;
  triageComment?: string | null;
  // required for query invalidation
  projectId: string;
};

export type TSecretScanningFindingResponse = {
  finding: TSecretScanningFinding;
};

export type TGetSecretScanningDataSource = {
  dataSourceId: string;
  type: SecretScanningDataSource;
};

export type TSecretScanningResourceWithDetails = {
  id: string;
  dataSourceId: string;
  externalId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastScannedAt: string;
  lastScanStatus: SecretScanningScanStatus;
  lastScanStatusMessage: string | null;
  unresolvedFindings: number;
};

export type TListSecretScanningResourcesResponse = {
  resources: TSecretScanningResourceWithDetails[];
  totalCount: number;
};

export type TListSecretScanningResourcesDTO = TGetSecretScanningDataSource & {
  search?: string;
  orderBy: SecretScanningResourceOrderBy;
  orderDirection: OrderByDirection;
  offset: number;
  limit: number;
};

export type TSecretScanningResource = Pick<
  TSecretScanningResourceWithDetails,
  "id" | "dataSourceId" | "externalId" | "name" | "createdAt" | "updatedAt"
>;

export type TListSecretScanningBasicResourcesResponse = {
  resources: TSecretScanningResource[];
};

export type TSecretScanningAvailableResource = {
  externalId: string;
  name: string;
  isIncluded: boolean;
};

export type TListSecretScanningAvailableResourcesResponse = {
  resources: TSecretScanningAvailableResource[];
};

export type TSecretScanningScanWithDetails = {
  id: string;
  createdAt: string;
  resourceId: string;
  type: SecretScanningScanType;
  triggeredByUserId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  status: SecretScanningScanStatus;
  statusMessage?: string | null;
  unresolvedFindings: number;
  resolvedFindings: number;
  resourceName: string;
};

export type TListSecretScanningScansResponse = {
  scans: TSecretScanningScanWithDetails[];
};

export type TGetSecretScanningUnresolvedFindingsResponse = {
  unresolvedFindings: number;
};

export type TSecretScanningConfig = {
  projectId: string;
  content: string | null;
};

export type TGetSecretScanningConfigResponse = {
  config: TSecretScanningConfig;
};

export type TSecretScanningFinding = {
  id: string;
  resourceId: string;
  resourceName: string;
  dataSourceId: string;
  dataSourceName: string;
  dataSourceType: SecretScanningDataSource;
  rule: string;
  severity: SecretScanningFindingSeverity;
  confidence?: SecretScanningFindingConfidence | null;
  status: SecretScanningFindingStatus;
  triageComment?: string | null;
  triagedByUserId?: string | null;
  triagedAt?: string | null;
  resolvedAt?: string | null;
  fingerprint: string;
  // TODO scott: this will need to be type differentiated once we add other scan types
  details: {
    description: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    file: string;
    link: string;
    symlinkFile: string;
    commit: string;
    entropy: string;
    author: string;
    email: string;
    date: string;
    message: string;
    tags: string[];
    ruleID: string;
    fingerprint: string;
  };
  projectId: string;
  scanId: string;
  createdAt: string;
  updatedAt: string;
};

export type TListSecretScanningFindingsDTO = {
  projectId: string;
  status?: SecretScanningFindingStatus;
  dataSourceId?: string;
  resourceId?: string;
  orderBy: SecretScanningFindingOrderBy;
  orderDirection: OrderByDirection;
  offset: number;
  limit: number;
};

export type TListSecretScanningFindingsResponse = {
  findings: TSecretScanningFinding[];
  totalCount: number;
};
