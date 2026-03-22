import type WebSocket from "ws";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectServiceActor } from "@app/lib/types";

import { type SessionEndReason, type TWsTerminalServerMessage } from "./pam-ws-shared-types";

// Re-export shared enums for convenience (used by pam-web-access-service.ts)
export type { TWsTerminalServerMessage as TWebSocketServerMessage } from "./pam-ws-shared-types";
export { SessionEndReason, WsMessageType } from "./pam-ws-shared-types";
export { WsTerminalServerMessageSchema as WebSocketServerMessageSchema } from "./pam-ws-shared-types";

// Default session duration for web access sessions (1 hour in ms)
export const DEFAULT_WEB_SESSION_DURATION_MS = 60 * 60 * 1000;

// Maximum concurrent web access sessions per user per project
export const MAX_WEB_SESSIONS_PER_USER = 5;

// WebSocket ping interval (ms) — keeps ALB from killing idle connections (default 60s timeout)
export const WS_PING_INTERVAL_MS = 30000;

// Idle timeout (ms) — auto-close sessions with no user input/control messages
export const WS_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export type TSessionContext = {
  socket: WebSocket;
  relayPort: number;
  resourceName: string;
  sessionId: string;
  sendMessage: (msg: TWsTerminalServerMessage) => void;
  sendSessionEnd: (reason: SessionEndReason) => void;
  isNearSessionExpiry: () => boolean;
  onCleanup: () => void;
};

export type TSessionHandlerResult = {
  cleanup: () => Promise<void>;
};

export type TIssueWebSocketTicketDTO = {
  accountId: string;
  projectId: string;
  orgId: string;
  actor: ProjectServiceActor;
  actorEmail: string;
  actorName: string;
  auditLogInfo: AuditLogInfo;
  mfaSessionId?: string;
};
