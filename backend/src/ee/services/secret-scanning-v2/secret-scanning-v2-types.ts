import { Knex } from "knex";

import {
  TSecretScanningDataSources,
  TSecretScanningFindings,
  TSecretScanningFindingsInsert,
  TSecretScanningResources,
  TSecretScanningResourcesInsert,
  TSecretScanningScans
} from "@app/db/schemas";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
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
  TClaudeCodeDataSource,
  TClaudeCodeDataSourceInput,
  TClaudeCodeDataSourceListItem,
  TClaudeCodeDataSourceWithConnection,
  TClaudeCodeFinding,
  TQueueClaudeCodeResourceDiffScan
} from "@app/ee/services/secret-scanning-v2/claude-code";
import {
  TGitHubDataSource,
  TGitHubDataSourceInput,
  TGitHubDataSourceListItem,
  TGitHubDataSourceWithConnection,
  TGitHubRealtimeScanDetails,
  TGitHubFinding,
  TQueueGitHubDataSourceEvent,
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
  SecretScanningScanStatus,
  SecretScanningScanTrigger
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

export type TSecretScanningDataSource =
  | TGitHubDataSource
  | TBitbucketDataSource
  | TGitLabDataSource
  | TClaudeCodeDataSource;

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
  | TGitLabDataSourceWithConnection
  | TClaudeCodeDataSourceWithConnection;

export type TSecretScanningDataSourceInput =
  | TGitHubDataSourceInput
  | TBitbucketDataSourceInput
  | TGitLabDataSourceInput
  | TClaudeCodeDataSourceInput;

export type TSecretScanningDataSourceListItem =
  | TGitHubDataSourceListItem
  | TBitbucketDataSourceListItem
  | TGitLabDataSourceListItem
  | TClaudeCodeDataSourceListItem;

export type TSecretScanningDataSourceCredentials =
  | TBitbucketDataSourceCredentials
  | TGitLabDataSourceCredentials
  | undefined;

export type TSecretScanningFinding = TGitHubFinding | TBitbucketFinding | TGitLabFinding | TClaudeCodeFinding;

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
  | TQueueGitLabResourceDiffScan
  | TQueueClaudeCodeResourceDiffScan;

export type TQueueSecretScanningResourceDiffScanPayload = {
  payload: TQueueSecretScanningResourceDiffScan["payload"];
  dataSourceType: SecretScanningDataSource;
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};

// Webhook events a provider processes in the background, beyond the pushes every provider scans.
export type TQueueSecretScanningDataSourceEvent = TQueueGitHubDataSourceEvent;

export type TQueueSecretScanningSendNotification = {
  dataSource: TSecretScanningDataSources;
  resourceName: string;
} & (
  | { status: SecretScanningScanStatus.Failed; errorMessage: string }
  | ({
      status: SecretScanningScanStatus.Completed;
      numberOfSecrets: number;
      scanId: string;
      isDiffScan: boolean;
      authorName?: string;
      authorEmail?: string;
    } & TSecretScanningNotificationDetails)
);

// What a provider adds to a diff scan's notification, from the job payload.
export type TSecretScanningNotificationDetails = {
  // the secrets were found in a Claude Code prompt rather than a commit
  isPromptScan?: boolean;
  // whether the prompt was blocked, as decided when it was submitted; only set when isPromptScan is
  isPromptBlocked?: boolean;
};

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

// What a provider learned about the scanned changes beyond the findings, for the scan's report.
export type TSecretScanningRealtimeScanDetails = TGitHubRealtimeScanDetails;

export type TSecretScanningRealtimeScanFindings = {
  findings: TFindingsPayload;
  details?: TSecretScanningRealtimeScanDetails;
};

export type TSecretScanningFactoryGetDiffScanFindingsPayload<
  T extends TSecretScanningDataSourceWithConnection,
  P extends TQueueSecretScanningResourceDiffScan["payload"]
> = (parameters: {
  dataSource: T;
  resourceName: string;
  payload: P;
  configPath?: string;
}) => Promise<TSecretScanningRealtimeScanFindings>;

/**
 * Reports a scan back to where it was requested, such as a check run on a GitHub pull request. Every method is called
 * after the scan's own state is saved and must not throw, since a provider outage can't change the scan's outcome.
 */
export type TSecretScanningScanReport = {
  start: () => Promise<void>;
  // Saved on the completed scan, in the transaction that saves its findings.
  getCompletedScanMetadata: (params: TSecretScanningScanReportCompletion) => unknown;
  // `findings` are every finding the scan matched, with the status each was triaged to.
  complete: (params: TSecretScanningScanReportCompletion) => Promise<void>;
  fail: (params: { reason: string; isTimedOut?: boolean }) => Promise<void>;
  cancel: () => Promise<void>;
};

export type TSecretScanningScanReportCompletion = {
  findings: TSecretScanningFindings[];
  details?: TSecretScanningRealtimeScanDetails;
};

// Built from the job payload, so a scan whose data source was deleted can still close its report.
export type TSecretScanningFactoryGetRealtimeScanReport<P extends TQueueSecretScanningResourceDiffScan["payload"]> = (
  payload: P
) => TSecretScanningScanReport | undefined;

// Picks which of a diff scan's findings to save. Runs inside the transaction that saves them, so a provider whose
// findings depend on earlier ones (Claude Code skips secrets that were already reviewed) decides from committed state.
export type TSecretScanningFactoryFilterDiffScanFindings<T extends TSecretScanningDataSourceWithConnection> = (params: {
  dataSource: T;
  findings: TFindingsPayload;
  secretScanningV2DAL: Pick<TSecretScanningV2DALFactory, "findings">;
  tx: Knex;
}) => Promise<TFindingsPayload>;

export type TSecretScanningFactoryGetDiffScanNotificationDetails<
  P extends TQueueSecretScanningResourceDiffScan["payload"]
> = (payload: P) => TSecretScanningNotificationDetails;

// Built from the saved scan, for a scan whose worker died before it could close its report.
export type TSecretScanningFactoryGetScanReport = (params: {
  scan: Pick<TSecretScanningScans, "trigger" | "metadata">;
  dataSource: Pick<TSecretScanningDataSources, "externalId">;
  resourceName: string;
}) => TSecretScanningScanReport | undefined;

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
  C extends TSecretScanningDataSourceCredentials | undefined = undefined,
  E extends TQueueSecretScanningDataSourceEvent["event"] = TQueueSecretScanningDataSourceEvent["event"]
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
  filterDiffScanFindings?: TSecretScanningFactoryFilterDiffScanFindings<T>;
  getDiffScanNotificationDetails?: TSecretScanningFactoryGetDiffScanNotificationDetails<P>;
  getRealtimeScanReport?: TSecretScanningFactoryGetRealtimeScanReport<P>;
  getScanReport?: TSecretScanningFactoryGetScanReport;
  // Processes webhook events beyond pushes, in the worker; only providers that receive them implement it.
  processEvent?: TSecretScanningFactoryProcessEvent<E>;
};

export type TFindingsPayload = Pick<
  TSecretScanningFindingsInsert,
  "details" | "fingerprint" | "severity" | "rule" | "secretFindingBlindIndex" | "encryptedSecretValue"
>[];

export type TGetFindingsPayload = Promise<TFindingsPayload>;

export type TSecretScanningDiscoverResource = (params: {
  dataSource: Pick<TSecretScanningDataSources, "id" | "isHistoricalScanEnabled">;
  resourcePayload: Pick<TSecretScanningResourcesInsert, "externalId" | "name">;
  trigger: SecretScanningScanTrigger.Push | SecretScanningScanTrigger.PullRequest;
}) => Promise<TSecretScanningResources | undefined>;

export type TSecretScanningQueueReportedRealtimeScan = (
  params: Pick<TQueueSecretScanningResourceDiffScan, "dataSourceType" | "payload"> & {
    scanId: string;
    dataSourceId: string;
    resourceId: string;
    trigger: SecretScanningScanTrigger;
    metadata: unknown;
  }
) => Promise<void>;

export type TSecretScanningFactoryProcessEvent<E extends TQueueSecretScanningDataSourceEvent["event"]> = (params: {
  event: E;
  secretScanningV2DAL: TSecretScanningV2DALFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  discoverResource: TSecretScanningDiscoverResource;
  queueReportedRealtimeScan: TSecretScanningQueueReportedRealtimeScan;
}) => Promise<void>;

export type TUpdateSecretScanningFindingDTO = {
  status?: SecretScanningFindingStatus;
  triageComment?: string | null;
  findingId: string;
};

export type TUpsertSecretScanningConfigDTO = {
  projectId: string;
  content: string | null;
};
