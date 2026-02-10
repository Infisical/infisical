import { z } from "zod";

export enum WsMessageType {
  Ready = "ready",
  Output = "output",
  Input = "input",
  Control = "control",
  SessionEnd = "session_end"
}

const WebSocketOutputMessageSchema = z.object({
  type: z.enum([WsMessageType.Ready, WsMessageType.Output]),
  data: z.string(),
  prompt: z.string()
});

const WebSocketSessionEndMessageSchema = z.object({
  type: z.literal(WsMessageType.SessionEnd),
  reason: z.string()
});

export const WebSocketServerMessageSchema = z.discriminatedUnion("type", [
  WebSocketOutputMessageSchema,
  WebSocketSessionEndMessageSchema
]);
