import { RuleViolationError } from "@app/domains/lib/errors";

import type { TAuditLogActorRecord } from "./audit-log-actor";
import type { AuditLogPolicy } from "./audit-log-policy";
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

export class AuditLogEntry {
  private constructor(
    private readonly id: string,
    private readonly orgId: string,
    private readonly projectId: string | undefined,
    private readonly projectName: string | undefined,
    private readonly actor: TAuditLogActorRecord,
    private readonly event: TAuditLogEvent,
    private readonly ipAddress: string | undefined,
    private readonly userAgent: string | undefined,
    private readonly userAgentType: UserAgentType | undefined,
    private readonly createdAt: Date,
    private readonly expiresAt: Date
  ) {}

  // null when the policy doesn't keep the event: the plan keeps no logs, or its class is switched off.
  static create({
    policy,
    createdAt,
    orgId,
    ...record
  }: Omit<TAuditLogEntryRecord, "orgId" | "createdAt" | "expiresAt"> & {
    orgId: string | undefined;
    createdAt: Date;
    policy: AuditLogPolicy;
  }): AuditLogEntry | null {
    if (!orgId) {
      throw new RuleViolationError({
        message: `Audit log for event '${record.event.type}' has no organization. Record it in an organization's context.`
      });
    }
    if (!policy.keeps(record.event.type)) return null;

    return new AuditLogEntry(
      record.id,
      orgId,
      record.projectId,
      record.projectName,
      record.actor,
      record.event,
      record.ipAddress,
      record.userAgent,
      record.userAgentType,
      createdAt,
      policy.expiresAt(createdAt)
    );
  }

  get eventType(): string {
    return this.event.type;
  }

  get actorType(): string {
    return this.actor.type;
  }

  // Unset optional fields are left out, so the JSON holds only what was recorded.
  toJSON(): TAuditLogEntryRecord {
    return {
      id: this.id,
      orgId: this.orgId,
      ...(this.projectId !== undefined ? { projectId: this.projectId } : {}),
      ...(this.projectName !== undefined ? { projectName: this.projectName } : {}),
      actor: this.actor,
      event: this.event,
      ...(this.ipAddress !== undefined ? { ipAddress: this.ipAddress } : {}),
      ...(this.userAgent !== undefined ? { userAgent: this.userAgent } : {}),
      ...(this.userAgentType !== undefined ? { userAgentType: this.userAgentType } : {}),
      createdAt: this.createdAt.toISOString(),
      expiresAt: this.expiresAt.toISOString()
    };
  }
}
