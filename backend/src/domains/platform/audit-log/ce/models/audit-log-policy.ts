import { AuditLogEventClass, getAuditLogEventClass, isAlwaysRecordedEventClass } from "./event-class";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

// ClickHouse stores expiresAt as a non-nullable DateTime64 and its TTL casts it with toDateTime, which overflows
// after 2106-02-07, so even unlimited retention needs a concrete expiry below that.
const MAX_EXPIRES_AT = new Date("2100-01-01T00:00:00.000Z");

export type TAuditLogPolicyRecord = {
  // The plan's retention: null keeps logs without limit, 0 keeps none.
  retentionDays: number | null;
  // The project's own retention, honored only within the plan's.
  projectRetentionDays?: number | null;
  // The switchable classes' state where the event happens. Needed only for a switchable class.
  eventClasses?: { authentication: boolean; authorization: boolean };
};

// Whether an audit event is kept, and until when. Built per event from the org's and the project's configuration.
export class AuditLogPolicy {
  static readonly MAX_EXPIRES_AT = MAX_EXPIRES_AT;

  private constructor(
    private readonly retentionDays: number | null,
    private readonly projectRetentionDays: number | null,
    private readonly eventClasses: TAuditLogPolicyRecord["eventClasses"]
  ) {}

  static create(record: TAuditLogPolicyRecord): AuditLogPolicy {
    return new AuditLogPolicy(record.retentionDays, record.projectRetentionDays ?? null, record.eventClasses);
  }

  // A project may set any retention up to its plan's; an unlimited plan allows any.
  static isWithinPlan(days: number, planRetentionDays: number | null): boolean {
    return planRetentionDays === null || days <= planRetentionDays;
  }

  // Whether the event's class has to be looked up before deciding.
  static needsEventClasses(eventType: string): boolean {
    return !isAlwaysRecordedEventClass(getAuditLogEventClass(eventType));
  }

  get keepsLogs(): boolean {
    return this.retentionDays === null || this.retentionDays > 0;
  }

  keeps(eventType: string): boolean {
    if (!this.keepsLogs) return false;
    const eventClass = getAuditLogEventClass(eventType);
    if (isAlwaysRecordedEventClass(eventClass)) return true;
    // No switches given: record it, as the legacy writer did when it couldn't read the settings.
    if (!this.eventClasses) return true;
    return eventClass === AuditLogEventClass.Authorization
      ? this.eventClasses.authorization
      : this.eventClasses.authentication;
  }

  expiresAt(createdAt: Date): Date {
    const days =
      this.projectRetentionDays && AuditLogPolicy.isWithinPlan(this.projectRetentionDays, this.retentionDays)
        ? this.projectRetentionDays
        : this.retentionDays;
    if (days === null) return MAX_EXPIRES_AT;
    return new Date(Math.min(createdAt.getTime() + days * MS_IN_DAY, MAX_EXPIRES_AT.getTime()));
  }

  toJSON(): TAuditLogPolicyRecord {
    return {
      retentionDays: this.retentionDays,
      projectRetentionDays: this.projectRetentionDays,
      eventClasses: this.eventClasses
    };
  }
}
