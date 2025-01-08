import { Job } from "bullmq";

import { TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import { QueueJobs } from "@app/queue";
import { TSecretSyncDALFactory } from "@app/services/secret-sync/secret-sync-dal";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import {
  TAwsParameterStoreSync,
  TAwsParameterStoreSyncInput,
  TAwsParameterStoreSyncListItem,
  TAwsParameterStoreSyncWithConnection
} from "./aws-parameter-store";

export type TSecretSync = TAwsParameterStoreSync;

export type TSecretSyncWithConnection = TAwsParameterStoreSyncWithConnection;

export type TSecretSyncInput = TAwsParameterStoreSyncInput;

export type TSecretSyncListItem = TAwsParameterStoreSyncListItem;

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

export type TCreateSecretSyncDTO = Pick<
  TSecretSync,
  "syncOptions" | "destinationConfig" | "secretPath" | "envId" | "name" | "connectionId"
> & { destination: SecretSync };

export type TUpdateSecretSyncDTO = Partial<Omit<TCreateSecretSyncDTO, "connectionId">> & {
  syncId: string;
  destination: SecretSync;
};

export type TDeleteSecretSyncDTO = {
  destination: SecretSync;
  syncId: string;
};

type AuditLogInfo = Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;

export enum SecretSyncStatus {
  Pending = "pending",
  Success = "success",
  Failed = "failed"
}

export enum SecretSyncAction {
  Sync = "sync",
  Import = "import",
  Erase = "erase"
}

type TSecretSyncRaw = NonNullable<Awaited<ReturnType<TSecretSyncDALFactory["findById"]>>>;

export type TQueueSecretSyncsByPathDTO = {
  secretPath: string;
  environmentSlug: string;
  projectId: string;
};

export type TQueueSecretSyncByIdDTO = {
  syncId: string;
  auditLogInfo?: AuditLogInfo;
};

export type TTriggerSecretSyncByIdDTO = {
  destination: SecretSync;
} & TQueueSecretSyncByIdDTO;

export type TQueueSecretSyncImportByIdDTO = {
  syncId: string;
  shouldOverwrite: boolean;
  auditLogInfo?: AuditLogInfo;
};

export type TTriggerSecretSyncImportByIdDTO = {
  destination: SecretSync;
} & TQueueSecretSyncImportByIdDTO;

export type TQueueSecretSyncEraseByIdDTO = {
  syncId: string;
  auditLogInfo?: AuditLogInfo;
};

export type TTriggerSecretSyncEraseByIdDTO = {
  destination: SecretSync;
} & TQueueSecretSyncEraseByIdDTO;

export type TQueueSendSecretSyncActionFailedNotificationsDTO = {
  secretSync: TSecretSyncRaw;
  auditLogInfo?: AuditLogInfo;
  action: SecretSyncAction;
};

export type TSecretSyncDTO = Job<TQueueSecretSyncByIdDTO, void, QueueJobs.AppConnectionSecretSync>;
export type TSecretSyncImportDTO = Job<TQueueSecretSyncImportByIdDTO, void, QueueJobs.AppConnectionSecretSync>;
export type TSecretSyncEraseDTO = Job<TQueueSecretSyncEraseByIdDTO, void, QueueJobs.AppConnectionSecretSync>;

export type TSendSecretSyncFailedNotificationsJobDTO = Job<
  TQueueSendSecretSyncActionFailedNotificationsDTO,
  void,
  QueueJobs.AppConnectionSendSecretSyncActionFailedNotifications
>;

export type TSecretMap = Record<
  string,
  { value: string; comment?: string; skipMultilineEncoding?: boolean | null | undefined }
>;

export type TSecretSyncGetSecrets = {
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  includeImports?: boolean;
};
