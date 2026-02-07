import { z } from "zod";

export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type ModalState = "connecting" | "connected" | "error" | "disconnected";

export const WebSocketServerMessageSchema = z.object({
  type: z.enum(["ready", "output"]),
  data: z.string(),
  prompt: z.string()
});

export type WebSocketServerMessage = z.infer<typeof WebSocketServerMessageSchema>;

export const WebSocketClientMessageSchema = z.object({
  type: z.enum(["input", "control"]),
  data: z.string()
});

export type WebSocketClientMessage = z.infer<typeof WebSocketClientMessageSchema>;

export type UseTerminalWebSocketOptions = {
  accountId: string;
  projectId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
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
