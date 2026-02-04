import { Job, Queue, QueueOptions, RepeatOptions, Worker, WorkerListener } from "bullmq";
import PgBoss from "pg-boss";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import {
  TSecretRotationRotateSecretsJobPayload,
  TSecretRotationSendNotificationJobPayload
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import {
  TScanFullRepoEventPayload,
  TScanPushEventPayload
} from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import {
  TQueueSecretScanningDataSourceFullScan,
  TQueueSecretScanningResourceDiffScan,
  TQueueSecretScanningSendNotification
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-types";
import { getConfig } from "@app/lib/config/env";
import { buildRedisFromConfig, TRedisConfigKeys } from "@app/lib/config/redis";
import { crypto } from "@app/lib/crypto";
import { logger } from "@app/lib/logger";
import { QueueWorkerProfile } from "@app/lib/types";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { ExternalPlatforms } from "@app/services/external-migration/external-migration-types";
import { TCreateUserNotificationDTO } from "@app/services/notification/notification-types";
import {
  TQueuePkiSyncImportCertificatesByIdDTO,
  TQueuePkiSyncRemoveCertificatesByIdDTO,
  TQueuePkiSyncSyncCertificatesByIdDTO
} from "@app/services/pki-sync/pki-sync-types";
import {
  TFailedIntegrationSyncEmailsPayload,
  TIntegrationSyncPayload,
  TSyncSecretsDTO
} from "@app/services/secret/secret-types";
import {
  TQueueSecretSyncImportSecretsByIdDTO,
  TQueueSecretSyncRemoveSecretsByIdDTO,
  TQueueSecretSyncSyncSecretsByIdDTO,
  TQueueSendSecretSyncActionFailedNotificationsDTO
} from "@app/services/secret-sync/secret-sync-types";
import { CacheType } from "@app/services/super-admin/super-admin-types";
import { TWebhookPayloads } from "@app/services/webhook/webhook-types";

import { TQueueJobsDALFactory } from "./queue-jobs-dal";

export enum PersistanceQueueStatus {
  Pending = "pending",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
  Stuck = "stuck",
  Dead = "dead"
}

export enum QueueName {
  SecretRotation = "secret-rotation",
  SecretReminder = "secret-reminder",
  AuditLog = "audit-log",
  // TODO(akhilmhdh): This will get removed later. For now this is kept to stop the repeatable queue
  AuditLogPrune = "audit-log-prune",
  DailyResourceCleanUp = "daily-resource-cleanup",
  FrequentResourceCleanUp = "frequent-resource-cleanup",
  DailyExpiringPkiItemAlert = "daily-expiring-pki-item-alert",
  DailyPkiAlertV2Processing = "daily-pki-alert-v2-processing",
  PkiSyncCleanup = "pki-sync-cleanup",
  PkiSubscriber = "pki-subscriber",
  TelemetryInstanceStats = "telemtry-self-hosted-stats",
  IntegrationSync = "sync-integrations",
  SecretWebhook = "secret-webhook",
  SecretFullRepoScan = "secret-full-repo-scan",
  SecretPushEventScan = "secret-push-event-scan",
  UpgradeProjectToGhost = "upgrade-project-to-ghost",
  DynamicSecretRevocation = "dynamic-secret-revocation",
  DynamicSecretLeaseRevocationFailedEmail = "dynamic-secret-lease-revocation-failed-email",
  CaCrlRotation = "ca-crl-rotation",
  CaLifecycle = "ca-lifecycle", // parent queue to ca-order-certificate-for-subscriber
  CertificateIssuance = "certificate-issuance",
  SecretReplication = "secret-replication",
  SecretSync = "secret-sync", // parent queue to push integration sync, webhook, and secret replication
  PkiSync = "pki-sync",
  ProjectV3Migration = "project-v3-migration",
  AccessTokenStatusUpdate = "access-token-status-update",
  ImportSecretsFromExternalSource = "import-secrets-from-external-source",
  AppConnectionSecretSync = "app-connection-secret-sync",
  SecretRotationV2 = "secret-rotation-v2",
  SecretRotationV2RotateSecrets = "secret-rotation-v2-rotate-secrets",
  FolderTreeCheckpoint = "folder-tree-checkpoint",
  InvalidateCache = "invalidate-cache",
  SecretScanningV2 = "secret-scanning-v2",
  TelemetryAggregatedEvents = "telemetry-aggregated-events",
  DailyReminders = "daily-reminders",
  SecretReminderMigration = "secret-reminder-migration",
  UserNotification = "user-notification",
  HealthAlert = "health-alert",
  CertificateV3AutoRenewal = "certificate-v3-auto-renewal",
  PamAccountRotation = "pam-account-rotation",
  PamSessionExpiration = "pam-session-expiration",
  PkiAcmeChallengeValidation = "pki-acme-challenge-validation"
}

export enum QueueJobs {
  SecretReminder = "secret-reminder-job",
  SecretRotation = "secret-rotation-job",
  AuditLog = "audit-log-job",
  // TODO(akhilmhdh): This will get removed later. For now this is kept to stop the repeatable queue
  AuditLogPrune = "audit-log-prune-job",
  DailyResourceCleanUp = "daily-resource-cleanup-job",
  FrequentResourceCleanUp = "frequent-resource-cleanup-job",
  DailyExpiringPkiItemAlert = "daily-expiring-pki-item-alert",
  DailyPkiAlertV2Processing = "daily-pki-alert-v2-processing",
  PkiSyncCleanup = "pki-sync-cleanup-job",
  SecWebhook = "secret-webhook-trigger",
  TelemetryInstanceStats = "telemetry-self-hosted-stats",
  IntegrationSync = "secret-integration-pull",
  SendFailedIntegrationSyncEmails = "send-failed-integration-sync-emails",
  SecretScan = "secret-scan",
  UpgradeProjectToGhost = "upgrade-project-to-ghost-job",
  DynamicSecretRevocation = "dynamic-secret-revocation",
  DynamicSecretPruning = "dynamic-secret-pruning",
  CaCrlRotation = "ca-crl-rotation-job",
  SecretReplication = "secret-replication",
  SecretSync = "secret-sync", // parent queue to push integration sync, webhook, and secret replication
  PkiSync = "pki-sync",
  ProjectV3Migration = "project-v3-migration",
  IdentityAccessTokenStatusUpdate = "identity-access-token-status-update",
  ServiceTokenStatusUpdate = "service-token-status-update",
  ImportSecretsFromExternalSource = "import-secrets-from-external-source",
  SecretSyncSyncSecrets = "secret-sync-sync-secrets",
  SecretSyncImportSecrets = "secret-sync-import-secrets",
  SecretSyncRemoveSecrets = "secret-sync-remove-secrets",
  SecretSyncSendActionFailedNotifications = "secret-sync-send-action-failed-notifications",
  PkiSyncSyncCertificates = "pki-sync-sync-certificates",
  PkiSyncImportCertificates = "pki-sync-import-certificates",
  PkiSyncRemoveCertificates = "pki-sync-remove-certificates",
  SecretRotationV2QueueRotations = "secret-rotation-v2-queue-rotations",
  SecretRotationV2RotateSecrets = "secret-rotation-v2-rotate-secrets",
  SecretRotationV2SendNotification = "secret-rotation-v2-send-notification",
  CreateFolderTreeCheckpoint = "create-folder-tree-checkpoint",
  DynamicSecretLeaseRevocationFailedEmail = "dynamic-secret-lease-revocation-failed-email",
  InvalidateCache = "invalidate-cache",
  SecretScanningV2FullScan = "secret-scanning-v2-full-scan",
  SecretScanningV2DiffScan = "secret-scanning-v2-diff-scan",
  SecretScanningV2SendNotification = "secret-scanning-v2-notification",
  CaOrderCertificateForSubscriber = "ca-order-certificate-for-subscriber",
  CaIssueCertificateFromProfile = "ca-issue-certificate-from-profile",
  PkiSubscriberDailyAutoRenewal = "pki-subscriber-daily-auto-renewal",
  TelemetryAggregatedEvents = "telemetry-aggregated-events",
  DailyReminders = "daily-reminders",
  SecretReminderMigration = "secret-reminder-migration",
  UserNotification = "user-notification-job",
  HealthAlert = "health-alert",
  CertificateV3DailyAutoRenewal = "certificate-v3-daily-auto-renewal",
  PamAccountRotation = "pam-account-rotation",
  PamSessionExpiration = "pam-session-expiration",
  PkiAcmeChallengeValidation = "pki-acme-challenge-validation"
}

export type TQueueOptions = {
  jobId: string;
  removeOnComplete?: boolean | { count: number };
  removeOnFail?: boolean | { count: number };
  attempts?: number;
  delay?: number;
  backoff?: {
    type: "exponential" | "fixed";
    delay: number;
  };
  repeat?: {
    pattern?: string;
    key: string;
  };
};

export type TQueueJobTypes = {
  [QueueName.SecretReminder]: {
    payload: {
      projectId: string;
      secretId: string;
      repeatDays: number;
      note: string | undefined | null;
    };
    name: QueueJobs.SecretReminder;
  };
  [QueueName.SecretRotation]: {
    payload: { rotationId: string };
    name: QueueJobs.SecretRotation;
  };
  [QueueName.AuditLog]: {
    name: QueueJobs.AuditLog;
    payload: TCreateAuditLogDTO;
  };
  [QueueName.DailyResourceCleanUp]: {
    name: QueueJobs.DailyResourceCleanUp;
    payload: undefined;
  };
  [QueueName.DailyExpiringPkiItemAlert]: {
    name: QueueJobs.DailyExpiringPkiItemAlert;
    payload: undefined;
  };
  [QueueName.DailyPkiAlertV2Processing]: {
    name: QueueJobs.DailyPkiAlertV2Processing;
    payload: undefined;
  };
  [QueueName.PkiSyncCleanup]: {
    name: QueueJobs.PkiSyncCleanup;
    payload: undefined;
  };
  [QueueName.AuditLogPrune]: {
    name: QueueJobs.AuditLogPrune;
    payload: undefined;
  };
  [QueueName.SecretWebhook]: {
    name: QueueJobs.SecWebhook;
    payload: TWebhookPayloads;
  };

  [QueueName.AccessTokenStatusUpdate]:
    | {
        name: QueueJobs.IdentityAccessTokenStatusUpdate;
        payload: { identityAccessTokenId: string; numberOfUses: number };
      }
    | {
        name: QueueJobs.ServiceTokenStatusUpdate;
        payload: { serviceTokenId: string };
      };

  [QueueName.IntegrationSync]:
    | {
        name: QueueJobs.IntegrationSync;
        payload: TIntegrationSyncPayload;
      }
    | {
        name: QueueJobs.SendFailedIntegrationSyncEmails;
        payload: TFailedIntegrationSyncEmailsPayload;
      };
  [QueueName.SecretFullRepoScan]: {
    name: QueueJobs.SecretScan;
    payload: TScanFullRepoEventPayload;
  };
  [QueueName.SecretPushEventScan]: { name: QueueJobs.SecretScan; payload: TScanPushEventPayload };
  [QueueName.UpgradeProjectToGhost]: {
    name: QueueJobs.UpgradeProjectToGhost;
    payload: {
      projectId: string;
      startedByUserId: string;
      encryptedPrivateKey: {
        encryptedKey: string;
        encryptedKeyIv: string;
        encryptedKeyTag: string;
        keyEncoding: SecretKeyEncoding;
      };
    };
  };
  [QueueName.TelemetryInstanceStats]: {
    name: QueueJobs.TelemetryInstanceStats;
    payload: undefined;
  };
  [QueueName.DynamicSecretLeaseRevocationFailedEmail]: {
    name: QueueJobs.DynamicSecretLeaseRevocationFailedEmail;
    payload: {
      leaseId: string;
    };
  };
  [QueueName.DynamicSecretRevocation]:
    | {
        name: QueueJobs.DynamicSecretRevocation;
        payload: {
          isRetry?: boolean;
          leaseId: string;
          dynamicSecretId: string;
        };
      }
    | {
        name: QueueJobs.DynamicSecretPruning;
        payload: {
          dynamicSecretCfgId: string;
        };
      };
  [QueueName.CaCrlRotation]: {
    name: QueueJobs.CaCrlRotation;
    payload: {
      caId: string;
    };
  };
  [QueueName.SecretReplication]: {
    name: QueueJobs.SecretReplication;
    payload: TSyncSecretsDTO;
  };
  [QueueName.SecretSync]: {
    name: QueueJobs.SecretSync;
    payload: TSyncSecretsDTO;
  };
  [QueueName.PkiSync]:
    | {
        name: QueueJobs.PkiSyncSyncCertificates;
        payload: TQueuePkiSyncSyncCertificatesByIdDTO;
      }
    | {
        name: QueueJobs.PkiSyncImportCertificates;
        payload: TQueuePkiSyncImportCertificatesByIdDTO;
      }
    | {
        name: QueueJobs.PkiSyncRemoveCertificates;
        payload: TQueuePkiSyncRemoveCertificatesByIdDTO;
      };
  [QueueName.ProjectV3Migration]: {
    name: QueueJobs.ProjectV3Migration;
    payload: { projectId: string };
  };
  [QueueName.FolderTreeCheckpoint]: {
    name: QueueJobs.CreateFolderTreeCheckpoint;
    payload: {
      envId: string;
    };
  };
  [QueueName.ImportSecretsFromExternalSource]: {
    name: QueueJobs.ImportSecretsFromExternalSource;
    payload: {
      orgId: string;
      actorId: string;
      actorEmail: string;
      importType: ExternalPlatforms;
      data: {
        iv: string;
        tag: string;
        ciphertext: string;
        algorithm: SecretEncryptionAlgo;
        encoding: SecretKeyEncoding;
      };
    };
  };
  [QueueName.AppConnectionSecretSync]:
    | {
        name: QueueJobs.SecretSyncSyncSecrets;
        payload: TQueueSecretSyncSyncSecretsByIdDTO;
      }
    | {
        name: QueueJobs.SecretSyncImportSecrets;
        payload: TQueueSecretSyncImportSecretsByIdDTO;
      }
    | {
        name: QueueJobs.SecretSyncRemoveSecrets;
        payload: TQueueSecretSyncRemoveSecretsByIdDTO;
      }
    | {
        name: QueueJobs.SecretSyncSendActionFailedNotifications;
        payload: TQueueSendSecretSyncActionFailedNotificationsDTO;
      };
  [QueueName.SecretRotationV2]:
    | {
        name: QueueJobs.SecretRotationV2QueueRotations;
        payload: undefined;
      }
    | {
        name: QueueJobs.SecretRotationV2SendNotification;
        payload: TSecretRotationSendNotificationJobPayload;
      };
  [QueueName.SecretRotationV2RotateSecrets]: {
    name: QueueJobs.SecretRotationV2RotateSecrets;
    payload: TSecretRotationRotateSecretsJobPayload;
  };
  [QueueName.InvalidateCache]: {
    name: QueueJobs.InvalidateCache;
    payload: {
      data: {
        type: CacheType;
      };
    };
  };
  [QueueName.SecretScanningV2]:
    | {
        name: QueueJobs.SecretScanningV2FullScan;
        payload: TQueueSecretScanningDataSourceFullScan;
      }
    | {
        name: QueueJobs.SecretScanningV2DiffScan;
        payload: TQueueSecretScanningResourceDiffScan;
      }
    | {
        name: QueueJobs.SecretScanningV2SendNotification;
        payload: TQueueSecretScanningSendNotification;
      };
  [QueueName.CaLifecycle]: {
    name: QueueJobs.CaOrderCertificateForSubscriber;
    payload: {
      subscriberId: string;
      caType: CaType;
    };
  };
  [QueueName.CertificateIssuance]: {
    name: QueueJobs.CaIssueCertificateFromProfile;
    payload: {
      certificateId: string;
      profileId: string;
      caId: string;
      commonName?: string;
      altNames?: string[];
      ttl: string;
      signatureAlgorithm: string;
      keyAlgorithm: string;
      keyUsages?: string[];
      extendedKeyUsages?: string[];
    };
  };
  [QueueName.DailyReminders]: {
    name: QueueJobs.DailyReminders;
    payload: undefined;
  };
  [QueueName.SecretReminderMigration]: {
    name: QueueJobs.SecretReminderMigration;
    payload: undefined;
  };
  [QueueName.PkiSubscriber]: {
    name: QueueJobs.PkiSubscriberDailyAutoRenewal;
    payload: undefined;
  };
  [QueueName.TelemetryAggregatedEvents]: {
    name: QueueJobs.TelemetryAggregatedEvents;
    payload: undefined;
  };
  [QueueName.UserNotification]: {
    name: QueueJobs.UserNotification;
    payload: { notifications: TCreateUserNotificationDTO[] };
  };
  [QueueName.HealthAlert]: {
    name: QueueJobs.HealthAlert;
    payload: undefined;
  };
  [QueueName.CertificateV3AutoRenewal]: {
    name: QueueJobs.CertificateV3DailyAutoRenewal;
    payload: undefined;
  };
  [QueueName.PamAccountRotation]: {
    name: QueueJobs.PamAccountRotation;
    payload: undefined;
  };
  [QueueName.PamSessionExpiration]: {
    name: QueueJobs.PamSessionExpiration;
    payload: { sessionId: string };
  };
  [QueueName.PkiAcmeChallengeValidation]: {
    name: QueueJobs.PkiAcmeChallengeValidation;
    payload: { challengeId: string };
  };
  [QueueName.FrequentResourceCleanUp]: {
    name: QueueJobs.FrequentResourceCleanUp;
    payload: undefined;
  };
};

const SECRET_SCANNING_QUEUES = [
  QueueName.SecretScanningV2,
  QueueName.SecretFullRepoScan,
  QueueName.SecretPushEventScan
];

const NON_STANDARD_QUEUES = [...SECRET_SCANNING_QUEUES];

const isQueueEnabled = (name: QueueName) => {
  const appCfg = getConfig();
  switch (appCfg.QUEUE_WORKER_PROFILE) {
    case QueueWorkerProfile.Standard:
      return !NON_STANDARD_QUEUES.includes(name);
    case QueueWorkerProfile.SecretScanning:
      return SECRET_SCANNING_QUEUES.includes(name);
    case QueueWorkerProfile.All:
    default:
      // allow all
      return true;
  }
};

export type TQueueServiceFactory = {
  initialize: () => Promise<void>;
  start: <T extends QueueName>(
    name: T,
    jobFn: (job: Job<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>, token?: string) => Promise<void>,
    queueSettings?: Omit<QueueOptions, "connection"> & { persistence?: boolean }
  ) => void;
  listen: <
    T extends QueueName,
    U extends keyof WorkerListener<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>
  >(
    name: T,
    event: U,
    listener: WorkerListener<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>[U]
  ) => void;
  queue: <T extends QueueName>(
    name: T,
    job: TQueueJobTypes[T]["name"],
    data: TQueueJobTypes[T]["payload"],
    opts: TQueueOptions
  ) => Promise<void>;
  unschedulePg: <T extends QueueName>(job: TQueueJobTypes[T]["name"]) => Promise<void>;
  shutdown: () => Promise<void>;
  stopRepeatableJob: <T extends QueueName>(
    name: T,
    job: TQueueJobTypes[T]["name"],
    repeatOpt: RepeatOptions,
    jobId?: string
  ) => Promise<boolean | undefined>;
  stopRepeatableJobByJobId: <T extends QueueName>(name: T, jobId: string) => Promise<boolean>;
  stopRepeatableJobByKey: <T extends QueueName>(name: T, repeatJobKey: string) => Promise<boolean>;
  clearQueue: (name: QueueName) => Promise<void>;
  stopJobById: <T extends QueueName>(name: T, jobId: string) => Promise<void | undefined>;
  stopJobByIdPg: <T extends QueueName>(name: T, jobId: string) => Promise<void | undefined>;
  getRepeatableJobs: (
    name: QueueName,
    startOffset?: number,
    endOffset?: number
  ) => Promise<{ key: string; name: string; id: string | null }[]>;
  getDelayedJobs: (
    name: QueueName,
    startOffset?: number,
    endOffset?: number
  ) => Promise<{ delay: number; timestamp: number; repeatJobKey?: string; data?: unknown }[]>;
};

export const queueServiceFactory = (
  redisCfg: TRedisConfigKeys,
  queueJobsDAL: TQueueJobsDALFactory,
  { dbConnectionUrl, dbRootCert }: { dbConnectionUrl: string; dbRootCert?: string }
): TQueueServiceFactory => {
  const isClusterMode = Boolean(redisCfg?.REDIS_CLUSTER_HOSTS);
  const connection = buildRedisFromConfig(redisCfg);
  const queueContainer = {} as Record<
    QueueName,
    Queue<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  >;

  const pgBoss = new PgBoss({
    connectionString: dbConnectionUrl,
    archiveCompletedAfterSeconds: 60,
    cronMonitorIntervalSeconds: 5,
    archiveFailedAfterSeconds: 1000, // we want to keep failed jobs for a longer time so that it can be retried
    deleteAfterSeconds: 30,
    ssl: dbRootCert
      ? {
          rejectUnauthorized: true,
          ca: Buffer.from(dbRootCert, "base64").toString("ascii")
        }
      : false
  });

  const workerContainer = {} as Record<
    QueueName,
    Worker<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  >;

  const persistantQueues = new Set<QueueName>();

  const initialize = async () => {
    logger.info("Initializing pg-queue...");
    await pgBoss.start();

    pgBoss.on("error", (error) => {
      logger.error(error, "pg-queue error");
    });
  };

  const start: TQueueServiceFactory["start"] = (name, jobFn, queueSettings) => {
    if (queueContainer[name]) {
      throw new Error(`${name} queue is already initialized`);
    }

    const appCfg = getConfig();

    if (!appCfg.QUEUE_WORKERS_ENABLED) return;

    if (appCfg.QUEUE_WORKER_PROFILE === QueueWorkerProfile.Standard && NON_STANDARD_QUEUES.includes(name)) {
      // only process standard jobs
      return;
    }

    if (appCfg.QUEUE_WORKER_PROFILE === QueueWorkerProfile.SecretScanning && !SECRET_SCANNING_QUEUES.includes(name)) {
      // only process secret scanning jobs
      return;
    }

    const { persistence, ...restQueueSettings } = queueSettings || {};

    queueContainer[name] = new Queue(name as string, {
      // ref: docs.bullmq.io/bull/patterns/redis-cluster
      prefix: isClusterMode ? `{${name}}` : undefined,
      ...restQueueSettings,
      ...(crypto.isFipsModeEnabled()
        ? {
            settings: {
              ...restQueueSettings?.settings,
              repeatKeyHashAlgorithm: "sha256"
            }
          }
        : {}),
      connection
    });

    if (!appCfg.QUEUE_WORKERS_ENABLED || !isQueueEnabled(name)) {
      return;
    }

    workerContainer[name] = new Worker(name, jobFn, {
      prefix: isClusterMode ? `{${name}}` : undefined,
      ...restQueueSettings,
      ...(crypto.isFipsModeEnabled()
        ? {
            settings: {
              ...restQueueSettings?.settings,
              repeatKeyHashAlgorithm: "sha256"
            }
          }
        : {}),
      connection
    });

    if (persistence) {
      persistantQueues.add(name);

      workerContainer[name].on("active", (job) => {
        if (job.id) {
          void queueJobsDAL
            .update(
              { jobId: job.id },
              {
                status: PersistanceQueueStatus.Processing,
                startedAt: new Date(),
                errorMessage: null
              }
            )
            .catch((err) => {
              logger.error(err, "Failed to update queue job status active");
            });
        }
      });

      workerContainer[name].on("completed", (job) => {
        if (job.id) {
          void queueJobsDAL
            .update(
              { jobId: job.id },
              {
                status: PersistanceQueueStatus.Completed,
                completedAt: new Date()
              }
            )
            .catch((err) => {
              logger.error(err, "Failed to update queue job status completed");
            });
        }
      });

      workerContainer[name].on("failed", (job, error) => {
        if (job?.id) {
          void queueJobsDAL
            .update(
              { jobId: job.id },
              {
                status: PersistanceQueueStatus.Failed,
                errorMessage: error.message.slice(0, 1000)
              }
            )
            .catch((err) => {
              logger.error(err, "Failed to update queue job status failed");
            });
        }
      });
    }
  };

  const listen: TQueueServiceFactory["listen"] = (name, event, listener) => {
    const appCfg = getConfig();
    if (!appCfg.QUEUE_WORKERS_ENABLED || !isQueueEnabled(name)) {
      return;
    }

    const worker = workerContainer[name];
    worker.on(event, listener);
  };

  const queue: TQueueServiceFactory["queue"] = async (name, job, data, opts) => {
    const q = queueContainer[name];

    const { jobId } = opts;
    const finalOptions = { removeOnFail: true, removeOnComplete: true, ...opts };

    if (persistantQueues.has(name)) {
      await queueJobsDAL.create({
        queueName: name,
        queueType: "bullmq",
        queueJobName: job,
        jobId,
        queueData: data,
        queueOptions: finalOptions,
        status: PersistanceQueueStatus.Pending
      });
    }

    await q.add(job, data, { ...opts, jobId });
  };

  const unschedulePg: TQueueServiceFactory["unschedulePg"] = async (job) => {
    await pgBoss.unschedule(job);
    await pgBoss.deleteQueue(job);
  };

  const stopRepeatableJob: TQueueServiceFactory["stopRepeatableJob"] = async (name, job, repeatOpt, jobId) => {
    const q = queueContainer[name];
    if (q) {
      return q.removeRepeatable(job, repeatOpt, jobId);
    }
  };

  const getRepeatableJobs: TQueueServiceFactory["getRepeatableJobs"] = (name, startOffset, endOffset) => {
    const q = queueContainer[name];
    if (!q) throw new Error(`Queue '${name}' not initialized`);

    return q.getRepeatableJobs(startOffset, endOffset);
  };

  const getDelayedJobs: TQueueServiceFactory["getDelayedJobs"] = (name, startOffset, endOffset) => {
    const q = queueContainer[name];
    if (!q) throw new Error(`Queue '${name}' not initialized`);

    return q.getDelayed(startOffset, endOffset);
  };

  const stopRepeatableJobByJobId: TQueueServiceFactory["stopRepeatableJobByJobId"] = async (name, jobId) => {
    const q = queueContainer[name];
    const job = await q.getJob(jobId);
    if (!job) return true;
    if (!job.repeatJobKey) return true;
    await job.remove();
    return q.removeRepeatableByKey(job.repeatJobKey);
  };

  const stopRepeatableJobByKey: TQueueServiceFactory["stopRepeatableJobByKey"] = async (name, repeatJobKey) => {
    const q = queueContainer[name];
    return q.removeRepeatableByKey(repeatJobKey);
  };

  const stopJobByIdPg: TQueueServiceFactory["stopJobByIdPg"] = async (name, jobId) => {
    await pgBoss.deleteJob(name, jobId);
  };

  const stopJobById: TQueueServiceFactory["stopJobById"] = async (name, jobId) => {
    const q = queueContainer[name];
    const job = await q.getJob(jobId);
    return job?.remove().catch(() => undefined);
  };

  const clearQueue: TQueueServiceFactory["clearQueue"] = async (name) => {
    const q = queueContainer[name];
    await q.drain();
  };

  const shutdown: TQueueServiceFactory["shutdown"] = async () => {
    await Promise.all(Object.values(workerContainer).map((worker) => worker.close()));
  };

  return {
    initialize,
    start,
    listen,
    queue,
    shutdown,
    stopRepeatableJob,
    stopRepeatableJobByJobId,
    stopRepeatableJobByKey,
    clearQueue,
    stopJobById,
    stopJobByIdPg,
    getRepeatableJobs,
    getDelayedJobs,
    unschedulePg
  };
};
