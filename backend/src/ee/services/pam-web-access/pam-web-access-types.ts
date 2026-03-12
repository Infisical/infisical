import type WebSocket from "ws";
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
  Resize = "resize",
  SessionEnd = "session_end"
}

export enum SessionEndReason {
  SessionCompleted = "Session duration complete. Connection closed.",
  UserQuit = "Goodbye!",
  ConnectionLost = "Connection lost. Session ended.",
  SetupFailed = "Failed to establish connection.",
  IdleTimeout = "Session closed due to inactivity."
}

const WebSocketOutputMessageSchema = z.object({
  type: z.enum([WsMessageType.Ready, WsMessageType.Output]),
  data: z.string(),
  prompt: z.string().default("")
});

const WebSocketSessionEndMessageSchema = z.object({
  type: z.literal(WsMessageType.SessionEnd),
  reason: z.nativeEnum(SessionEndReason)
});

export const WebSocketServerMessageSchema = z.discriminatedUnion("type", [
  WebSocketOutputMessageSchema,
  WebSocketSessionEndMessageSchema
]);

export type TWebSocketServerMessage = z.input<typeof WebSocketServerMessageSchema>;

export const WebSocketClientMessageSchema = z.object({
  type: z.enum([WsMessageType.Input, WsMessageType.Control, WsMessageType.Resize]),
  data: z.string()
});

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

export const resolveEndReason = (isNearSessionExpiry: () => boolean): SessionEndReason =>
  isNearSessionExpiry() ? SessionEndReason.SessionCompleted : SessionEndReason.ConnectionLost;

export const parseWsClientMessage = (
  rawData: Buffer | ArrayBuffer | Buffer[]
): z.infer<typeof WebSocketClientMessageSchema> | null => {
  let data: string;
  if (Buffer.isBuffer(rawData)) data = rawData.toString();
  else if (Array.isArray(rawData)) data = Buffer.concat(rawData).toString();
  else data = Buffer.from(rawData).toString();

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const result = WebSocketClientMessageSchema.safeParse(parsed);
  return result.success ? result.data : null;
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
