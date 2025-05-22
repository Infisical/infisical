import { DiscriminativePick } from "@app/types";

import {
  SecretScanningDataSource,
  SecretScanningResource,
  SecretScanningScanStatus
} from "../enums";
import { TGitHubDataSource, TGitHubDataSourceOption } from "./github-data-source";
import { TGitLabDataSource, TGitLabDataSourceOption } from "./gitlab-data-source";

export type TSecretScanningDataSource = TGitLabDataSource | TGitHubDataSource;

type DashboardDetails = {
  lastScannedAt?: string | null;
  lastScanStatus?: SecretScanningScanStatus | null;
  lastScanStatusMessage?: string | null;
  unresolvedFindings: number;
};

export type TSecretScanningDataSourceWithDetails = TSecretScanningDataSource & DashboardDetails;

export type TListSecretScanningDataSources = {
  dataSources: TSecretScanningDataSourceWithDetails[];
};

export type TSecretScanningDataSourceOption = TGitLabDataSourceOption | TGitHubDataSourceOption;

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
} & DashboardDetails;

export type TListSecretScanningResourcesResponse = {
  resources: TSecretScanningResourceWithDetails[];
};
