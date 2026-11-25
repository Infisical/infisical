import {
  AuditLogPolicy,
  type TAuditLogRecorderService,
  type TRecordResolvedAuditLogInput
} from "@app/domains/platform/audit-log/ce/module";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { auditLogDroppedCounter } from "@app/lib/telemetry/metrics";
import type { TAuditConfigSource } from "@app/server/lib/audit-config-source";

import { TCreateAuditLogDTO } from "./audit-log-types";

type TAuditLogQueueServiceFactoryDep = {
  auditLogRecorderService: TAuditLogRecorderService;
  auditConfigSource: TAuditConfigSource;
};

export type TAuditLogQueueServiceFactory = {
  pushToLog: (data: TCreateAuditLogDTO) => Promise<void>;
  pushToLogOrThrow: (data: TCreateAuditLogDTO) => Promise<void>;
};

// keep this timeout 5s it must be fast because else the queue will take time to finish
// audit log is a crowded queue thus needs to be fast
export const AUDIT_LOG_STREAM_TIMEOUT = 5 * 1000;

// batch deliveries can carry up to AUDIT_LOG_STREAM_BATCH_SIZE events to remote intakes;
// give them more headroom than the single-event ping timeout above.
export const AUDIT_LOG_STREAM_BATCH_TIMEOUT = 30 * 1000;

// The legacy writer over the audit log domain's recorder. Callers pass a DTO with an org or a project; this resolves
// the org, the project and the settings (per request, then cached) and records it through the same policy the
// domain uses. Storing the buffer is the audit log domain's ingestion (domains/platform/audit-log/ee).
export const auditLogQueueServiceFactory = ({
  auditLogRecorderService,
  auditConfigSource
}: TAuditLogQueueServiceFactoryDep): TAuditLogQueueServiceFactory => {
  const resolve = async (data: TCreateAuditLogDTO): Promise<TRecordResolvedAuditLogInput | null> => {
    const { projectId } = data;
    if (!data.orgId && !projectId) {
      logger.error(`audit-log-queue: Skipping entry with neither orgId nor projectId [event=${data.event?.type}]`);
      return null;
    }

    // Loaded whenever there is a project, orgId or not: its retention and name belong on the log.
    const project = projectId
      ? await requestMemoize(requestMemoKeys.auditLogProjectConfig(projectId), () =>
          auditConfigSource.findProjectConfig(projectId)
        )
      : null;
    // With the org known, a hard-deleted project's logs (its deletion included) are still recorded, under the plan's
    // retention. Without it there is no org to record them in.
    if (projectId && !project && !data.orgId) {
      logger.error(
        `audit-log-queue: Skipping entry, project was deleted [projectId=${projectId}] [event=${data.event?.type}]`
      );
      return null;
    }

    const orgId = data.orgId ?? project?.orgId;
    if (!orgId) return null;

    const [orgConfig, eventClasses] = await Promise.all([
      requestMemoize(requestMemoKeys.auditLogOrgConfig(orgId), () => auditConfigSource.forOrg(orgId)),
      AuditLogPolicy.needsEventClasses(data.event.type)
        ? requestMemoize(requestMemoKeys.auditLogEventClasses(orgId, projectId), () =>
            auditConfigSource.eventClasses(orgId, projectId)
          )
        : undefined
    ]);

    return {
      orgId,
      ...(projectId ? { project: { id: projectId, name: project?.name } } : {}),
      policy: {
        retentionDays: orgConfig.retentionDays,
        projectRetentionDays: project?.retentionDays,
        eventClasses
      },
      event: data.event,
      actor: data.actor,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      userAgentType: data.userAgentType
    };
  };

  const pushToLogOrThrow = async (data: TCreateAuditLogDTO) => {
    const resolved = await resolve(data);
    if (!resolved) return;
    await auditLogRecorderService.recordResolved(resolved);
  };

  // Request-path push: a transient Redis/DB failure must not fail the request that produced
  // the audit event, so errors (resolution lookups included) are logged and swallowed
  // (at-most-once on this path).
  const pushToLog = async (data: TCreateAuditLogDTO) => {
    try {
      await pushToLogOrThrow(data);
    } catch (error) {
      logger.error(
        error,
        `audit-log-queue: Dropped audit log: failed to push to ingest stream (at-most-once on request path) [event=${data.event?.type}] [orgId=${data.orgId}] [projectId=${data.projectId}]`
      );
      auditLogDroppedCounter.add(1, {
        "audit_log.event_type": data.event?.type ?? "unknown",
        "audit_log.actor_type": data.actor?.type ?? "unknown",
        "audit_log.drop_reason": "ingest_stream_push_failed",
        ...(data.orgId ? { "infisical.organization.id": data.orgId } : {})
      });
    }
  };

  return {
    pushToLog,
    pushToLogOrThrow
  };
};
