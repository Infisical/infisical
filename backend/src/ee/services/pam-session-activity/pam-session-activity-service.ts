import { TAuditLogStreams } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TAuditLogStreamOutboxServiceFactory } from "../audit-log-stream-outbox/audit-log-stream-outbox-service";
import { TAuditLogStreamDALFactory } from "../audit-log-stream/audit-log-stream-dal";
import { TAuditLogStreamFilters } from "../audit-log-stream/audit-log-stream-schemas";
import { TPamSessionChunkServiceFactory } from "../pam-session-recording/pam-recording-chunk-service";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamAccountType } from "../pam/pam-enums";
import {
  buildPamSessionActivityEvents,
  buildPamSessionActivitySkippedEvent,
  toPamSessionActivityStreamEvent
} from "./pam-session-activity-fns";
import { PamSessionActivitySkipReason } from "./pam-session-activity-types";

// Each job holds a whole chunk in memory while it decrypts and parses it.
const EXPORT_WORKER_CONCURRENCY = 2;
const EXPORT_ATTEMPTS = 5;
const EXPORT_BACKOFF_MS = 10_000;
// Keeps each insert transaction bounded.
const OUTBOX_ROWS_PER_INSERT = 5_000;

// Windows sessions record RDP frames, which hold no commands, and they are the largest chunks.
const ACCOUNT_TYPES_WITHOUT_ACTIVITY = new Set<string>([PamAccountType.Windows, PamAccountType.WindowsAd]);

type TPamSessionActivityServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  auditLogStreamDAL: Pick<TAuditLogStreamDALFactory, "find" | "primaryNode">;
  auditLogStreamOutboxService: Pick<TAuditLogStreamOutboxServiceFactory, "enqueueStreamEvents">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "findById">;
  pamSessionChunkService: Pick<TPamSessionChunkServiceFactory, "readChunkEvents">;
};

type TChunkExport = { orgId: string; sessionId: string; chunkIndex: number };

export type TPamSessionActivityServiceFactory = ReturnType<typeof pamSessionActivityServiceFactory>;

const getSessionActivityFilter = (stream: Pick<TAuditLogStreams, "filters">) =>
  (stream.filters as TAuditLogStreamFilters | null)?.pamSessionActivity ?? null;

export const pamSessionActivityServiceFactory = ({
  queueService,
  auditLogStreamDAL,
  auditLogStreamOutboxService,
  pamSessionDAL,
  pamSessionChunkService
}: TPamSessionActivityServiceFactoryDep) => {
  // From the primary, since a chunk skipped on a replica that hasn't seen a stream turn activity on is never revisited.
  const findActivityStreams = async (orgId: string) =>
    (await auditLogStreamDAL.find({ orgId }, { tx: auditLogStreamDAL.primaryNode() })).filter((stream) =>
      getSessionActivityFilter(stream)
    );

  // Errors fail the upload on purpose, so the gateway re-sends the chunk and this runs again.
  const queueChunkExport = async ({ orgId, sessionId, chunkIndex }: TChunkExport) => {
    const appCfg = getConfig();
    if (!appCfg.AUDIT_LOG_STREAMS_ENABLED || appCfg.DISABLE_AUDIT_LOG_GENERATION) return;

    const streams = await findActivityStreams(orgId);
    if (streams.length === 0) return;

    await queueService.queue(
      QueueName.PamSessionActivityExport,
      QueueJobs.PamSessionActivityExport,
      { orgId, sessionId, chunkIndex },
      {
        jobId: `pam-session-activity-${sessionId}-${chunkIndex}`,
        attempts: EXPORT_ATTEMPTS,
        backoff: { type: "exponential", delay: EXPORT_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: true
      }
    );
  };

  // Re-read so a stream removed while the job waited gets nothing.
  const exportChunk = async ({ orgId, sessionId, chunkIndex }: TChunkExport) => {
    const streams = await findActivityStreams(orgId);
    if (streams.length === 0) return;

    const session = await pamSessionDAL.findById(sessionId);
    if (!session?.encryptedSessionKey) {
      // A chunk was just stored, so the key exists and this is replica lag worth retrying.
      throw new NotFoundError({ message: `Recording for session ${sessionId} not found` });
    }
    if (ACCOUNT_TYPES_WITHOUT_ACTIVITY.has(session.accountType)) return;

    const chunk = await pamSessionChunkService.readChunkEvents({ session, chunkIndex });
    if (!chunk) return;

    const activity =
      "tooLarge" in chunk
        ? [
            buildPamSessionActivitySkippedEvent({
              session,
              orgId,
              chunkIndex,
              reason: PamSessionActivitySkipReason.ChunkTooLarge
            })
          ]
        : buildPamSessionActivityEvents({ session, orgId, chunkIndex, events: chunk.events });

    const rows = streams.flatMap((stream) => {
      const includeOutput = Boolean(getSessionActivityFilter(stream)?.includeOutput);
      return activity.flatMap((event) => {
        const payload = toPamSessionActivityStreamEvent(event, includeOutput);
        return payload ? [{ stream, payload }] : [];
      });
    });

    for (const batch of chunkArray(rows, OUTBOX_ROWS_PER_INSERT)) {
      // eslint-disable-next-line no-await-in-loop
      await auditLogStreamOutboxService.enqueueStreamEvents(batch);
    }
  };

  // Lets a SIEM see a chunk whose activity is never sent.
  const reportFailedExport = async ({ orgId, sessionId, chunkIndex }: TChunkExport) => {
    const streams = await findActivityStreams(orgId);
    const session = streams.length > 0 ? await pamSessionDAL.findById(sessionId) : null;
    if (!session) return;

    const skipped = buildPamSessionActivitySkippedEvent({
      session,
      orgId,
      chunkIndex,
      reason: PamSessionActivitySkipReason.ExportFailed
    });
    await auditLogStreamOutboxService.enqueueStreamEvents(streams.map((stream) => ({ stream, payload: skipped })));
  };

  const init = () => {
    queueService.start(
      QueueName.PamSessionActivityExport,
      async (job) => {
        const { orgId, sessionId, chunkIndex } = job.data;
        try {
          await exportChunk({ orgId, sessionId, chunkIndex });
        } catch (error) {
          logger.error(
            error,
            `pam-session-activity: chunk export failed [orgId=${orgId}] [sessionId=${sessionId}] [chunkIndex=${chunkIndex}] [attempt=${job.attemptsMade + 1}]`
          );
          if (job.attemptsMade + 1 >= EXPORT_ATTEMPTS) {
            await reportFailedExport({ orgId, sessionId, chunkIndex }).catch((reportError) =>
              logger.error(
                reportError,
                `pam-session-activity: failed to report a failed chunk export [orgId=${orgId}] [sessionId=${sessionId}] [chunkIndex=${chunkIndex}]`
              )
            );
          }
          throw error;
        }
      },
      { concurrency: EXPORT_WORKER_CONCURRENCY }
    );
  };

  return { queueChunkExport, init };
};
