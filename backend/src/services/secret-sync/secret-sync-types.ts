import { Job } from "bullmq";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import {
  TChefSync,
  TChefSyncInput,
  TChefSyncListItem,
  TChefSyncWithCredentials
} from "@app/ee/services/secret-sync/chef";
import {
  TOCIVaultSync,
  TOCIVaultSyncInput,
  TOCIVaultSyncListItem,
  TOCIVaultSyncWithCredentials
} from "@app/ee/services/secret-sync/oci-vault";
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
  TOnePassSync,
  TOnePassSyncInput,
  TOnePassSyncListItem,
  TOnePassSyncWithCredentials
} from "./1password/1password-sync-types";
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
  TAzureDevOpsSync,
  TAzureDevOpsSyncInput,
  TAzureDevOpsSyncListItem,
  TAzureDevOpsSyncWithCredentials
} from "./azure-devops";
import {
  TAzureKeyVaultSync,
  TAzureKeyVaultSyncInput,
  TAzureKeyVaultSyncListItem,
  TAzureKeyVaultSyncWithCredentials
} from "./azure-key-vault";
import {
  TBitbucketSync,
  TBitbucketSyncInput,
  TBitbucketSyncListItem,
  TBitbucketSyncWithCredentials
} from "./bitbucket/bitbucket-sync-types";
import {
  TCircleCISync,
  TCircleCISyncInput,
  TCircleCISyncListItem,
  TCircleCISyncWithCredentials
} from "./circleci";
import {
  TChecklySync,
  TChecklySyncInput,
  TChecklySyncListItem,
  TChecklySyncWithCredentials
} from "./checkly/checkly-sync-types";
import {
  TCloudflarePagesSync,
  TCloudflarePagesSyncInput,
  TCloudflarePagesSyncListItem,
  TCloudflarePagesSyncWithCredentials
} from "./cloudflare-pages/cloudflare-pages-types";
import {
  TCloudflareWorkersSync,
  TCloudflareWorkersSyncInput,
  TCloudflareWorkersSyncListItem,
  TCloudflareWorkersSyncWithCredentials
} from "./cloudflare-workers";
import {
  TDigitalOceanAppPlatformSyncInput,
  TDigitalOceanAppPlatformSyncListItem,
  TDigitalOceanAppPlatformSyncWithCredentials
} from "./digital-ocean-app-platform/digital-ocean-app-platform-sync-types";
import { TFlyioSync, TFlyioSyncInput, TFlyioSyncListItem, TFlyioSyncWithCredentials } from "./flyio/flyio-sync-types";
import { TGcpSync, TGcpSyncInput, TGcpSyncListItem, TGcpSyncWithCredentials } from "./gcp";
import { TGitLabSync, TGitLabSyncInput, TGitLabSyncListItem, TGitLabSyncWithCredentials } from "./gitlab";
import {
  THCVaultSync,
  THCVaultSyncInput,
  THCVaultSyncListItem,
  THCVaultSyncWithCredentials
} from "./hc-vault/hc-vault-sync-types";
import { THerokuSync, THerokuSyncInput, THerokuSyncListItem, THerokuSyncWithCredentials } from "./heroku";
import {
  THumanitecSync,
  THumanitecSyncInput,
  THumanitecSyncListItem,
  THumanitecSyncWithCredentials
} from "./humanitec";
import {
  TLaravelForgeSync,
  TLaravelForgeSyncInput,
  TLaravelForgeSyncListItem,
  TLaravelForgeSyncWithCredentials
} from "./laravel-forge";
import { TNetlifySync, TNetlifySyncInput, TNetlifySyncListItem, TNetlifySyncWithCredentials } from "./netlify";
import {
  TNorthflankSync,
  TNorthflankSyncInput,
  TNorthflankSyncListItem,
  TNorthflankSyncWithCredentials
} from "./northflank";
import {
  TOctopusDeploySync,
  TOctopusDeploySyncInput,
  TOctopusDeploySyncListItem,
  TOctopusDeploySyncWithCredentials
} from "./octopus-deploy";
import {
  TRailwaySync,
  TRailwaySyncInput,
  TRailwaySyncListItem,
  TRailwaySyncWithCredentials
} from "./railway/railway-sync-types";
import {
  TRenderSync,
  TRenderSyncInput,
  TRenderSyncListItem,
  TRenderSyncWithCredentials
} from "./render/render-sync-types";
import {
  TSupabaseSync,
  TSupabaseSyncInput,
  TSupabaseSyncListItem,
  TSupabaseSyncWithCredentials
} from "./supabase/supabase-sync-types";
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
import { TZabbixSync, TZabbixSyncInput, TZabbixSyncListItem, TZabbixSyncWithCredentials } from "./zabbix";

export type TSecretSync =
  | TAwsParameterStoreSync
  | TAwsSecretsManagerSync
  | TGitHubSync
  | TGcpSync
  | TAzureKeyVaultSync
  | TChefSync
  | TAzureAppConfigurationSync
  | TAzureDevOpsSync
  | TDatabricksSync
  | THumanitecSync
  | TTerraformCloudSync
  | TCamundaSync
  | TVercelSync
  | TLaravelForgeSync
  | TWindmillSync
  | THCVaultSync
  | TTeamCitySync
  | TOCIVaultSync
  | TOnePassSync
  | THerokuSync
  | TRenderSync
  | TFlyioSync
  | TGitLabSync
  | TCloudflarePagesSync
  | TCloudflareWorkersSync
  | TZabbixSync
  | TRailwaySync
  | TChecklySync
  | TSupabaseSync
  | TNetlifySync
  | TNorthflankSync
  | TBitbucketSync
  | TOctopusDeploySync
  | TCircleCISync;

export type TSecretSyncWithCredentials =
  | TAwsParameterStoreSyncWithCredentials
  | TAwsSecretsManagerSyncWithCredentials
  | TGitHubSyncWithCredentials
  | TGcpSyncWithCredentials
  | TAzureKeyVaultSyncWithCredentials
  | TChefSyncWithCredentials
  | TAzureAppConfigurationSyncWithCredentials
  | TAzureDevOpsSyncWithCredentials
  | TDatabricksSyncWithCredentials
  | THumanitecSyncWithCredentials
  | TTerraformCloudSyncWithCredentials
  | TCamundaSyncWithCredentials
  | TVercelSyncWithCredentials
  | TWindmillSyncWithCredentials
  | THCVaultSyncWithCredentials
  | TTeamCitySyncWithCredentials
  | TOCIVaultSyncWithCredentials
  | TOnePassSyncWithCredentials
  | THerokuSyncWithCredentials
  | TRenderSyncWithCredentials
  | TFlyioSyncWithCredentials
  | TGitLabSyncWithCredentials
  | TCloudflarePagesSyncWithCredentials
  | TCloudflareWorkersSyncWithCredentials
  | TZabbixSyncWithCredentials
  | TRailwaySyncWithCredentials
  | TChecklySyncWithCredentials
  | TSupabaseSyncWithCredentials
  | TDigitalOceanAppPlatformSyncWithCredentials
  | TNetlifySyncWithCredentials
  | TNorthflankSyncWithCredentials
  | TBitbucketSyncWithCredentials
  | TLaravelForgeSyncWithCredentials
  | TOctopusDeploySyncWithCredentials
  | TCircleCISyncWithCredentials;

export type TSecretSyncInput =
  | TAwsParameterStoreSyncInput
  | TAwsSecretsManagerSyncInput
  | TGitHubSyncInput
  | TGcpSyncInput
  | TAzureKeyVaultSyncInput
  | TChefSyncInput
  | TAzureAppConfigurationSyncInput
  | TAzureDevOpsSyncInput
  | TDatabricksSyncInput
  | THumanitecSyncInput
  | TTerraformCloudSyncInput
  | TCamundaSyncInput
  | TVercelSyncInput
  | TWindmillSyncInput
  | THCVaultSyncInput
  | TTeamCitySyncInput
  | TOCIVaultSyncInput
  | TOnePassSyncInput
  | THerokuSyncInput
  | TRenderSyncInput
  | TFlyioSyncInput
  | TGitLabSyncInput
  | TCloudflarePagesSyncInput
  | TCloudflareWorkersSyncInput
  | TZabbixSyncInput
  | TRailwaySyncInput
  | TChecklySyncInput
  | TSupabaseSyncInput
  | TDigitalOceanAppPlatformSyncInput
  | TNetlifySyncInput
  | TNorthflankSyncInput
  | TBitbucketSyncInput
  | TLaravelForgeSyncInput
  | TOctopusDeploySyncInput
  | TCircleCISyncInput;

export type TSecretSyncListItem =
  | TAwsParameterStoreSyncListItem
  | TAwsSecretsManagerSyncListItem
  | TGitHubSyncListItem
  | TGcpSyncListItem
  | TAzureKeyVaultSyncListItem
  | TChefSyncListItem
  | TAzureAppConfigurationSyncListItem
  | TAzureDevOpsSyncListItem
  | TDatabricksSyncListItem
  | THumanitecSyncListItem
  | TTerraformCloudSyncListItem
  | TCamundaSyncListItem
  | TVercelSyncListItem
  | TLaravelForgeSyncListItem
  | TWindmillSyncListItem
  | THCVaultSyncListItem
  | TTeamCitySyncListItem
  | TOCIVaultSyncListItem
  | TOnePassSyncListItem
  | THerokuSyncListItem
  | TRenderSyncListItem
  | TFlyioSyncListItem
  | TGitLabSyncListItem
  | TCloudflarePagesSyncListItem
  | TCloudflareWorkersSyncListItem
  | TZabbixSyncListItem
  | TRailwaySyncListItem
  | TChecklySyncListItem
  | TSupabaseSyncListItem
  | TDigitalOceanAppPlatformSyncListItem
  | TNetlifySyncListItem
  | TNorthflankSyncListItem
  | TBitbucketSyncListItem
  | TOctopusDeploySyncListItem
  | TCircleCISyncListItem;

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

export type TCheckDuplicateDestinationDTO = {
  destination: SecretSync;
  destinationConfig: Record<string, unknown>;
  excludeSyncId?: string;
  projectId: string;
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

export type DestinationDuplicateCheckFn = (
  existingConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>
) => boolean;
