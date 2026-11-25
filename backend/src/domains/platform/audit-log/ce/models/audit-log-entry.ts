import { RuleViolationError } from "@app/domains/lib/errors";

import type { TAuditLogActorRecord } from "./audit-log-actor";
import { AuditLogPolicy } from "./audit-log-policy";
import type { TAuditLogEvent } from "./catalog";
import type { UserAgentType } from "./event-type";

// One audit log as it sits in the buffer. This is the JSON old and new pods read from the same Redis stream during a
// rolling deploy, so a field may be added but never renamed or removed. `id` and `createdAt` are fixed when the event
// is recorded, so a retried batch re-inserts the same rows; the dates are ISO strings.
export type TAuditLogEntryRecord = {
  id: string;
  orgId: string;
  projectId?: string;
  projectName?: string;
  actor: TAuditLogActorRecord;
  event: TAuditLogEvent;
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
  createdAt: string;
  expiresAt: string;
};

export type TCreateAuditLogEntryInput = Omit<TAuditLogEntryRecord, "orgId" | "createdAt" | "expiresAt"> & {
  orgId: string | undefined;
  createdAt: Date;
  policy: AuditLogPolicy;
};

export class AuditLogEntry {
  private constructor(private readonly record: TAuditLogEntryRecord) {}

  // null when the policy doesn't keep the event: the plan keeps no logs, or its class is switched off.
  static create({ policy, createdAt, orgId, ...input }: TCreateAuditLogEntryInput): AuditLogEntry | null {
    if (!orgId) {
      throw new RuleViolationError({
        message: `Audit log for event '${input.event.type}' has no organization. Record it in an organization's context.`
      });
    }
    if (!policy.keeps(input.event.type)) return null;

    return new AuditLogEntry({
      ...input,
      orgId,
      createdAt: createdAt.toISOString(),
      expiresAt: policy.expiresAt(createdAt).toISOString()
    });
  }

  get eventType(): string {
    return this.record.event.type;
  }

  get actorType(): string {
    return this.record.actor.type;
  }

  toJSON(): TAuditLogEntryRecord {
    return this.record;
  }
}
