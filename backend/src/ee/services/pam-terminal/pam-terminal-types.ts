import { z } from "zod";

export enum WsMessageType {
  Ready = "ready",
  Output = "output",
  Input = "input",
  Control = "control"
}

export const WebSocketServerMessageSchema = z.object({
  type: z.enum([WsMessageType.Ready, WsMessageType.Output]),
  data: z.string(),
  prompt: z.string()
});

export type TWebSocketServerMessage = z.infer<typeof WebSocketServerMessageSchema>;

export const WebSocketClientMessageSchema = z.object({
  type: z.enum([WsMessageType.Input, WsMessageType.Control]),
  data: z.string()
});

export type TWebSocketClientMessage = z.infer<typeof WebSocketClientMessageSchema>;
