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

// --- Data Browser message schemas ---

export const DataBrowserClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pg-get-schemas"), id: z.string() }),
  z.object({ type: z.literal("pg-get-tables"), id: z.string(), schema: z.string() }),
  z.object({
    type: z.literal("pg-get-table-detail"),
    id: z.string(),
    schema: z.string(),
    table: z.string()
  }),
  z.object({ type: z.literal("pg-query"), id: z.string(), sql: z.string() })
]);

export type TDataBrowserClientMessage = z.infer<typeof DataBrowserClientMessageSchema>;

const DataBrowserSchemasMessageSchema = z.object({
  type: z.literal("pg-schemas"),
  id: z.string(),
  data: z.array(z.object({ name: z.string() }))
});

const DataBrowserTablesMessageSchema = z.object({
  type: z.literal("pg-tables"),
  id: z.string(),
  data: z.array(z.object({ name: z.string(), tableType: z.string() }))
});

const DataBrowserTableDetailMessageSchema = z.object({
  type: z.literal("pg-table-detail"),
  id: z.string(),
  data: z.object({
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        typeOid: z.number(),
        nullable: z.boolean(),
        defaultValue: z.string().nullable(),
        isIdentity: z.boolean(),
        identityGeneration: z.string().nullable(),
        isArray: z.boolean(),
        maxLength: z.number().nullable()
      })
    ),
    primaryKeys: z.array(z.string()),
    foreignKeys: z.array(
      z.object({
        constraintName: z.string(),
        columns: z.array(z.string()),
        targetSchema: z.string(),
        targetTable: z.string(),
        targetColumns: z.array(z.string())
      })
    ),
    enums: z.record(z.string(), z.array(z.string()))
  })
});

const DataBrowserQueryResultMessageSchema = z.object({
  type: z.literal("pg-query-result"),
  id: z.string(),
  rows: z.array(z.record(z.string(), z.unknown())),
  fields: z.array(
    z.object({
      name: z.string(),
      dataTypeID: z.number()
    })
  ),
  rowCount: z.number().nullable(),
  command: z.string(),
  executionTimeMs: z.number()
});

const DataBrowserErrorMessageSchema = z.object({
  type: z.literal("pg-error"),
  id: z.string(),
  error: z.string(),
  detail: z.string().optional(),
  hint: z.string().optional()
});

export const DataBrowserServerMessageSchema = z.discriminatedUnion("type", [
  DataBrowserSchemasMessageSchema,
  DataBrowserTablesMessageSchema,
  DataBrowserTableDetailMessageSchema,
  DataBrowserQueryResultMessageSchema,
  DataBrowserErrorMessageSchema
]);

export type TDataBrowserServerMessage = z.infer<typeof DataBrowserServerMessageSchema>;

export const parseDataBrowserClientMessage = (
  rawData: Buffer | ArrayBuffer | Buffer[]
): TDataBrowserClientMessage | null => {
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
  const result = DataBrowserClientMessageSchema.safeParse(parsed);
  return result.success ? result.data : null;
};

// --- End Data Browser schemas ---

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
