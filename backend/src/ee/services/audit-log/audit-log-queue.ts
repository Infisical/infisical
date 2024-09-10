import { RawAxiosRequestHeaders } from "axios";

import { AuditLogsSchema, SecretKeyEncoding } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { request } from "@app/lib/config/request";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { secondsToMillis } from "@app/lib/dates";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TAuditLogStreamDALFactory } from "../audit-log-stream/audit-log-stream-dal";
import { LogStreamHeaders } from "../audit-log-stream/audit-log-stream-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TCreateAuditLogDTO } from "./audit-log-types";

type TAuditLogQueueServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  auditLogStreamDAL: Pick<TAuditLogStreamDALFactory, "find">;
  queueService: TQueueServiceFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  keyStore: Pick<TKeyStoreFactory, "listHeadPop" | "listRemove" | "listLength" | "listAppend" | "acquireLock">;
};

export type TAuditLogQueueServiceFactory = ReturnType<typeof auditLogQueueServiceFactory>;

// keep this timeout 5s it must be fast because else the queue will take time to finish
// audit log is a crowded queue thus needs to be fast
export const AUDIT_LOG_STREAM_TIMEOUT = secondsToMillis(5);
const AUDIT_LOG_BATCH_SIZE = 10000;
const AUDIT_LOG_BATCH_WRITE_TO_DB_CYCLE_SPEED = secondsToMillis(5);
const AUDIT_LOG_BATCH_WRITE_TO_DB_CYCLE_JOB_ID = "audit-log-write-to-db-cycle";

export const auditLogQueueServiceFactory = ({
  auditLogDAL,
  queueService,
  projectDAL,
  licenseService,
  auditLogStreamDAL,
  keyStore
}: TAuditLogQueueServiceFactoryDep) => {
  const pushToLog = async (data: TCreateAuditLogDTO) => {
    await queueService.queue(QueueName.AuditLog, QueueJobs.AuditLog, data, {
      removeOnFail: {
        count: 3
      },
      removeOnComplete: true
    });
  };

  queueService.start(QueueName.AuditLog, async (job) => {
    if (job.name === QueueJobs.AuditLog && typeof job.data !== "undefined") {
      const { actor, event, ipAddress, projectId, userAgent, userAgentType } = job.data;
      let { orgId } = job.data;
      const MS_IN_DAY = 24 * 60 * 60 * 1000;
      let project;

      if (!orgId) {
        // it will never be undefined for both org and project id
        // TODO(akhilmhdh): use caching here in dal to avoid db calls
        project = await projectDAL.findById(projectId as string);
        orgId = project.orgId;
      }

      const plan = await licenseService.getPlan(orgId);
      if (plan.auditLogsRetentionDays === 0) {
        // skip inserting if audit log retention is 0 meaning its not supported
        return;
      }

      // For project actions, set TTL to project-level audit log retention config
      // This condition ensures that the plan's audit log retention days cannot be bypassed
      const ttlInDays =
        project?.auditLogsRetentionDays && project.auditLogsRetentionDays < plan.auditLogsRetentionDays
          ? project.auditLogsRetentionDays
          : plan.auditLogsRetentionDays;

      const ttl = ttlInDays * MS_IN_DAY;
      const auditLog = {
        actor: actor.type,
        actorMetadata: actor.metadata,
        userAgent,
        projectId,
        ipAddress,
        orgId,
        eventType: event.type,
        expiresAt: new Date(Date.now() + ttl),
        eventMetadata: event.metadata,
        userAgentType,
        createdAt: new Date(job.timestamp),
        updatedAt: new Date(job.timestamp)
      };

      await keyStore.listAppend(KeyStorePrefixes.AuditLogBatch, [JSON.stringify(auditLog)]);

      const logStreams = orgId ? await auditLogStreamDAL.find({ orgId }) : [];
      await Promise.allSettled(
        logStreams.map(
          async ({
            url,
            encryptedHeadersTag,
            encryptedHeadersIV,
            encryptedHeadersKeyEncoding,
            encryptedHeadersCiphertext
          }) => {
            const streamHeaders =
              encryptedHeadersIV && encryptedHeadersCiphertext && encryptedHeadersTag
                ? (JSON.parse(
                    infisicalSymmetricDecrypt({
                      keyEncoding: encryptedHeadersKeyEncoding as SecretKeyEncoding,
                      iv: encryptedHeadersIV,
                      tag: encryptedHeadersTag,
                      ciphertext: encryptedHeadersCiphertext
                    })
                  ) as LogStreamHeaders[])
                : [];

            const headers: RawAxiosRequestHeaders = { "Content-Type": "application/json" };

            if (streamHeaders.length)
              streamHeaders.forEach(({ key, value }) => {
                headers[key] = value;
              });

            return request.post(url, auditLog, {
              headers,
              // request timeout
              timeout: AUDIT_LOG_STREAM_TIMEOUT,
              // connection timeout
              signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
            });
          }
        )
      );
    }

    // this is when audit log needs to write to db
    if (job.name === QueueJobs.AuditLogWriteToDB) {
      const lock = await keyStore.acquireLock([KeyStorePrefixes.AuditLogBatchLock], 5000, {
        retryCount: 10,
        retryDelay: 200
      });
      try {
        const auditLogsInStore = await keyStore.listHeadPop(KeyStorePrefixes.AuditLogBatch, AUDIT_LOG_BATCH_SIZE);
        if (!auditLogsInStore?.length || !Array.isArray(auditLogsInStore)) return;

        const parsedAuditLogs = await AuditLogsSchema.omit({ id: true })
          .array()
          .parseAsync(
            auditLogsInStore.map(
              (el) =>
                JSON.parse(el, (key, value) => {
                  if (["updatedAt", "createdAt", "expiresAt"].includes(key)) return new Date(value as string);
                  return value as unknown;
                }) as unknown
            )
          );
        await auditLogDAL.batchInsert(parsedAuditLogs);
        const keyStoreAuditLogBatchSize = await keyStore.listLength(KeyStorePrefixes.AuditLogBatch);
        // if the size is still not under AUDIT_LOG_BATCH_SIZE / 2 keep doing the compaction
        if (keyStoreAuditLogBatchSize > AUDIT_LOG_BATCH_SIZE / 2) {
          await queueService.queue(QueueName.AuditLog, QueueJobs.AuditLogWriteToDB, undefined, {
            removeOnFail: true,
            removeOnComplete: true,
            delay: 50
          });
        }
      } finally {
        await lock.release();
      }
    }
  });

  const startPeriodicAuditLogBatchWriteToDB = () =>
    queueService.queue(QueueName.AuditLog, QueueJobs.AuditLogWriteToDB, undefined, {
      removeOnFail: true,
      removeOnComplete: true,
      repeat: {
        every: AUDIT_LOG_BATCH_WRITE_TO_DB_CYCLE_SPEED,
        key: AUDIT_LOG_BATCH_WRITE_TO_DB_CYCLE_JOB_ID
      }
    });

  queueService.listen(QueueName.AuditLog, "failed", (_, err) => {
    logger.error(err, `${QueueName.AuditLog}: Failed to do audit log generation`);
  });

  return {
    pushToLog,
    startPeriodicAuditLogBatchWriteToDB
  };
};
