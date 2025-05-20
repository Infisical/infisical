import { TSecretScanningResources } from "@app/db/schemas";
import {
  TGitHubSecretScanningDataSource,
  TGitHubSecretScanningDataSourceInput,
  TGitHubSecretScanningDataSourceListItem,
  TGitHubSecretScanningDataSourceWithConnection
} from "@app/ee/services/secret-scanning-v2/github";
import {
  TGitLabDataSource,
  TGitLabDataSourceInput,
  TGitLabDataSourceListItem,
  TGitLabDataSourceWithConnection
} from "@app/ee/services/secret-scanning-v2/gitlab";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export type TSecretScanningDataSource = TGitHubSecretScanningDataSource | TGitLabDataSource;

export type TSecretScanningDataSourceWithConnection =
  | TGitHubSecretScanningDataSourceWithConnection
  | TGitLabDataSourceWithConnection;

export type TSecretScanningDataSourceInput = TGitHubSecretScanningDataSourceInput | TGitLabDataSourceInput;

export type TSecretScanningDataSourceListItem = TGitHubSecretScanningDataSourceListItem | TGitLabDataSourceListItem;

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
  "description" | "name" | "projectId"
> & {
  connectionId?: string;
  type: SecretScanningDataSource;
  isAutoScanEnabled?: boolean;
  config: Partial<TSecretScanningDataSourceInput["config"]>;
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

export type TTriggerSecretScanningDataSourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  resourceId?: string;
};

export type TQueueSecretScanningDataSourceFullScan = {
  resourceId: string;
};

export type TSecretScanningFactory<T extends TSecretScanningDataSourceWithConnection> = {
  listResources: (dataSource: T) => Pick<TSecretScanningResources, "externalId" | "name" | "type">[];
};
