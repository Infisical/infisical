import type WebSocket from "ws";
import { z } from "zod";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectServiceActor } from "@app/lib/types";

export enum SessionEndReason {
  SessionCompleted = "Session duration complete. Connection closed.",
  UserQuit = "Goodbye!",
  ConnectionLost = "Connection lost. Session ended.",
  SetupFailed = "Failed to establish connection.",
  IdleTimeout = "Session closed due to inactivity.",
  SessionLimitReached = "Maximum concurrent sessions reached. Please close an existing session first."
}

export enum TerminalServerMessageType {
  Ready = "ready",
  Output = "output",
  SessionEnd = "session_end"
}

// Terminal server message schema — used by TSessionContext.sendMessage
export const WebSocketServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum([TerminalServerMessageType.Ready, TerminalServerMessageType.Output]),
    data: z.string(),
    prompt: z.string().default("")
  }),
  z.object({
    type: z.literal(TerminalServerMessageType.SessionEnd),
    reason: z.nativeEnum(SessionEndReason)
  })
]);

export type TWebSocketServerMessage = z.input<typeof WebSocketServerMessageSchema>;

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
  sendMessage: (msg: TWebSocketServerMessage) => void;
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
