import { Job, JobsOptions, Queue, QueueOptions, RepeatOptions, Worker, WorkerListener } from "bullmq";
import Redis from "ioredis";
import PgBoss, { WorkOptions } from "pg-boss";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import {
  TScanFullRepoEventPayload,
  TScanPushEventPayload
} from "@app/ee/services/secret-scanning/secret-scanning-queue/secret-scanning-queue-types";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import {
  TFailedIntegrationSyncEmailsPayload,
  TIntegrationSyncPayload,
  TSyncSecretsDTO
} from "@app/services/secret/secret-types";

export enum QueueName {
  SecretRotation = "secret-rotation",
  SecretReminder = "secret-reminder",
  AuditLog = "audit-log",
  // TODO(akhilmhdh): This will get removed later. For now this is kept to stop the repeatable queue
  AuditLogPrune = "audit-log-prune",
  DailyResourceCleanUp = "daily-resource-cleanup",
  DailyExpiringPkiItemAlert = "daily-expiring-pki-item-alert",
  TelemetryInstanceStats = "telemtry-self-hosted-stats",
  IntegrationSync = "sync-integrations",
  SecretWebhook = "secret-webhook",
  SecretFullRepoScan = "secret-full-repo-scan",
  SecretPushEventScan = "secret-push-event-scan",
  UpgradeProjectToGhost = "upgrade-project-to-ghost",
  DynamicSecretRevocation = "dynamic-secret-revocation",
  CaCrlRotation = "ca-crl-rotation",
  SecretReplication = "secret-replication",
  SecretSync = "secret-sync", // parent queue to push integration sync, webhook, and secret replication
  ProjectV3Migration = "project-v3-migration",
  AccessTokenStatusUpdate = "access-token-status-update",
  ImportSecretsFromExternalSource = "import-secrets-from-external-source"
}

export enum QueueJobs {
  SecretReminder = "secret-reminder-job",
  SecretRotation = "secret-rotation-job",
  AuditLog = "audit-log-job",
  // TODO(akhilmhdh): This will get removed later. For now this is kept to stop the repeatable queue
  AuditLogPrune = "audit-log-prune-job",
  DailyResourceCleanUp = "daily-resource-cleanup-job",
  DailyExpiringPkiItemAlert = "daily-expiring-pki-item-alert",
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
  ProjectV3Migration = "project-v3-migration",
  IdentityAccessTokenStatusUpdate = "identity-access-token-status-update",
  ServiceTokenStatusUpdate = "service-token-status-update",
  ImportSecretsFromExternalSource = "import-secrets-from-external-source"
}

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
  [QueueName.AuditLogPrune]: {
    name: QueueJobs.AuditLogPrune;
    payload: undefined;
  };
  [QueueName.SecretWebhook]: {
    name: QueueJobs.SecWebhook;
    payload: { projectId: string; environment: string; secretPath: string; depth?: number };
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
  [QueueName.DynamicSecretRevocation]:
    | {
        name: QueueJobs.DynamicSecretRevocation;
        payload: {
          leaseId: string;
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
  [QueueName.ProjectV3Migration]: {
    name: QueueJobs.ProjectV3Migration;
    payload: { projectId: string };
  };
  [QueueName.ImportSecretsFromExternalSource]: {
    name: QueueJobs.ImportSecretsFromExternalSource;
    payload: {
      actorEmail: string;
      data: {
        iv: string;
        tag: string;
        ciphertext: string;
        algorithm: SecretEncryptionAlgo;
        encoding: SecretKeyEncoding;
      };
    };
  };
};

export type TQueueServiceFactory = ReturnType<typeof queueServiceFactory>;
export const queueServiceFactory = (
  redisUrl: string,
  { dbConnectionUrl, dbRootCert }: { dbConnectionUrl: string; dbRootCert?: string }
) => {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queueContainer = {} as Record<
    QueueName,
    Queue<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  >;

  const pgBoss = new PgBoss({
    connectionString: dbConnectionUrl,
    archiveCompletedAfterSeconds: 60,
    archiveFailedAfterSeconds: 1000, // we want to keep failed jobs for a longer time so that it can be retried
    deleteAfterSeconds: 30,
    ssl: dbRootCert
      ? {
          rejectUnauthorized: true,
          ca: Buffer.from(dbRootCert, "base64").toString("ascii")
        }
      : false
  });

  const queueContainerPg = {} as Record<QueueJobs, boolean>;

  const workerContainer = {} as Record<
    QueueName,
    Worker<TQueueJobTypes[QueueName]["payload"], void, TQueueJobTypes[QueueName]["name"]>
  >;

  const initialize = async () => {
    const appCfg = getConfig();
    if (appCfg.SHOULD_INIT_PG_QUEUE) {
      logger.info("Initializing pg-queue...");
      await pgBoss.start();

      pgBoss.on("error", (error) => {
        logger.error(error, "pg-queue error");
      });
    }
  };

  const start = <T extends QueueName>(
    name: T,
    jobFn: (job: Job<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>, token?: string) => Promise<void>,
    queueSettings: Omit<QueueOptions, "connection"> = {}
  ) => {
    if (queueContainer[name]) {
      throw new Error(`${name} queue is already initialized`);
    }

    queueContainer[name] = new Queue<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>(name as string, {
      ...queueSettings,
      connection
    });

    workerContainer[name] = new Worker<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>(name, jobFn, {
      ...queueSettings,
      connection
    });
  };

  const startPg = async <T extends QueueName>(
    jobName: QueueJobs,
    jobsFn: (jobs: PgBoss.Job<TQueueJobTypes[T]["payload"]>[]) => Promise<void>,
    options: WorkOptions & {
      workerCount: number;
    }
  ) => {
    if (queueContainerPg[jobName]) {
      throw new Error(`${jobName} queue is already initialized`);
    }

    await pgBoss.createQueue(jobName);
    queueContainerPg[jobName] = true;

    await Promise.all(
      Array.from({ length: options.workerCount }).map(() =>
        pgBoss.work<TQueueJobTypes[T]["payload"]>(jobName, options, jobsFn)
      )
    );
  };

  const listen = <
    T extends QueueName,
    U extends keyof WorkerListener<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>
  >(
    name: T,
    event: U,
    listener: WorkerListener<TQueueJobTypes[T]["payload"], void, TQueueJobTypes[T]["name"]>[U]
  ) => {
    const worker = workerContainer[name];
    worker.on(event, listener);
  };

  const queue = async <T extends QueueName>(
    name: T,
    job: TQueueJobTypes[T]["name"],
    data: TQueueJobTypes[T]["payload"],
    opts?: JobsOptions & { jobId?: string }
  ) => {
    const q = queueContainer[name];

    await q.add(job, data, opts);
  };

  const queuePg = async <T extends QueueName>(
    job: TQueueJobTypes[T]["name"],
    data: TQueueJobTypes[T]["payload"],
    opts?: PgBoss.SendOptions & { jobId?: string }
  ) => {
    await pgBoss.send({
      name: job,
      data,
      options: opts
    });
  };

  const stopRepeatableJob = async <T extends QueueName>(
    name: T,
    job: TQueueJobTypes[T]["name"],
    repeatOpt: RepeatOptions,
    jobId?: string
  ) => {
    const q = queueContainer[name];
    if (q) {
      return q.removeRepeatable(job, repeatOpt, jobId);
    }
  };

  const stopRepeatableJobByJobId = async <T extends QueueName>(name: T, jobId: string) => {
    const q = queueContainer[name];
    const job = await q.getJob(jobId);
    if (!job) return true;
    if (!job.repeatJobKey) return true;
    await job.remove();
    return q.removeRepeatableByKey(job.repeatJobKey);
  };

  const stopJobById = async <T extends QueueName>(name: T, jobId: string) => {
    const q = queueContainer[name];
    const job = await q.getJob(jobId);
    return job?.remove().catch(() => undefined);
  };

  const clearQueue = async (name: QueueName) => {
    const q = queueContainer[name];
    await q.drain();
  };

  const shutdown = async () => {
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
    clearQueue,
    stopJobById,
    startPg,
    queuePg
  };
};
