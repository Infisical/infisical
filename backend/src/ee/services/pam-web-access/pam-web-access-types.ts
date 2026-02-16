import { z } from "zod";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectServiceActor } from "@app/lib/types";

// Default session duration for web access sessions (1 hour in ms)
export const DEFAULT_WEB_SESSION_DURATION_MS = 60 * 60 * 1000;

// Maximum concurrent web access sessions per user per project
export const MAX_WEB_SESSIONS_PER_USER = 5;

// WebSocket ping interval (ms) — keeps ALB from killing idle connections (default 60s timeout)
export const WS_PING_INTERVAL_MS = 30000;

// Idle timeout (ms) — auto-close sessions with no user input/control messages
export const WS_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export enum WsMessageType {
  Ready = "ready",
  Output = "output",
  Input = "input",
  Control = "control",
  SessionEnd = "session_end"
}

export enum SessionEndReason {
  SessionCompleted = "Session duration complete. Connection closed.",
  UserQuit = "Goodbye!",
  ConnectionLost = "Database connection lost. Session ended.",
  SetupFailed = "Failed to establish database connection.",
  IdleTimeout = "Session closed due to inactivity."
}

const WebSocketOutputMessageSchema = z.object({
  type: z.enum([WsMessageType.Ready, WsMessageType.Output]),
  data: z.string(),
  prompt: z.string()
});

const WebSocketSessionEndMessageSchema = z.object({
  type: z.literal(WsMessageType.SessionEnd),
  reason: z.nativeEnum(SessionEndReason)
});

export const WebSocketServerMessageSchema = z.discriminatedUnion("type", [
  WebSocketOutputMessageSchema,
  WebSocketSessionEndMessageSchema
]);

export type TWebSocketServerMessage = z.infer<typeof WebSocketServerMessageSchema>;

export const WebSocketClientMessageSchema = z.object({
  type: z.enum([WsMessageType.Input, WsMessageType.Control]),
  data: z.string()
});

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
