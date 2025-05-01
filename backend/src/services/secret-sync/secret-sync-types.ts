import { Job } from "bullmq";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { QueueJobs } from "@app/queue";
import { ResourceMetadataDTO } from "@app/services/resource-metadata/resource-metadata-schema";
import {
  TAwsSecretsManagerSync,
  TAwsSecretsManagerSyncInput,
  TAwsSecretsManagerSyncListItem,
  TAwsSecretsManagerSyncWithCredentials
} from "@app/services/secret-sync/aws-secrets-manager";
import {
  TCamundaSync,
  TCamundaSyncInput,
  TCamundaSyncListItem,
  TCamundaSyncWithCredentials
} from "@app/services/secret-sync/camunda";
import {
  TDatabricksSync,
  TDatabricksSyncInput,
  TDatabricksSyncListItem,
  TDatabricksSyncWithCredentials
} from "@app/services/secret-sync/databricks";
import {
  TGitHubSync,
  TGitHubSyncInput,
  TGitHubSyncListItem,
  TGitHubSyncWithCredentials
} from "@app/services/secret-sync/github";
import { TSecretSyncDALFactory } from "@app/services/secret-sync/secret-sync-dal";
import { SecretSync, SecretSyncImportBehavior } from "@app/services/secret-sync/secret-sync-enums";
import {
  TWindmillSync,
  TWindmillSyncInput,
  TWindmillSyncListItem,
  TWindmillSyncWithCredentials
} from "@app/services/secret-sync/windmill";

import {
  TAwsParameterStoreSync,
  TAwsParameterStoreSyncInput,
  TAwsParameterStoreSyncListItem,
  TAwsParameterStoreSyncWithCredentials
} from "./aws-parameter-store";
import {
  TAzureAppConfigurationSync,
  TAzureAppConfigurationSyncInput,
  TAzureAppConfigurationSyncListItem,
  TAzureAppConfigurationSyncWithCredentials
} from "./azure-app-configuration";
import {
  TAzureKeyVaultSync,
  TAzureKeyVaultSyncInput,
  TAzureKeyVaultSyncListItem,
  TAzureKeyVaultSyncWithCredentials
} from "./azure-key-vault";
import { TGcpSync, TGcpSyncInput, TGcpSyncListItem, TGcpSyncWithCredentials } from "./gcp";
import {
  THCVaultSync,
  THCVaultSyncInput,
  THCVaultSyncListItem,
  THCVaultSyncWithCredentials
} from "./hc-vault/hc-vault-sync-types";
import {
  THumanitecSync,
  THumanitecSyncInput,
  THumanitecSyncListItem,
  THumanitecSyncWithCredentials
} from "./humanitec";
import {
  TTeamCitySync,
  TTeamCitySyncInput,
  TTeamCitySyncListItem,
  TTeamCitySyncWithCredentials
} from "./teamcity/teamcity-sync-types";
import {
  TTerraformCloudSync,
  TTerraformCloudSyncInput,
  TTerraformCloudSyncListItem,
  TTerraformCloudSyncWithCredentials
} from "./terraform-cloud";
import { TVercelSync, TVercelSyncInput, TVercelSyncListItem, TVercelSyncWithCredentials } from "./vercel";

export type TSecretSync =
  | TAwsParameterStoreSync
  | TAwsSecretsManagerSync
  | TGitHubSync
  | TGcpSync
  | TAzureKeyVaultSync
  | TAzureAppConfigurationSync
  | TDatabricksSync
  | THumanitecSync
  | TTerraformCloudSync
  | TCamundaSync
  | TVercelSync
  | TWindmillSync
  | THCVaultSync
  | TTeamCitySync;

export type TSecretSyncWithCredentials =
  | TAwsParameterStoreSyncWithCredentials
  | TAwsSecretsManagerSyncWithCredentials
  | TGitHubSyncWithCredentials
  | TGcpSyncWithCredentials
  | TAzureKeyVaultSyncWithCredentials
  | TAzureAppConfigurationSyncWithCredentials
  | TDatabricksSyncWithCredentials
  | THumanitecSyncWithCredentials
  | TTerraformCloudSyncWithCredentials
  | TCamundaSyncWithCredentials
  | TVercelSyncWithCredentials
  | TWindmillSyncWithCredentials
  | THCVaultSyncWithCredentials
  | TTeamCitySyncWithCredentials;

export type TSecretSyncInput =
  | TAwsParameterStoreSyncInput
  | TAwsSecretsManagerSyncInput
  | TGitHubSyncInput
  | TGcpSyncInput
  | TAzureKeyVaultSyncInput
  | TAzureAppConfigurationSyncInput
  | TDatabricksSyncInput
  | THumanitecSyncInput
  | TTerraformCloudSyncInput
  | TCamundaSyncInput
  | TVercelSyncInput
  | TWindmillSyncInput
  | THCVaultSyncInput
  | TTeamCitySyncInput;

export type TSecretSyncListItem =
  | TAwsParameterStoreSyncListItem
  | TAwsSecretsManagerSyncListItem
  | TGitHubSyncListItem
  | TGcpSyncListItem
  | TAzureKeyVaultSyncListItem
  | TAzureAppConfigurationSyncListItem
  | TDatabricksSyncListItem
  | THumanitecSyncListItem
  | TTerraformCloudSyncListItem
  | TCamundaSyncListItem
  | TVercelSyncListItem
  | TWindmillSyncListItem
  | THCVaultSyncListItem
  | TTeamCitySyncListItem;

export type TSyncOptionsConfig = {
  canImportSecrets: boolean;
};

export type TListSecretSyncsByProjectId = {
  projectId: string;
  destination?: SecretSync;
};

export type TListSecretSyncsByFolderId = {
  projectId: string;
  secretPath: string;
  environment: string;
  destination?: SecretSync;
};

export type TFindSecretSyncByIdDTO = {
  syncId: string;
  destination: SecretSync;
};

export type TFindSecretSyncByNameDTO = {
  syncName: string;
  projectId: string;
  destination: SecretSync;
};

export type TCreateSecretSyncDTO = Pick<TSecretSync, "syncOptions" | "destinationConfig" | "name" | "connectionId"> & {
  destination: SecretSync;
  projectId: string;
  secretPath: string;
  environment: string;
  isAutoSyncEnabled?: boolean;
};

export type TUpdateSecretSyncDTO = Partial<Omit<TCreateSecretSyncDTO, "projectId">> & {
  syncId: string;
  destination: SecretSync;
};

export type TDeleteSecretSyncDTO = {
  destination: SecretSync;
  syncId: string;
  removeSecrets: boolean;
};

export enum SecretSyncStatus {
  Pending = "pending",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed"
}

export enum SecretSyncAction {
  SyncSecrets = "sync-secrets",
  ImportSecrets = "import-secrets",
  RemoveSecrets = "remove-secrets"
}

export type TSecretSyncRaw = NonNullable<Awaited<ReturnType<TSecretSyncDALFactory["findById"]>>>;

export type TQueueSecretSyncsByPathDTO = {
  secretPath: string;
  environmentSlug: string;
  projectId: string;
};

export type TQueueSecretSyncSyncSecretsByIdDTO = {
  syncId: string;
  failedToAcquireLockCount?: number;
  auditLogInfo?: AuditLogInfo;
};

export type TTriggerSecretSyncSyncSecretsByIdDTO = {
  destination: SecretSync;
} & TQueueSecretSyncSyncSecretsByIdDTO;

export type TQueueSecretSyncImportSecretsByIdDTO = {
  syncId: string;
  importBehavior: SecretSyncImportBehavior;
  auditLogInfo?: AuditLogInfo;
};

export type TTriggerSecretSyncImportSecretsByIdDTO = {
  destination: SecretSync;
} & TQueueSecretSyncImportSecretsByIdDTO;

export type TQueueSecretSyncRemoveSecretsByIdDTO = {
  syncId: string;
  auditLogInfo?: AuditLogInfo;
  deleteSyncOnComplete?: boolean;
};

export type TTriggerSecretSyncRemoveSecretsByIdDTO = {
  destination: SecretSync;
} & TQueueSecretSyncRemoveSecretsByIdDTO;

export type TQueueSendSecretSyncActionFailedNotificationsDTO = {
  secretSync: TSecretSyncRaw;
  auditLogInfo?: AuditLogInfo;
  action: SecretSyncAction;
};

export type TSecretSyncSyncSecretsDTO = Job<TQueueSecretSyncSyncSecretsByIdDTO, void, QueueJobs.SecretSyncSyncSecrets>;
export type TSecretSyncImportSecretsDTO = Job<
  TQueueSecretSyncImportSecretsByIdDTO,
  void,
  QueueJobs.SecretSyncSyncSecrets
>;
export type TSecretSyncRemoveSecretsDTO = Job<
  TQueueSecretSyncRemoveSecretsByIdDTO,
  void,
  QueueJobs.SecretSyncSyncSecrets
>;

export type TSendSecretSyncFailedNotificationsJobDTO = Job<
  TQueueSendSecretSyncActionFailedNotificationsDTO,
  void,
  QueueJobs.SecretSyncSendActionFailedNotifications
>;

export type TSecretMap = Record<
  string,
  {
    value: string;
    comment?: string;
    skipMultilineEncoding?: boolean | null | undefined;
    secretMetadata?: ResourceMetadataDTO;
  }
>;
