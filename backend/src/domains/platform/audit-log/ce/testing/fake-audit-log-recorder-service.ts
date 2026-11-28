import type { TActorContext } from "@app/domains/lib/actor-context";

import type {
  TAuditLogRecorderService,
  TRecordAuditLogInput,
  TRecordResolvedAuditLogInput
} from "../services/audit-log-recorder/service";

// For tests of code that records audit logs: keeps what was recorded, with no policy applied.
export class FakeAuditLogRecorderService implements TAuditLogRecorderService {
  recorded: { orgId: string; input: TRecordAuditLogInput }[] = [];

  recordedResolved: TRecordResolvedAuditLogInput[] = [];

  async record(actor: TActorContext, input: TRecordAuditLogInput): Promise<void> {
    this.recorded.push({ orgId: actor.org.id, input });
  }

  async recordOrThrow(actor: TActorContext, input: TRecordAuditLogInput): Promise<void> {
    this.recorded.push({ orgId: actor.org.id, input });
  }

  async recordResolved(input: TRecordResolvedAuditLogInput): Promise<void> {
    this.recordedResolved.push(input);
  }

  get eventTypes(): string[] {
    return [...this.recorded.map(({ input }) => input.event.type), ...this.recordedResolved.map((r) => r.event.type)];
  }
}
