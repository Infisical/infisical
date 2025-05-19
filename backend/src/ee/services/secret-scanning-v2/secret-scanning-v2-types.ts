import {
  TGitHubSecretScanningDataSource,
  TGitHubSecretScanningDataSourceInput,
  TGitHubSecretScanningDataSourceListItem,
  TGitHubSecretScanningDataSourceWithConnection
} from "@app/ee/services/secret-scanning-v2/github";
import {
  TGitLabSecretScanningDataSource,
  TGitLabSecretScanningDataSourceInput,
  TGitLabSecretScanningDataSourceListItem,
  TGitLabSecretScanningDataSourceWithConnection
} from "@app/ee/services/secret-scanning-v2/gitlab";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export type TSecretScanningDataSource = TGitHubSecretScanningDataSource | TGitLabSecretScanningDataSource;

export type TSecretScanningDataSourceWithConnection =
  | TGitHubSecretScanningDataSourceWithConnection
  | TGitLabSecretScanningDataSourceWithConnection;

export type TSecretScanningDataSourceInput =
  | TGitHubSecretScanningDataSourceInput
  | TGitLabSecretScanningDataSourceInput;

export type TSecretScanningDataSourceListItem =
  | TGitHubSecretScanningDataSourceListItem
  | TGitLabSecretScanningDataSourceListItem;

// export type TSecretRotationV2Raw = NonNullable<Awaited<ReturnType<TSecretRotationV2DALFactory["findById"]>>>;

export type TListSecretScanningDataSourcesByProjectId = {
  projectId: string;
  type?: SecretScanningDataSource;
};

export type TFindSecretScanningDataSourceByIdDTO = {
  dataSourceId: string;
  type: SecretScanningDataSource;
};

export type TFindSecretScanningDataSourceByNameDTO = {
  sourceName: string;
  projectId: string;
  type: SecretScanningDataSource;
};

export type TCreateSecretScanningDataSourceDTO = Pick<
  TSecretScanningDataSource,
  "config" | "description" | "name" | "projectId"
> & {
  connectionId?: string;
  type: SecretScanningDataSource;
  isAutoScanEnabled?: boolean;
};

export type TUpdateSecretScanningDataSourceDTO = Partial<
  Omit<TCreateSecretScanningDataSourceDTO, "projectId" | "connectionId">
> & {
  dataSourceId: string;
  type: SecretScanningDataSource;
};

export type TDeleteSecretScanningDataSourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
};
