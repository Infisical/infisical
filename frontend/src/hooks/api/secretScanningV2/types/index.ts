import { DiscriminativePick } from "@app/types";

import {
  SecretScanningDataSource,
  SecretScanningFindingSeverity,
  SecretScanningFindingStatus,
  SecretScanningResource,
  SecretScanningScanStatus,
  SecretScanningScanType
} from "../enums";
import { TGitHubDataSource, TGitHubDataSourceOption } from "./github-data-source";

export type TSecretScanningDataSource = TGitHubDataSource;

export type TSecretScanningDataSourceWithDetails = TSecretScanningDataSource & {
  lastScannedAt: string | null;
  lastScanStatus: SecretScanningScanStatus | null;
  lastScanStatusMessage: string | null;
  unresolvedFindings: number | null;
};

export type TListSecretScanningDataSources = {
  dataSources: TSecretScanningDataSourceWithDetails[];
};

export type TSecretScanningDataSourceOption = TGitHubDataSourceOption;

export type TListSecretScanningDataSourceOptions = {
  dataSourceOptions: TSecretScanningDataSourceOption[];
};

export type TSecretScanningDataSourceResponse = { dataSource: TSecretScanningDataSource };

export type TCreateSecretScanningDataSourceDTO = DiscriminativePick<
  TSecretScanningDataSource,
  "name" | "config" | "description" | "connectionId" | "type" | "isAutoScanEnabled" | "projectId"
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

export type TUpdateSecretScanningFinding = {
  findingId: string;
  status: SecretScanningFindingStatus;
  remarks?: string | null;
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
  type: SecretScanningResource;
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
};

export type TSecretScanningScanWithDetails = {
  id: string;
  createdAt: string;
  resourceId: string;
  type: SecretScanningScanType;
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
  dataSourceName: string;
  dataSourceType: SecretScanningDataSource;
  resourceName: string;
  resourceType: SecretScanningResource;
  rule: string;
  severity: SecretScanningFindingSeverity;
  status: SecretScanningFindingStatus;
  remarks?: string;
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

export type TListSecretScanningFindingsResponse = {
  findings: TSecretScanningFinding[];
};
