import {
  TSecretScanningDataSources,
  TSecretScanningFindingsInsert,
  TSecretScanningResources,
  TSecretScanningScans
} from "@app/db/schemas";
import {
  TGitHubDataSource,
  TGitHubDataSourceInput,
  TGitHubDataSourceListItem,
  TGitHubDataSourceWithConnection,
  TGitHubFinding,
  TQueueGitHubResourceDiffScan
} from "@app/ee/services/secret-scanning-v2/github";
import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  SecretScanningScanStatus
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

export type TSecretScanningDataSource = TGitHubDataSource;

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

export type TSecretScanningDataSourceWithConnection = TGitHubDataSourceWithConnection;

export type TSecretScanningDataSourceInput = TGitHubDataSourceInput;

export type TSecretScanningDataSourceListItem = TGitHubDataSourceListItem;

export type TSecretScanningFinding = TGitHubFinding;

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

export type TQueueSecretScanningResourceDiffScan = TQueueGitHubResourceDiffScan;

export type TQueueSecretScanningSendNotification = {
  dataSource: TSecretScanningDataSources;
  resourceName: string;
} & (
  | { status: SecretScanningScanStatus.Failed; errorMessage: string }
  | { status: SecretScanningScanStatus.Completed; numberOfSecrets: number; scanId: string; isDiffScan: boolean }
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
  T extends TSecretScanningDataSourceWithConnection["connection"] | undefined = undefined,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (
  params: {
    payload: TCreateSecretScanningDataSourceDTO;
    connection: T;
    secretScanningV2DAL: TSecretScanningV2DALFactory;
  },
  callback: (parameters: { credentials?: C; externalId?: string }) => Promise<TSecretScanningDataSourceRaw>
) => Promise<TSecretScanningDataSourceRaw>;

export type TSecretScanningFactoryPostInitialization<
  T extends TSecretScanningDataSourceWithConnection["connection"] | undefined = undefined,
  C extends TSecretScanningDataSourceCredentials = undefined
> = (params: {
  payload: TCreateSecretScanningDataSourceDTO;
  connection: T;
  credentials: C;
  dataSourceId: string;
}) => Promise<void>;

export type TSecretScanningFactory<
  T extends TSecretScanningDataSourceWithConnection,
  C extends TSecretScanningDataSourceCredentials,
  P extends TQueueSecretScanningResourceDiffScan["payload"]
> = () => {
  listRawResources: TSecretScanningFactoryListRawResources<T>;
  getFullScanPath: TSecretScanningFactoryGetFullScanPath<T>;
  initialize: TSecretScanningFactoryInitialize<T["connection"] | undefined, C>;
  postInitialization: TSecretScanningFactoryPostInitialization<T["connection"] | undefined, C>;
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

export type TSecretScanningDataSourceCredentials = undefined;
