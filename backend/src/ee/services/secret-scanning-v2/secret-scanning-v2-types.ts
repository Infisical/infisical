import {
  TSecretScanningDataSources,
  TSecretScanningFindingsInsert,
  TSecretScanningResources,
  TSecretScanningScans
} from "@app/db/schemas";
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
  resourceCount: number;
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
  isHistoricalScanEnabled?: boolean;
  isScanNewCommitsEnabled?: boolean;
  isDiscoveryEnabled?: boolean;
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

export type TAddSecretScanningResourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  resourceName: string;
};

export type TAddAllSecretScanningResourcesDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
};

export type TRemoveSecretScanningResourceDTO = {
  type: SecretScanningDataSource;
  dataSourceId: string;
  resourceId: string;
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

export type TQueueSecretScanningResourceDiffScanPayload = {
  payload: TQueueSecretScanningResourceDiffScan["payload"];
  dataSourceType: SecretScanningDataSource;
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};

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
) => Promise<Pick<TSecretScanningResources, "externalId" | "name">[]>;

export type TSecretScanningFactoryGetDiffScanResourcePayload<
  P extends TQueueSecretScanningResourceDiffScan["payload"]
> = (payload: P) => Pick<TSecretScanningResources, "externalId" | "name">;

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
> = (params: { payload: P; connection: T; credentials?: C; dataSourceId: string }) => Promise<void>;

export type TSecretScanningFactoryTeardown<
  T extends TSecretScanningDataSourceWithConnection,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (params: { dataSource: T; credentials?: C }) => Promise<void>;

// Creates the push webhook for an existing data source; returns undefined when the provider or config has none.
export type TSecretScanningFactorySetupWebhook<
  T extends TSecretScanningDataSourceWithConnection,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (params: { dataSource: T; resourceNames: string[] }) => Promise<C | undefined>;

// Brings existing webhooks in line with the resources a data source covers, for providers that hook each resource.
// Hooks it adds exist before the change is saved, so revert removes them if the save fails; hooks it drops are
// only removed by finalize, after the save.
export type TSecretScanningFactoryUpdateWebhook<
  T extends TSecretScanningDataSourceWithConnection,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (params: { dataSource: T; resourceNames: string[]; credentials: C }) => Promise<
  | {
      credentials: C;
      finalize: () => Promise<void>;
      revert: () => Promise<void>;
    }
  | undefined
>;

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
  setupWebhook: TSecretScanningFactorySetupWebhook<T, C>;
  updateWebhook?: TSecretScanningFactoryUpdateWebhook<T, C>;
  validateConfigUpdate: TSecretScanningFactoryValidateConfigUpdate<I["config"], T>;
  getDiffScanResourcePayload: TSecretScanningFactoryGetDiffScanResourcePayload<P>;
  getDiffScanFindingsPayload: TSecretScanningFactoryGetDiffScanFindingsPayload<T, P>;
};

export type TFindingsPayload = Pick<TSecretScanningFindingsInsert, "details" | "fingerprint" | "severity" | "rule">[];
export type TGetFindingsPayload = Promise<TFindingsPayload>;

export type TUpdateSecretScanningFindingDTO = {
  status?: SecretScanningFindingStatus;
  triageComment?: string | null;
  findingId: string;
};

export type TUpsertSecretScanningConfigDTO = {
  projectId: string;
  content: string | null;
};
