import { DiscriminativePick } from "@app/types";

import { SecretScanningDataSource } from "../enums";
import { TGitHubDataSource, TGitHubDataSourceOption } from "./github-data-source";
import { TGitLabDataSource, TGitLabDataSourceOption } from "./gitlab-data-source";

export type TSecretScanningDataSource = TGitLabDataSource | TGitHubDataSource;

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

export type TSecretRotationOptionMap = {
  [SecretScanningDataSource.GitHub]: TGitHubDataSourceOption;
  [SecretScanningDataSource.GitLab]: TGitLabDataSourceOption;
};
