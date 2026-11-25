import type { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { logger } from "@app/lib/logger";

import { AuditLogActor, type TAuditLogActorRecord } from "../../models/audit-log-actor";
import { AuditLogEntry } from "../../models/audit-log-entry";
import { AuditLogPolicy, type TAuditLogPolicyRecord } from "../../models/audit-log-policy";
import type { TAuditLogEvent } from "../../models/catalog";
import type { UserAgentType } from "../../models/event-type";
import type { TAuditLogBuffer, TAuditLogIdGenerator, TAuditLogMetrics } from "../dependencies";

export type TRecordAuditLogInput = {
  event: TAuditLogEvent;
  // Omit for an org-level event.
  projectId?: string;
  // Defaults to the actor context's principal.
  actor?: TAuditLogActorRecord;
  // Default to the request's, from the actor context.
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
};

// For the legacy adapter, which resolves the org, project and settings itself and has no actor context.
export type TRecordResolvedAuditLogInput = {
  orgId: string;
  project?: { id: string; name?: string };
  policy: TAuditLogPolicyRecord;
  event: TAuditLogEvent;
  actor: TAuditLogActorRecord;
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
};

export type TAuditLogRecorderService = {
  // At most once: a failure to record is logged and counted, never thrown, so it can't fail the caller's request.
  record(actor: TActorContext, input: TRecordAuditLogInput): Promise<void>;
  // Throws instead, for a caller that retries.
  recordOrThrow(actor: TActorContext, input: TRecordAuditLogInput): Promise<void>;
  // Throws on failure; the legacy adapter decides whether to swallow.
  recordResolved(input: TRecordResolvedAuditLogInput): Promise<void>;
};

export class AuditLogRecorderService implements TAuditLogRecorderService {
  constructor(
    private readonly auditLogBuffer: TAuditLogBuffer,
    private readonly idGenerator: TAuditLogIdGenerator,
    private readonly metrics: TAuditLogMetrics
  ) {}

  async record(actor: TActorContext, input: TRecordAuditLogInput): Promise<void> {
    try {
      await this.recordOrThrow(actor, input);
    } catch (error) {
      const orgId = actor.org.id;
      this.metrics.recordDropped({
        eventType: input.event.type,
        actorType: input.actor?.type ?? actor.principal.type,
        reason: error instanceof EntityNotFoundError ? "recording_refused" : "ingest_stream_push_failed",
        orgId
      });
      logger.error(
        error,
        `audit-log: dropped audit log [event=${input.event.type}] [orgId=${orgId}] [projectId=${input.projectId}]`
      );
    }
  }

  async recordOrThrow(actor: TActorContext, input: TRecordAuditLogInput): Promise<void> {
    const { audit } = actor;
    const orgConfig = await audit.org();
    const project = input.projectId ? await audit.project(input.projectId) : null;
    if (input.projectId && !project) {
      throw new EntityNotFoundError({
        message: `Project with ID '${input.projectId}' not found in organization '${actor.org.id}'`
      });
    }
    const eventClasses = AuditLogPolicy.needsEventClasses(input.event.type)
      ? await audit.eventClasses(input.projectId)
      : undefined;
    const origin = audit.origin();

    const createdAt = new Date();
    const entry = AuditLogEntry.create({
      policy: AuditLogPolicy.create({
        retentionDays: orgConfig.retentionDays,
        projectRetentionDays: project?.retentionDays,
        eventClasses
      }),
      id: this.idGenerator.next(createdAt),
      createdAt,
      orgId: actor.org.id,
      ...(input.projectId && project ? { projectId: input.projectId, projectName: project.name } : {}),
      actor: input.actor ?? AuditLogActor.fromPrincipal(actor.principal, origin.permissionMetadata).toJSON(),
      event: input.event,
      ipAddress: input.ipAddress ?? origin.ipAddress,
      userAgent: input.userAgent ?? origin.userAgent,
      userAgentType: input.userAgentType ?? (origin.userAgentType as UserAgentType | undefined)
    });
    await this.append(entry);
  }

  async recordResolved({ orgId, project, policy, ...input }: TRecordResolvedAuditLogInput): Promise<void> {
    const createdAt = new Date();
    const entry = AuditLogEntry.create({
      ...input,
      policy: AuditLogPolicy.create(policy),
      id: this.idGenerator.next(createdAt),
      createdAt,
      orgId,
      ...(project ? { projectId: project.id, ...(project.name ? { projectName: project.name } : {}) } : {})
    });
    await this.append(entry);
  }

  private async append(entry: AuditLogEntry | null): Promise<void> {
    if (!entry) return;
    await this.auditLogBuffer.append(entry);
    this.metrics.recordEnqueued({ eventType: entry.eventType, actorType: entry.actorType });
  }
}
