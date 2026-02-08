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

export type WebSocketServerMessage = z.infer<typeof WebSocketServerMessageSchema>;

export const WebSocketClientMessageSchema = z.object({
  type: z.enum([WsMessageType.Input, WsMessageType.Control]),
  data: z.string()
});

export type WebSocketClientMessage = z.infer<typeof WebSocketClientMessageSchema>;

export type UseTerminalWebSocketOptions = {
  accountId: string;
  projectId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (data: WebSocketServerMessage) => void;
};

export type PamTerminalApi = {
  handleMessage: (message: WebSocketServerMessage) => void;
  writeToTerminal: (text: string) => void;
  clear: () => void;
  focus: () => void;
};

export type UsePamTerminalProps = {
  onInput: (data: string) => void;
  onReady?: (api: PamTerminalApi) => void;
};
