import type { TDomainKeyStore } from "@app/domains/lib/key-store";

import { OtelMetricsClient } from "./clients/otel-metrics/client";
import { AuditLogBuffer } from "./data-access/audit-log-buffer";
import { AuditLogActor } from "./models/audit-log-actor";
import { AuditLogRecorderService, TAuditLogRecorderService } from "./services/audit-log-recorder/service";
import { AuditLogIdGenerator } from "./services/helpers/audit-log-id-generator";

export type {
  AcmeAccountActor,
  AcmeProfileActor,
  AgentVaultProxyActor,
  EstAccountActor,
  GatewayActor,
  IdentityActor,
  KmipClientActor,
  KmipServerActor,
  MicrosoftAutoenrollmentAccountActor,
  PlatformActor,
  RelayActor,
  ScepAccountActor,
  ScimClientActor,
  ServiceActor,
  TAuditLogActorRecord,
  TAuditLogRequestActorRecord,
  UnknownUserActor,
  UserActor
} from "./models/audit-log-actor";
export { AuditLogActor };
export type { TAuditLogEntryRecord } from "./models/audit-log-entry";
export { AuditLogPolicy } from "./models/audit-log-policy";
export type { TAuditLogPolicyRecord } from "./models/audit-log-policy";
export type {
  TAuditLogRecorderService,
  TRecordAuditLogInput,
  TRecordResolvedAuditLogInput
} from "./services/audit-log-recorder/service";
export type { TAuditLogBuffer, TBufferedAuditLog } from "./services/dependencies";
export {
  ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES,
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASS_MEMBERS,
  AUDIT_LOG_EVENT_CLASSES,
  AuditLogEventClass,
  CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES,
  getAuditLogEventClass,
  getEventTypesForClasses,
  isAlwaysRecordedEventClass,
  resolveEventClassFilter
} from "./models/event-class";
export type { TConfigurableAuditLogEventClass } from "./models/event-class";
export type * from "./models/catalog";
export { EventType, SecretApprovalEvent, UserAgentType } from "./models/event-type";

export type TAuditLogDeps = {
  keyStore: TDomainKeyStore;
  // ClickHouse orders audit logs by id, so it needs time-ordered ids.
  useTimeOrderedIds: boolean;
};

// The recorder every domain records audit logs through. Built right after Events, before anything that records.
// Ingestion (draining the buffer into storage) is in ee/module.ts.
export class AuditLogModule {
  readonly auditLogRecorderService: TAuditLogRecorderService;

  constructor(deps: TAuditLogDeps) {
    this.auditLogRecorderService = new AuditLogRecorderService(
      new AuditLogBuffer(deps.keyStore),
      new AuditLogIdGenerator(deps.useTimeOrderedIds),
      new OtelMetricsClient()
    );
  }
}
