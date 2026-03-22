import { z } from "zod";

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

export const resolveEndReason = (isNearSessionExpiry: () => boolean): SessionEndReason =>
  isNearSessionExpiry() ? SessionEndReason.SessionCompleted : SessionEndReason.ConnectionLost;

// --- Shared server message schemas (used by all resource types) ---

export const WsOutputMessageSchema = z.object({
  type: z.enum([WsMessageType.Ready, WsMessageType.Output]),
  data: z.string(),
  prompt: z.string().default("")
});

export const WsSessionEndMessageSchema = z.object({
  type: z.literal(WsMessageType.SessionEnd),
  reason: z.nativeEnum(SessionEndReason)
});

export const WsTerminalServerMessageSchema = z.discriminatedUnion("type", [
  WsOutputMessageSchema,
  WsSessionEndMessageSchema
]);

export type TWsTerminalServerMessage = z.input<typeof WsTerminalServerMessageSchema>;

// --- Utility ---

export const rawBufferToString = (rawData: Buffer | ArrayBuffer | Buffer[]): string => {
  if (Buffer.isBuffer(rawData)) return rawData.toString();
  if (Array.isArray(rawData)) return Buffer.concat(rawData).toString();
  return Buffer.from(rawData).toString();
};
