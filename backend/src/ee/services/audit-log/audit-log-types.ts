import {
  AuditLogActor,
  EventType,
  SecretApprovalEvent,
  UserAgentType
} from "@app/domains/platform/audit-log/ce/module";
import type {
  AcmeAccountActor,
  AcmeProfileActor,
  AgentVaultProxyActor,
  EstAccountActor,
  GatewayActor,
  IdentityActor,
  KmipClientActor,
  KmipServerActor,
  MicrosoftAutoenrollmentAccountActor,
  PermissionDeniedEvent,
  PlatformActor,
  RelayActor,
  ScepAccountActor,
  ScimClientActor,
  SecretFolderAccessEventMetadata,
  ServiceActor,
  TAuditLogActorRecord,
  TAuditLogRequestActorRecord,
  TAuditLogCollapseSummary,
  TAuditLogEvent,
  TMfaSatisfiedBy,
  TSsoUserEmailSyncSkipReason,
  UnknownUserActor,
  UserActor,
  WebhookTriggeredEvent
} from "@app/domains/platform/audit-log/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { TActorInput } from "@app/lib/types";

import type { AuditLogEventClass } from "./audit-log-event-classes";

export type TListProjectAuditLogDTO = {
  filter: {
    userAgentType?: UserAgentType;
    eventType?: EventType[];
    eventClass?: AuditLogEventClass[];
    offset?: number;
    limit: number;
    endDate: string;
    startDate: string;
    projectId?: string;
    environment?: string;
    auditLogActorId?: string;
    actorType?: ActorType;
    secretPath?: string;
    secretKey?: string;
    eventMetadata?: Record<string, string>;
  };
} & TActorInput;

export type TCreateAuditLogDTO = {
  event: Event;
  actor:
    | UserActor
    | IdentityActor
    | ServiceActor
    | ScimClientActor
    | PlatformActor
    | UnknownUserActor
    | KmipClientActor
    | AcmeProfileActor
    | AcmeAccountActor
    | EstAccountActor
    | ScepAccountActor
    | MicrosoftAutoenrollmentAccountActor
    | GatewayActor
    | RelayActor
    | KmipServerActor
    | AgentVaultProxyActor;
  orgId?: string;
  projectId?: string;
} & BaseAuthData;

export type AuditLogInfo = Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;

export type TCreateCollapsedAuditLogDTO = TCreateAuditLogDTO & {
  // Same event type + same parts inside the window = repeat.
  collapseKeyParts: unknown[];
  collapseWindowSeconds?: number;
};

export type TAuditLogCollapsedFlushJobData = TCreateAuditLogDTO & {
  collapseKey: string;
  windowStart: string;
  windowEnd: string;
};

export type TRecordPermissionDeniedDTO = AuditLogInfo & {
  orgId: string;
  projectId?: string;
  metadata: Omit<PermissionDeniedEvent["metadata"], keyof TAuditLogCollapseSummary>;
};

// What `pushToLog` writes to the Redis ingest stream. We pin `id` and `createdAt` at
// push time so a consumer retry (reprocessing the same batch after a failed insert)
// re-inserts byte-identical rows instead of regenerating ids and creating duplicates.
// `createdAt`/`expiresAt` are ISO strings for JSON round-tripping through the stream.
//
// org/plan/retention are also resolved at push time and travel with the entry, so the
// consumer persists it with no further DB lookups: `orgId` is the resolved org (never
// undefined for a streamed entry), `expiresAt` is the precomputed TTL boundary, and
// `projectName` is captured for project-scoped events (Postgres-only at insert time).
export type TAuditLogStreamEntry = TCreateAuditLogDTO & {
  id: string;
  createdAt: string;
  orgId: string;
  expiresAt: string;
  projectName?: string;
};

export type TAuditLogServiceFactory = {
  createAuditLog: (data: TCreateAuditLogDTO) => Promise<void>;
  createCollapsedAuditLog: (data: TCreateCollapsedAuditLogDTO) => Promise<void>;
  recordPermissionDenied: (data: TRecordPermissionDeniedDTO) => Promise<void>;
  listAuditLogs: (arg: TListProjectAuditLogDTO) => Promise<
    {
      event: {
        type: string;
        class: AuditLogEventClass;
        metadata: unknown;
      };
      actor: {
        type: string;
        metadata: unknown;
      };
      id: string;
      createdAt: Date;
      updatedAt: Date;
      orgId?: string | null | undefined;
      userAgent?: string | null | undefined;
      expiresAt?: Date | null | undefined;
      ipAddress?: string | null | undefined;
      userAgentType?: string | null | undefined;
      projectId?: string | null | undefined;
      projectName?: string | null | undefined;
    }[]
  >;
  getAuditLogPostgresStorageStatus: (arg: TActorInput) => Promise<{
    clickHouseConfigured: boolean;
    auditLogGenerationDisabled: boolean;
    auditLogStorageDisabled: boolean;
    auditLogRowCount: number;
  }>;
  checkPostgresAuditLogVolumeMigrationAlert: () => Promise<void>;
};

interface BaseAuthData {
  ipAddress?: string;
  userAgent?: string;
  userAgentType?: UserAgentType;
}

export { EventType, SecretApprovalEvent, UserAgentType };

export const ACTOR_TYPE_TO_METADATA_ID_KEY = AuditLogActor.METADATA_ID_KEYS;
export type {
  PermissionDeniedEvent,
  SecretFolderAccessEventMetadata,
  TAuditLogCollapseSummary,
  TMfaSatisfiedBy,
  TSsoUserEmailSyncSkipReason,
  WebhookTriggeredEvent,
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
  UnknownUserActor,
  UserActor
};
export type Actor = TAuditLogActorRecord;
export type RequestActor = TAuditLogRequestActorRecord;

export const filterableSecretEvents: EventType[] = [
  EventType.GET_SECRET,
  EventType.GET_SECRETS,
  EventType.DELETE_SECRETS,
  EventType.CREATE_SECRETS,
  EventType.UPDATE_SECRETS,
  EventType.CREATE_SECRET,
  EventType.UPDATE_SECRET,
  EventType.DELETE_SECRET
];

export type Event = TAuditLogEvent;
