import { Job } from "bullmq";

import { TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import { QueueJobs } from "@app/queue";
import {
  TGitHubSync,
  TGitHubSyncInput,
  TGitHubSyncListItem,
  TGitHubSyncWithCredentials
} from "@app/services/secret-sync/github";
import { TSecretSyncDALFactory } from "@app/services/secret-sync/secret-sync-dal";
import { SecretSync, SecretSyncImportBehavior } from "@app/services/secret-sync/secret-sync-enums";

import {
  TAwsParameterStoreSync,
  TAwsParameterStoreSyncInput,
  TAwsParameterStoreSyncListItem,
  TAwsParameterStoreSyncWithCredentials
} from "./aws-parameter-store";

export type TSecretSync = TAwsParameterStoreSync | TGitHubSync;

export type TSecretSyncWithCredentials = TAwsParameterStoreSyncWithCredentials | TGitHubSyncWithCredentials;

export type TSecretSyncInput = TAwsParameterStoreSyncInput | TGitHubSyncInput;

export type TSecretSyncListItem = TAwsParameterStoreSyncListItem | TGitHubSyncListItem;

export type TSyncOptionsConfig = {
  canImportSecrets: boolean;
};

export type TListSecretSyncsByProjectId = {
  projectId: string;
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
  isEnabled?: boolean;
};

export type TUpdateSecretSyncDTO = Partial<Omit<TCreateSecretSyncDTO, "connectionId" | "projectId">> & {
  syncId: string;
  destination: SecretSync;
};

export type TDeleteSecretSyncDTO = {
  destination: SecretSync;
  syncId: string;
  removeSecrets: boolean;
};

type AuditLogInfo = Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;

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
  { value: string; comment?: string; skipMultilineEncoding?: boolean | null | undefined }
>;
