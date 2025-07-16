import { AxiosError, RawAxiosRequestHeaders } from "axios";

import { SecretKeyEncoding } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TAuditLogStreamDALFactory } from "../audit-log-stream/audit-log-stream-dal";
import { providerSpecificPayload } from "../audit-log-stream/audit-log-stream-fns";
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
};

export type TAuditLogQueueServiceFactory = {
  pushToLog: (data: TCreateAuditLogDTO) => Promise<void>;
};

// keep this timeout 5s it must be fast because else the queue will take time to finish
// audit log is a crowded queue thus needs to be fast
export const AUDIT_LOG_STREAM_TIMEOUT = 5 * 1000;

export const auditLogQueueServiceFactory = async ({
  auditLogDAL,
  queueService,
  projectDAL,
  licenseService,
  auditLogStreamDAL
}: TAuditLogQueueServiceFactoryDep): Promise<TAuditLogQueueServiceFactory> => {
  const appCfg = getConfig();

  const pushToLog = async (data: TCreateAuditLogDTO) => {
    if (appCfg.USE_PG_QUEUE && appCfg.SHOULD_INIT_PG_QUEUE) {
      await queueService.queuePg<QueueName.AuditLog>(QueueJobs.AuditLog, data, {
        retryLimit: 10,
        retryBackoff: true
      });
    } else {
      await queueService.queue<QueueName.AuditLog>(QueueName.AuditLog, QueueJobs.AuditLog, data, {
        removeOnFail: {
          count: 3
        },
        removeOnComplete: true
      });
    }
  };

  if (appCfg.SHOULD_INIT_PG_QUEUE) {
    await queueService.startPg<QueueName.AuditLog>(
      QueueJobs.AuditLog,
      async ([job]) => {
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

        const auditLog = await auditLogDAL.create({
          actor: actor.type,
          actorMetadata: actor.metadata,
          userAgent,
          projectId,
          projectName: project?.name,
          ipAddress,
          orgId,
          eventType: event.type,
          expiresAt: new Date(Date.now() + ttl),
          eventMetadata: event.metadata,
          userAgentType
        });

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
                      crypto
                        .encryption()
                        .symmetric()
                        .decryptWithRootEncryptionKey({
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

              try {
                const response = await request.post(
                  url,
                  { ...providerSpecificPayload(url), ...auditLog },
                  {
                    headers,
                    // request timeout
                    timeout: AUDIT_LOG_STREAM_TIMEOUT,
                    // connection timeout
                    signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
                  }
                );
                return response;
              } catch (error) {
                logger.error(
                  `Failed to stream audit log [url=${url}] for org [orgId=${orgId}] [error=${(error as AxiosError).message}]`
                );
                return error;
              }
            }
          )
        );
      },
      {
        batchSize: 1,
        workerCount: 30,
        pollingIntervalSeconds: 0.5
      }
    );
  }

  queueService.start(QueueName.AuditLog, async (job) => {
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

    const auditLog = await auditLogDAL.create({
      actor: actor.type,
      actorMetadata: actor.metadata,
      userAgent,
      projectId,
      projectName: project?.name,
      ipAddress,
      orgId,
      eventType: event.type,
      expiresAt: new Date(Date.now() + ttl),
      eventMetadata: event.metadata,
      userAgentType
    });

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
                  crypto
                    .encryption()
                    .symmetric()
                    .decryptWithRootEncryptionKey({
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

          try {
            const response = await request.post(
              url,
              { ...providerSpecificPayload(url), ...auditLog },
              {
                headers,
                // request timeout
                timeout: AUDIT_LOG_STREAM_TIMEOUT,
                // connection timeout
                signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
              }
            );
            return response;
          } catch (error) {
            logger.error(
              `Failed to stream audit log [url=${url}] for org [orgId=${orgId}] [error=${(error as AxiosError).message}]`
            );
            return error;
          }
        }
      )
    );
  });

  return {
    pushToLog
  };
};
