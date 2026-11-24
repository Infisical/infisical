import { ActorType } from "@app/services/auth/auth-type";

// A shared prefix separates these from PAM audit events like pam-session-start.
export const PAM_SESSION_ACTIVITY_EVENT_TYPE_PREFIX = "pam-session-activity-";

export enum PamSessionActivityEventType {
  Command = "pam-session-activity-command",
  Query = "pam-session-activity-query",
  Request = "pam-session-activity-request",
  Output = "pam-session-activity-output",
  Response = "pam-session-activity-response",
  Skipped = "pam-session-activity-skipped"
}

export enum PamSessionActivitySkipReason {
  ChunkTooLarge = "chunk-too-large",
  TooManyEvents = "too-many-events",
  ExportFailed = "export-failed"
}

export type TPamSessionActivityMetadata = {
  sessionId: string;
  accountId: string | null;
  accountName: string;
  accountType: string;
  folderName: string | null;
  host: string | null;
  channel?: string;
  command?: string;
  query?: string;
  blocked?: boolean;
  requestId?: string;
  method?: string;
  url?: string;
  status?: string;
  chunkIndex?: number;
  reason?: PamSessionActivitySkipReason;
  skippedEvents?: number;
  // Streams that don't include output receive the event without these two.
  output?: string;
  body?: string;
};

// Mirrors audit log rows so a SIEM's audit log rules also parse these.
export type TPamSessionActivityEvent = {
  id: string;
  createdAt: string;
  orgId: string;
  projectId: string;
  actor: ActorType.USER | ActorType.IDENTITY;
  actorMetadata:
    | { userId: string | null; email: string | null; username: string }
    | { identityId: string | null; name: string };
  ipAddress: string | null;
  userAgent: string | null;
  eventType: PamSessionActivityEventType;
  eventMetadata: TPamSessionActivityMetadata;
};
