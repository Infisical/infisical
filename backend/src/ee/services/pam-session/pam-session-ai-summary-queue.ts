import { TPamResourceDALFactory } from "@app/ee/services/pam-resource/pam-resource-dal";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamSessionDALFactory } from "./pam-session-dal";
import { TPamSessionEventBatchDALFactory } from "./pam-session-event-batch-dal";
import { decryptSessionCommandLogs } from "./pam-session-fns";
import {
  buildSummaryPrompt,
  formatLogsForSummary,
  generateSessionSummary,
  MAX_LOG_CHARS
} from "./pam-session-summary-fns";
import { TPamSessionCommandLog, TTerminalEvent } from "./pam-session-types";

type TSessionSummaryConfig = {
  aiInsightsEnabled: boolean;
  connectionId: string;
  model: string;
};

type TPamSessionAiSummaryServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pamSessionDAL: Pick<TPamSessionDALFactory, "findById" | "updateById">;
  pamSessionEventBatchDAL: Pick<TPamSessionEventBatchDALFactory, "findBySessionIdPaginated">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TPamSessionAiSummaryServiceFactory = ReturnType<typeof pamSessionAiSummaryServiceFactory>;

export const pamSessionAiSummaryServiceFactory = ({
  queueService,
  pamSessionDAL,
  pamSessionEventBatchDAL,
  pamResourceDAL,
  appConnectionDAL,
  kmsService
}: TPamSessionAiSummaryServiceFactoryDep) => {
  const queueAiSummary = async (sessionId: string, projectId: string) => {
    // Check if AI insights is enabled for this session's resource before touching the DB or queue
    const session = await pamSessionDAL.findById(sessionId);
    if (!session) return;

    const { resourceId } = session;
    if (!resourceId) return;

    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) return;

    const { encryptedSessionSummaryConfig: encryptedConfig } = resource;
    if (!encryptedConfig) return;

    let summaryConfig: TSessionSummaryConfig;
    try {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      summaryConfig = JSON.parse(decryptor({ cipherTextBlob: encryptedConfig }).toString()) as TSessionSummaryConfig;
    } catch (err) {
      logger.warn(
        { sessionId, err },
        `queueAiSummary: failed to decrypt sessionSummaryConfig, skipping [sessionId=${sessionId}]`
      );
      return;
    }

    if (!summaryConfig.aiInsightsEnabled) return;

    // AI is enabled — enqueue first, then mark pending only on successful enqueue
    await queueService.queue(
      QueueName.PamSessionAiSummary,
      QueueJobs.PamSessionAiSummary,
      { sessionId, projectId },
      {
        jobId: `pam-session-ai-summary-${sessionId}`,
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 }
      }
    );
    await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: "pending" });
  };

  const appCfg = getConfig();

  const init = () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(QueueName.PamSessionAiSummary, async (job) => {
      const { sessionId, projectId } = job.data;

      logger.info({ sessionId }, `${QueueName.PamSessionAiSummary}: starting AI summary [sessionId=${sessionId}]`);

      try {
        // 1. Fetch session
        const session = await pamSessionDAL.findById(sessionId);
        if (!session) {
          logger.warn(
            { sessionId },
            `${QueueName.PamSessionAiSummary}: session not found, skipping [sessionId=${sessionId}]`
          );
          return;
        }

        // 2. Skip if no resourceId (resource was deleted)
        const { resourceId } = session;
        if (!resourceId) {
          logger.info(
            { sessionId },
            `${QueueName.PamSessionAiSummary}: no resourceId on session (resource deleted?), skipping [sessionId=${sessionId}]`
          );
          await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
          return;
        }

        // 3. Fetch resource and decrypt sessionSummaryConfig
        const resource = await pamResourceDAL.findById(resourceId);
        if (!resource) {
          logger.info(
            { sessionId, resourceId },
            `${QueueName.PamSessionAiSummary}: resource not found, skipping [sessionId=${sessionId}] [resourceId=${resourceId}]`
          );
          await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
          return;
        }

        const { encryptedSessionSummaryConfig: encryptedConfig } = resource;

        if (!encryptedConfig) {
          logger.info(
            { sessionId, resourceId },
            `${QueueName.PamSessionAiSummary}: no sessionSummaryConfig on resource, skipping [sessionId=${sessionId}] [resourceId=${resourceId}]`
          );
          await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
          return;
        }

        let summaryConfig: TSessionSummaryConfig;
        try {
          const { decryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId
          });
          summaryConfig = JSON.parse(decryptor({ cipherTextBlob: encryptedConfig }).toString()) as TSessionSummaryConfig;
        } catch (err) {
          logger.error(
            { sessionId, err },
            `${QueueName.PamSessionAiSummary}: failed to decrypt sessionSummaryConfig [sessionId=${sessionId}]`
          );
          await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
          return;
        }

        if (!summaryConfig.aiInsightsEnabled) {
          logger.info(
            { sessionId },
            `${QueueName.PamSessionAiSummary}: AI insights disabled for resource, skipping [sessionId=${sessionId}]`
          );
          await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
          return;
        }

        // 4. Fetch app connection and decrypt credentials
        const appConnection = await appConnectionDAL.findById(summaryConfig.connectionId);
        if (!appConnection) {
          await pamSessionDAL.updateById(sessionId, {
            aiInsightsStatus: "failed",
            aiInsightsError: "Configured AI app connection not found"
          });
          return;
        }

        let apiKey: string;
        try {
          const credentials = await decryptAppConnectionCredentials({
            orgId: appConnection.orgId,
            encryptedCredentials: appConnection.encryptedCredentials,
            kmsService,
            projectId: appConnection.projectId
          });
          apiKey = (credentials as { apiKey: string }).apiKey;
        } catch (err) {
          logger.error(
            { sessionId, err },
            `${QueueName.PamSessionAiSummary}: failed to decrypt connection credentials [sessionId=${sessionId}]`
          );
          await pamSessionDAL.updateById(sessionId, {
            aiInsightsStatus: "failed",
            aiInsightsError: "Failed to decrypt AI connection credentials"
          });
          return;
        }

        // 5. Decrypt session logs — batch table first (new), fall back to legacy blob.
        // Stop decrypting once accumulated content exceeds MAX_LOG_CHARS — there is no point
        // loading more data than formatLogsForSummary will use, and this bounds memory usage
        // to the content budget rather than an arbitrary batch count.
        let logs;
        try {
          const PAGE_SIZE = 20;
          let offset = 0;
          let contentChars = 0;
          const accumulatedLogs: (TPamSessionCommandLog | TTerminalEvent)[] = [];
          let hasMoreBatches = true;

          const { decryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId
          });

          while (hasMoreBatches && contentChars < MAX_LOG_CHARS) {
            // eslint-disable-next-line no-await-in-loop
            const page = await pamSessionEventBatchDAL.findBySessionIdPaginated(sessionId, { offset, limit: PAGE_SIZE });
            if (page.length === 0) break;
            for (const batch of page) {
              const plain = decryptor({ cipherTextBlob: batch.encryptedEventsBlob });
              const batchEvents = JSON.parse(plain.toString()) as (TPamSessionCommandLog | TTerminalEvent)[];
              // For SSH, only input events are used by formatLogsForSummary — count only those bytes
              // to avoid premature truncation from output/resize/error events that are discarded.
              // For Postgres, every event is a command log so count all of them.
              const isSsh = resource.resourceType === PamResource.SSH;
              for (const event of batchEvents) {
                if (isSsh) {
                  const termEvent = event as TTerminalEvent;
                  if (termEvent.eventType === "input")
                  contentChars += termEvent.data ? Buffer.from(termEvent.data, "base64").length : 0;
                } else {
                  const cmdLog = event as TPamSessionCommandLog;
                  contentChars += (cmdLog.input?.length ?? 0) + (cmdLog.output?.length ?? 0);
                }
              }
              accumulatedLogs.push(...batchEvents);
              if (contentChars >= MAX_LOG_CHARS) break;
            }
            if (page.length < PAGE_SIZE) hasMoreBatches = false;
            offset += PAGE_SIZE;
          }

          if (contentChars >= MAX_LOG_CHARS) {
            logger.info(
              { sessionId },
              `${QueueName.PamSessionAiSummary}: session logs exceed size limit, skipping AI summary [sessionId=${sessionId}]`
            );
            await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
            return;
          }

          if (accumulatedLogs.length > 0) {
            logs = accumulatedLogs;
          } else if (session.encryptedLogsBlob) {
            logs = await decryptSessionCommandLogs({ projectId, encryptedLogs: session.encryptedLogsBlob, kmsService });
          } else {
            logger.info(
              { sessionId },
              `${QueueName.PamSessionAiSummary}: no session logs, skipping [sessionId=${sessionId}]`
            );
            await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
            return;
          }

          if (logs.length === 0) {
            await pamSessionDAL.updateById(sessionId, { aiInsightsStatus: null });
            return;
          }
        } catch (err) {
          logger.error(
            { sessionId, err },
            `${QueueName.PamSessionAiSummary}: failed to decrypt session logs [sessionId=${sessionId}]`
          );
          await pamSessionDAL.updateById(sessionId, {
            aiInsightsStatus: "failed",
            aiInsightsError: "Failed to decrypt session logs"
          });
          return;
        }

        // 6. Format logs, build prompt, and generate summary
        try {
          const resourceType = resource.resourceType as PamResource;
          const durationSeconds = session.endedAt
            ? (new Date(session.endedAt).getTime() - new Date(session.createdAt).getTime()) / 1000
            : 0;

          const formattedLogs = formatLogsForSummary(logs, resourceType);
          const { system, user } = buildSummaryPrompt({
            resourceType,
            resourceName: resource.name,
            actorName: session.actorName,
            actorEmail: session.actorEmail,
            durationSeconds,
            formattedLogs
          });

          const { summary, warnings } = await generateSessionSummary(apiKey, summaryConfig.model, system, user);

          const { encryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId
          });

          const { cipherTextBlob: encryptedAiInsights } = encryptor({
            plainText: Buffer.from(JSON.stringify({ summary, warnings }))
          });

          await pamSessionDAL.updateById(sessionId, {
            encryptedAiInsights,
            aiInsightsStatus: "completed",
            aiInsightsError: null
          });

          logger.info(
            { sessionId },
            `${QueueName.PamSessionAiSummary}: AI summary completed successfully [sessionId=${sessionId}]`
          );
        } catch (err) {
          const message =
            err instanceof Error && err.message.length < 500
              ? err.message
              : "AI summarization failed. The session logs may be too large for the selected model.";

          logger.error(
            { sessionId, err },
            `${QueueName.PamSessionAiSummary}: AI summarization failed [sessionId=${sessionId}]`
          );

          await pamSessionDAL.updateById(sessionId, {
            aiInsightsStatus: "failed",
            aiInsightsError: message
          });
        }
      } catch (err) {
        logger.error(
          { sessionId, err },
          `${QueueName.PamSessionAiSummary}: unexpected worker error [sessionId=${sessionId}]`
        );
        try {
          await pamSessionDAL.updateById(sessionId, {
            aiInsightsStatus: "failed",
            aiInsightsError: "Unexpected error during AI summarization"
          });
        } catch {
          // best-effort status reset
        }
      }
    });
  };

  return { queueAiSummary, init };
};
