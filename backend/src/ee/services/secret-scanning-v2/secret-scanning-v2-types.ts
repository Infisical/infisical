import { TSecretScanningFindingsInsert, TSecretScanningResources } from "@app/db/schemas";
import {
  TGitHubDataSource,
  TGitHubDataSourceInput,
  TGitHubDataSourceListItem,
  TGitHubDataSourceWithConnection
} from "@app/ee/services/secret-scanning-v2/github";
import {
  TGitLabDataSource,
  TGitLabDataSourceInput,
  TGitLabDataSourceListItem,
  TGitLabDataSourceWithConnection
} from "@app/ee/services/secret-scanning-v2/gitlab";
import {
  SecretScanningDataSource,
  SecretScanningScanStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export type TSecretScanningDataSource = TGitHubDataSource | TGitLabDataSource;

export type TSecretScanningDataSourceWithDetails = TSecretScanningDataSource & {
  lastScannedAt?: Date | null;
  lastScanStatus?: SecretScanningScanStatus | null;
  lastScanStatusMessage?: string | null;
  unresolvedFindings: number;
};

export type TSecretScanningDataSourceWithConnection = TGitHubDataSourceWithConnection | TGitLabDataSourceWithConnection;

export type TSecretScanningDataSourceInput = TGitHubDataSourceInput | TGitLabDataSourceInput;

export type TSecretScanningDataSourceListItem = TGitHubDataSourceListItem | TGitLabDataSourceListItem;

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
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};

export type TCloneRepository = {
  cloneUrl: string;
  repoPath: string;
};

export type TSecretScanningFactoryListRawResources<T extends TSecretScanningDataSourceWithConnection> = (
  dataSource: T
) => Promise<Pick<TSecretScanningResources, "externalId" | "name" | "type">[]>;

export type TSecretScanningFactoryGetScanPath<T extends TSecretScanningDataSourceWithConnection> = (parameters: {
  dataSource: T;
  resourceName: string;
  tempFolder: string;
}) => Promise<string>;

export type TSecretScanningFactory<T extends TSecretScanningDataSourceWithConnection> = () => {
  listRawResources: TSecretScanningFactoryListRawResources<T>;
  getScanPath: TSecretScanningFactoryGetScanPath<T>;
};

export type TFindingsPayload = Pick<TSecretScanningFindingsInsert, "details" | "fingerprint" | "severity" | "rule">[];
export type TGetFindingsPayload = Promise<TFindingsPayload>;
