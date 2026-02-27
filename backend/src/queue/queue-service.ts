import { Job, Queue, QueueOptions, RepeatOptions, Worker, WorkerListener } from "bullmq";

import { SecretEncryptionAlgo, SecretKeyEncoding, TQueueJobs } from "@app/db/schemas";
import { TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import { PamDiscoveryRunTrigger } from "@app/ee/services/pam-discovery/pam-discovery-enums";
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
import { PersistenceQueueStatus } from "./queue-types";

const RECOVERY_BATCH_SIZE = 500;

export enum QueueName {
  // Internal queues for durable queue recovery
  QueueInternalRecovery = "queue-internal-recovery",
  QueueInternalReconciliation = "queue-internal-reconciliation",

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
  PkiAcmeChallengeValidation = "pki-acme-challenge-validation",
  PkiDiscoveryScan = "pki-discovery-scan",
  PamDiscoveryScan = "pam-discovery-scan"
}

export enum QueueJobs {
  // Internal queue jobs for durable queue recovery
  QueueRecovery = "queue-recovery-job",
  QueueReconciliation = "queue-reconciliation-job",

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
  PkiAcmeChallengeValidation = "pki-acme-challenge-validation",
  PkiDiscoveryRunScan = "pki-discovery-run-scan",
  PkiDiscoveryScheduledScan = "pki-discovery-scheduled-scan",
  PamDiscoveryRunScan = "pam-discovery-run-scan",
  PamDiscoveryScheduledScan = "pam-discovery-scheduled-scan"
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
    every?: number;
    // only works with every by bullmq
    immediately?: boolean;
    key: string;
    utc?: boolean;
  };
};

export type TPersistenceConfig = {
  enabled: boolean;
  stuckThresholdMs?: number; // Default: 5 minutes (300000ms)
};

export type TQueueJobTypes = {
  // Internal queue types for durable queue recovery
  [QueueName.QueueInternalRecovery]: {
    name: QueueJobs.QueueRecovery;
    payload: undefined;
  };
  [QueueName.QueueInternalReconciliation]: {
    name: QueueJobs.QueueReconciliation;
    payload: undefined;
  };

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
      altNames?: Array<{ type: string; value: string }>;
      ttl: string;
      signatureAlgorithm: string;
      keyAlgorithm: string;
      keyUsages?: string[];
      extendedKeyUsages?: string[];
      isRenewal?: boolean;
      originalCertificateId?: string;
      certificateRequestId?: string;
      csr?: string;
      organization?: string;
      organizationalUnit?: string;
      country?: string;
      state?: string;
      locality?: string;
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
  [QueueName.PkiDiscoveryScan]:
    | {
        name: QueueJobs.PkiDiscoveryRunScan;
        payload: { discoveryId: string };
      }
    | {
        name: QueueJobs.PkiDiscoveryScheduledScan;
        payload: undefined;
      };
  [QueueName.PamDiscoveryScan]:
    | {
        name: QueueJobs.PamDiscoveryRunScan;
        payload: { discoverySourceId: string; triggeredBy: PamDiscoveryRunTrigger };
      }
    | {
        name: QueueJobs.PamDiscoveryScheduledScan;
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
    queueSettings?: Omit<QueueOptions, "connection"> & {
      /*
      Enable postgres backup persistance mechanism for schedule job
      Avoid this for cron job and very high throughput job
      Use updateJobHeartbeat() for long running job
      */
      persistence?: boolean | TPersistenceConfig;
    }
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
  updateJobHeartbeat: <T extends QueueName>(queueName: T, jobId: string) => Promise<void>;
};

export const queueServiceFactory = (
  redisCfg: TRedisConfigKeys,
  queueJobsDAL: TQueueJobsDALFactory
): TQueueServiceFactory => {
  const isClusterMode = Boolean(redisCfg?.REDIS_CLUSTER_HOSTS);
  const connection = buildRedisFromConfig(redisCfg);
  const queueContainer = {} as Record<
    QueueName,
    Queue<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  >;

  const workerContainer = {} as Record<
    QueueName,
    Worker<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  >;

  const persistantQueues = new Set<QueueName>();

  // Configuration for persistent queues (threshold and max attempts)
  const persistentQueueConfigs = new Map<
    QueueName,
    {
      stuckThresholdMs: number;
    }
  >();

  /**
   * Wraps a job function with heartbeat support for persistent queues.
   * The heartbeat runs every 1 minute to signal the job is still alive.
   */
  const wrapJobWithHeartbeat = <T extends QueueName>(
    name: T,
    jobFn: (job: Job<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>, token?: string) => Promise<void>
  ) => {
    return async (job: Job<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>, token?: string) => {
      let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

      try {
        // Start heartbeat interval (every 1 minute)
        if (job.id) {
          heartbeatInterval = setInterval(() => {
            void queueJobsDAL.update({ jobId: job.id, queueName: name }, { lastHeartBeat: new Date() }).catch((err) => {
              logger.error(err, "Failed to update job heartbeat");
            });
          }, 60 * 1000);
        }

        await jobFn(job, token);
      } finally {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
      }
    };
  };

  /**
   * Startup Recovery Function
   * Recovers pending and failed jobs from PostgreSQL after server restart
   * - Pending jobs: Jobs that were queued but not yet processed
   * - Failed jobs: Jobs that failed but haven't reached max attempts (can retry)
   * Uses pagination to avoid loading all jobs into memory at once
   */
  const startupRecovery = async () => {
    logger.info("Starting queue startup recovery...");

    const queueNames = Array.from(persistantQueues);
    if (queueNames.length === 0) {
      logger.info("No persistent queues configured, skipping startup recovery");
      return;
    }

    try {
      let offset = 0;
      let totalRecovered = 0;
      let jobsInBatch: TQueueJobs[];

      do {
        // eslint-disable-next-line no-await-in-loop
        jobsInBatch = await queueJobsDAL.find(
          {
            $in: {
              queueName: queueNames,
              status: [PersistenceQueueStatus.Pending, PersistenceQueueStatus.Failed]
            }
          },
          {
            limit: RECOVERY_BATCH_SIZE,
            offset,
            sort: [["createdAt", "asc"]]
          }
        );

        if (jobsInBatch.length > 0) {
          logger.info({ batchSize: jobsInBatch.length, offset }, "Processing recovery batch");

          // eslint-disable-next-line no-await-in-loop
          for (const job of jobsInBatch) {
            const queueName = job.queueName as QueueName;
            const q = queueContainer[queueName];
            if (!q) {
              logger.warn({ queueName, jobId: job.jobId }, "Queue not initialized, skipping job");
              // eslint-disable-next-line no-continue
              continue;
            }

            const opts = (job.queueOptions || {}) as TQueueOptions;

            // Check if already in Redis (avoid duplicates)
            // eslint-disable-next-line no-await-in-loop
            const existingJob = await q.getJob(job.jobId);
            if (existingJob) {
              logger.debug({ jobId: job.jobId, queueName }, "Job already in Redis, skipping");
              // eslint-disable-next-line no-continue
              continue;
            }

            // For failed jobs, run immediately (no delay)
            // For pending jobs with delay, recalculate based on original schedule
            let adjustedDelay: number | undefined;
            const isFailedJob = job.status === PersistenceQueueStatus.Failed;

            if (!isFailedJob && opts.delay && opts.delay > 0) {
              const originalScheduledTime = new Date(job.createdAt).getTime() + opts.delay;
              adjustedDelay = Math.max(0, originalScheduledTime - Date.now());
            }

            // Re-queue the job
            // eslint-disable-next-line no-await-in-loop
            await q.add(job.queueJobName as TQueueJobTypes[typeof queueName]["name"], job.queueData as never, {
              ...opts,
              delay: adjustedDelay,
              jobId: job.jobId
            });

            logger.info(
              { jobId: job.jobId, queueName, adjustedDelay, wasFailedJob: isFailedJob },
              "Job recovered and re-queued"
            );
          }

          totalRecovered += jobsInBatch.length;
          offset += RECOVERY_BATCH_SIZE;
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10); // time to breathe for db
        });
      } while (jobsInBatch.length === RECOVERY_BATCH_SIZE);

      logger.info({ totalRecovered }, "Queue startup recovery completed");
    } catch (error) {
      logger.error(error, "Queue startup recovery failed");
    }
  };

  /**
   * Handle a stuck job - either re-queue it or mark it as dead
   */
  const handleStuckJob = async (dbJob: TQueueJobs) => {
    const queueName = dbJob.queueName as QueueName;
    const q = queueContainer[queueName];
    if (!q) return;

    const newAttempts = dbJob.attempts + 1;

    if (newAttempts >= dbJob.maxAttempts) {
      // Mark as dead - exceeded max retries
      await queueJobsDAL.update(
        { id: dbJob.id },
        {
          status: PersistenceQueueStatus.Dead,
          attempts: newAttempts,
          errorMessage: `Exceeded max attempts (${dbJob.maxAttempts}) after being stuck`
        }
      );

      logger.error({ jobId: dbJob.jobId, queueName, attempts: newAttempts }, "Job marked as dead");

      // Remove from Redis if exists
      try {
        const redisJob = await q.getJob(dbJob.jobId);
        if (redisJob) await redisJob.remove();
      } catch {
        // Ignore removal errors
      }
      return;
    }

    // Reset to pending with incremented attempts
    await queueJobsDAL.update(
      { id: dbJob.id },
      {
        status: PersistenceQueueStatus.Pending,
        attempts: newAttempts,
        startedAt: null,
        lastHeartBeat: null,
        errorMessage: `Re-queued after stuck detection (attempt ${newAttempts}/${dbJob.maxAttempts})`
      }
    );

    // Remove from Redis and re-add
    try {
      const redisJob = await q.getJob(dbJob.jobId);
      if (redisJob) await redisJob.remove();
    } catch {
      // Ignore removal errors
    }

    const opts = (dbJob.queueOptions || {}) as TQueueOptions;
    await q.add(dbJob.queueJobName as TQueueJobTypes[typeof queueName]["name"], dbJob.queueData as never, {
      ...opts,
      jobId: dbJob.jobId,
      delay: undefined // Execute immediately on retry
    });

    logger.info({ jobId: dbJob.jobId, queueName, attempt: newAttempts }, "Stuck job re-queued");
  };

  /**
   * Reconciliation Function
   * Checks for stuck jobs and re-queues them
   */
  const runReconciliation = async () => {
    logger.debug("Running queue reconciliation check...");

    if (persistentQueueConfigs.size === 0) return;

    try {
      // Iterate through each persistent queue
      for await (const [queueName, config] of persistentQueueConfigs.entries()) {
        // Find stuck jobs for this specific queue
        const stuckJobs = await queueJobsDAL.findStuckJobsByQueue(queueName, config.stuckThresholdMs);

        if (stuckJobs.length > 0) {
          logger.info({ queueName, count: stuckJobs.length }, "Found stuck jobs for reconciliation");
        }

        // Process stuck jobs sequentially to avoid race conditions
        // eslint-disable-next-line no-await-in-loop
        for await (const job of stuckJobs) {
          await handleStuckJob(job);
        }
      }
    } catch (error) {
      logger.error(error, "Queue reconciliation failed");
    }
  };

  const initialize = async () => {
    const appCfg = getConfig();

    // Initialize internal recovery queue (BullMQ for distributed coordination)
    queueContainer[QueueName.QueueInternalRecovery] = new Queue(QueueName.QueueInternalRecovery, {
      prefix: isClusterMode ? `{${QueueName.QueueInternalRecovery}}` : undefined,
      connection
    });

    // Initialize internal reconciliation queue
    queueContainer[QueueName.QueueInternalReconciliation] = new Queue(QueueName.QueueInternalReconciliation, {
      prefix: isClusterMode ? `{${QueueName.QueueInternalReconciliation}}` : undefined,
      connection
    });

    if (appCfg.QUEUE_WORKERS_ENABLED) {
      // Start recovery worker
      workerContainer[QueueName.QueueInternalRecovery] = new Worker(
        QueueName.QueueInternalRecovery,
        async () => {
          await startupRecovery();
        },
        {
          prefix: isClusterMode ? `{${QueueName.QueueInternalRecovery}}` : undefined,
          connection
        }
      );

      // Start reconciliation worker
      workerContainer[QueueName.QueueInternalReconciliation] = new Worker(
        QueueName.QueueInternalReconciliation,
        async () => {
          await runReconciliation();
        },
        {
          prefix: isClusterMode ? `{${QueueName.QueueInternalReconciliation}}` : undefined,
          connection
        }
      );

      // Schedule startup recovery job (runs once after 2 minutes)
      await queueContainer[QueueName.QueueInternalRecovery].add(QueueJobs.QueueRecovery, undefined, {
        jobId: "queue-startup-recovery",
        delay: 2 * 60 * 1000,
        removeOnComplete: true,
        removeOnFail: true
      });

      // Schedule reconciliation job (runs every 2 minute)
      await queueContainer[QueueName.QueueInternalReconciliation].add(QueueJobs.QueueReconciliation, undefined, {
        jobId: "queue-reconciliation-cron",
        repeat: {
          pattern: "*/2 * * * *",
          key: "queue-reconciliation-cron"
        },
        removeOnComplete: true,
        removeOnFail: true
      });

      logger.info("Internal queue recovery and reconciliation workers started");
    }
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

    // Check if persistence is enabled (either true or an object with enabled: true)
    const isPersistenceEnabled = persistence === true || (typeof persistence === "object" && persistence.enabled);

    const wrappedJobFn = isPersistenceEnabled ? wrapJobWithHeartbeat(name, jobFn) : jobFn;

    workerContainer[name] = new Worker(name, wrappedJobFn, {
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

    if (isPersistenceEnabled) {
      // Normalize persistence config (supports boolean or object)
      const persistenceConfig =
        typeof persistence === "object"
          ? {
              stuckThresholdMs: persistence.stuckThresholdMs ?? 5 * 60 * 1000,
              maxAttempts: 1
            }
          : { stuckThresholdMs: 5 * 60 * 1000, maxAttempts: 1 };

      persistentQueueConfigs.set(name, persistenceConfig);
      persistantQueues.add(name);

      workerContainer[name].on("active", (job) => {
        if (job.id) {
          void queueJobsDAL
            .update(
              { jobId: job.id, queueName: name },
              {
                status: PersistenceQueueStatus.Processing,
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
              { jobId: job.id, queueName: name },
              {
                status: PersistenceQueueStatus.Completed,
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
          void queueJobsDAL.updateJobFailure(name, job.id, error.message).catch((err) => {
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

    const { jobId, repeat } = opts;
    const finalOptions = {
      removeOnFail: true,
      removeOnComplete: true,
      ...opts,
      repeat: repeat ? { ...repeat, utc: true } : undefined
    };

    if (persistantQueues.has(name)) {
      await queueJobsDAL.transaction(async (tx) => {
        await queueJobsDAL.create(
          {
            queueName: name,
            queueType: "bullmq",
            queueJobName: job,
            jobId,
            queueData: data,
            queueOptions: finalOptions,
            status: PersistenceQueueStatus.Pending,
            maxAttempts: opts.attempts || 1
          },
          tx
        );
        // if this fails transaction rollback happens
        await q.add(job, data, { ...opts, jobId });
      });
      return;
    }

    await q.add(job, data, { ...opts, jobId });
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

  const stopJobById: TQueueServiceFactory["stopJobById"] = async (name, jobId) => {
    const q = queueContainer[name];
    const job = await q.getJob(jobId);

    const isPersistantQueue = persistantQueues.has(name);
    if (isPersistantQueue) {
      await queueJobsDAL.delete({ jobId, queueName: name });
    }

    return job?.remove().catch(() => undefined);
  };

  const clearQueue: TQueueServiceFactory["clearQueue"] = async (name) => {
    const q = queueContainer[name];
    await q.drain();
  };

  const shutdown: TQueueServiceFactory["shutdown"] = async () => {
    // Stop internal queue repeatable jobs
    try {
      const reconciliationQueue = queueContainer[QueueName.QueueInternalReconciliation];
      if (reconciliationQueue) {
        await reconciliationQueue.removeRepeatableByKey("queue-reconciliation-cron");
      }
    } catch {
      // Ignore errors during shutdown
    }

    await Promise.all(Object.values(workerContainer).map((worker) => worker.close()));
  };

  /**
   * Update the heartbeat for a job to signal it's still alive
   * Long-running jobs should call this periodically to avoid being marked as stuck
   */
  const updateJobHeartbeat: TQueueServiceFactory["updateJobHeartbeat"] = async (queueName, jobId) => {
    if (!persistantQueues.has(queueName)) return;

    await queueJobsDAL.update({ queueName, jobId }, { lastHeartBeat: new Date() });
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
    getRepeatableJobs,
    getDelayedJobs,
    updateJobHeartbeat
  };
};
