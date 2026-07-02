import type WebSocket from "ws";
import { z } from "zod";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectServiceActor } from "@app/lib/types";

export enum SessionEndReason {
  SessionCompleted = "Session duration complete",
  UserQuit = "Goodbye",
  ConnectionLost = "Connection lost",
  SetupFailed = "Failed to establish connection",
  IdleTimeout = "Session closed due to inactivity",
  SessionLimitReached = "Maximum concurrent sessions reached"
}

export enum TerminalServerMessageType {
  Ready = "ready",
  Output = "output",
  SessionEnd = "session_end"
}

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

export const DEFAULT_WEB_SESSION_DURATION_MS = 60 * 60 * 1000;
export const MAX_WEB_SESSIONS_PER_USER = 5;
export const WS_PING_INTERVAL_MS = 30000;
export const WS_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export type TEarlyBufferedMsg = { data: Buffer; isBinary: boolean };

export type TSessionContext = {
  socket: WebSocket;
  relayPort: number;
  resourceName: string;
  sessionId: string;
  sendMessage: (msg: TWebSocketServerMessage) => void;
  sendSessionEnd: (reason: SessionEndReason) => void;
  isNearSessionExpiry: () => boolean;
  onCleanup: () => void;
  earlyMessages: TEarlyBufferedMsg[];
  releaseEarlyBuffer: () => void;
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
  reason?: string;
  mfaSessionId?: string;
  selectedHost?: string;
};
