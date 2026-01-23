import { TSecretScanningDataSources } from "@app/db/schemas/secret-scanning-data-sources";
import { TSecretScanningFindingsInsert } from "@app/db/schemas/secret-scanning-findings";
import { TSecretScanningResources } from "@app/db/schemas/secret-scanning-resources";
import { TSecretScanningScans } from "@app/db/schemas/secret-scanning-scans";
import {
  TBitbucketDataSource,
  TBitbucketDataSourceCredentials,
  TBitbucketDataSourceInput,
  TBitbucketDataSourceListItem,
  TBitbucketDataSourceWithConnection,
  TBitbucketFinding,
  TQueueBitbucketResourceDiffScan
} from "@app/ee/services/secret-scanning-v2/bitbucket";
import {
  TGitHubDataSource,
  TGitHubDataSourceInput,
  TGitHubDataSourceListItem,
  TGitHubDataSourceWithConnection,
  TGitHubFinding,
  TQueueGitHubResourceDiffScan
} from "@app/ee/services/secret-scanning-v2/github";
import {
  TGitLabDataSource,
  TGitLabDataSourceCredentials,
  TGitLabDataSourceInput,
  TGitLabDataSourceListItem,
  TGitLabDataSourceWithConnection,
  TGitLabFinding,
  TQueueGitLabResourceDiffScan
} from "@app/ee/services/secret-scanning-v2/gitlab";
import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  SecretScanningScanStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

export type TSecretScanningDataSource = TGitHubDataSource | TBitbucketDataSource | TGitLabDataSource;

export type TSecretScanningDataSourceWithDetails = TSecretScanningDataSource & {
  lastScannedAt?: Date | null;
  lastScanStatus?: SecretScanningScanStatus | null;
  lastScanStatusMessage?: string | null;
  unresolvedFindings: number;
};

export type TSecretScanningResourceWithDetails = TSecretScanningResources & {
  lastScannedAt?: Date | null;
  lastScanStatus?: SecretScanningScanStatus | null;
  lastScanStatusMessage?: string | null;
  unresolvedFindings: number;
};

export type TSecretScanningScanWithDetails = TSecretScanningScans & {
  unresolvedFindings: number;
  resolvedFindings: number;
  resourceName: string;
};

export type TSecretScanningDataSourceWithConnection =
  | TGitHubDataSourceWithConnection
  | TBitbucketDataSourceWithConnection
  | TGitLabDataSourceWithConnection;

export type TSecretScanningDataSourceInput =
  | TGitHubDataSourceInput
  | TBitbucketDataSourceInput
  | TGitLabDataSourceInput;

export type TSecretScanningDataSourceListItem =
  | TGitHubDataSourceListItem
  | TBitbucketDataSourceListItem
  | TGitLabDataSourceListItem;

export type TSecretScanningDataSourceCredentials =
  | TBitbucketDataSourceCredentials
  | TGitLabDataSourceCredentials
  | undefined;

export type TSecretScanningFinding = TGitHubFinding | TBitbucketFinding | TGitLabFinding;

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

export type TQueueSecretScanningResourceDiffScan =
  | TQueueGitHubResourceDiffScan
  | TQueueBitbucketResourceDiffScan
  | TQueueGitLabResourceDiffScan;

export type TQueueSecretScanningSendNotification = {
  dataSource: TSecretScanningDataSources;
  resourceName: string;
} & (
  | { status: SecretScanningScanStatus.Failed; errorMessage: string }
  | {
      status: SecretScanningScanStatus.Completed;
      numberOfSecrets: number;
      scanId: string;
      isDiffScan: boolean;
      authorName?: string;
      authorEmail?: string;
    }
);

export type TCloneRepository = {
  cloneUrl: string;
  repoPath: string;
};

export type TSecretScanningFactoryListRawResources<T extends TSecretScanningDataSourceWithConnection> = (
  dataSource: T
) => Promise<Pick<TSecretScanningResources, "externalId" | "name" | "type">[]>;

export type TSecretScanningFactoryGetDiffScanResourcePayload<
  P extends TQueueSecretScanningResourceDiffScan["payload"]
> = (payload: P) => Pick<TSecretScanningResources, "externalId" | "name" | "type">;

export type TSecretScanningFactoryGetFullScanPath<T extends TSecretScanningDataSourceWithConnection> = (parameters: {
  dataSource: T;
  resourceName: string;
  tempFolder: string;
}) => Promise<string>;

export type TSecretScanningFactoryGetDiffScanFindingsPayload<
  T extends TSecretScanningDataSourceWithConnection,
  P extends TQueueSecretScanningResourceDiffScan["payload"]
> = (parameters: { dataSource: T; resourceName: string; payload: P; configPath?: string }) => Promise<TFindingsPayload>;

export type TSecretScanningDataSourceRaw = NonNullable<
  Awaited<ReturnType<TSecretScanningV2DALFactory["dataSources"]["findById"]>>
>;

export type TSecretScanningFactoryInitialize<
  P extends TSecretScanningDataSourceInput,
  T extends TSecretScanningDataSourceWithConnection["connection"] | undefined = undefined,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (
  params: {
    payload: P;
    connection: T;
    secretScanningV2DAL: TSecretScanningV2DALFactory;
  },
  callback: (parameters: { credentials?: C; externalId?: string }) => Promise<TSecretScanningDataSourceRaw>
) => Promise<TSecretScanningDataSourceRaw>;

export type TSecretScanningFactoryValidateConfigUpdate<
  C extends TSecretScanningDataSourceInput["config"],
  T extends TSecretScanningDataSourceWithConnection
> = (params: { config: C; dataSource: T }) => Promise<void>;

export type TSecretScanningFactoryPostInitialization<
  P extends TSecretScanningDataSourceInput,
  T extends TSecretScanningDataSourceWithConnection["connection"] | undefined = undefined,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (params: { payload: P; connection: T; credentials: C; dataSourceId: string }) => Promise<void>;

export type TSecretScanningFactoryTeardown<
  T extends TSecretScanningDataSourceWithConnection,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (params: { dataSource: T; credentials: C }) => Promise<void>;

export type TSecretScanningFactoryParams = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSecretScanningFactory<
  T extends TSecretScanningDataSourceWithConnection,
  P extends TQueueSecretScanningResourceDiffScan["payload"],
  I extends TSecretScanningDataSourceInput,
  C extends TSecretScanningDataSourceCredentials | undefined = undefined
> = (params: TSecretScanningFactoryParams) => {
  listRawResources: TSecretScanningFactoryListRawResources<T>;
  getFullScanPath: TSecretScanningFactoryGetFullScanPath<T>;
  initialize: TSecretScanningFactoryInitialize<I, T["connection"] | undefined, C>;
  postInitialization: TSecretScanningFactoryPostInitialization<I, T["connection"] | undefined, C>;
  teardown: TSecretScanningFactoryTeardown<T, C>;
  validateConfigUpdate: TSecretScanningFactoryValidateConfigUpdate<I["config"], T>;
  getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<P>;
  getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<T, P>;
};

export type TFindingsPayload = Pick<TSecretScanningFindingsInsert, "details" | "fingerprint" | "severity" | "rule">[];
export type TGetFindingsPayload = Promise<TFindingsPayload>;

export type TUpdateSecretScanningFindingDTO = {
  status?: SecretScanningFindingStatus;
  remarks?: string | null;
  findingId: string;
};

export type TUpsertSecretScanningConfigDTO = {
  projectId: string;
  content: string | null;
};
